import type { Firestore } from 'firebase-admin/firestore';
import type { ServiceabilityChecker } from '@/types/b2b/ports';
import type { ServiceabilityResult } from '@/types/b2b/quote';
import type { CourierCode } from '@/types/b2b/shipment';
import { getLogger } from '@/services/b2b/http/logger';
import { COLLECTIONS } from './collections';

// Two implementations:
//
//   InMemoryServiceabilityChecker — for tests and early production with a
//   small statically-loaded pincode list. Boot-time load; in-memory Set;
//   O(1) check.
//
//   FirestoreServiceabilityChecker — production at scale. Reads
//   b2b_serviceability/{courier}__{pincode} on cache miss. Per-process
//   LRU cache with 24h TTL keeps Firestore reads to first-hit only.
//
// Default policy when no data exists for a (courier, pincode): the carrier
// is assumed serviceable. The carrier will reject at quote/book time with
// a permanent error, which surfaces as `not_eligible` in the QuoteResponse.
// Failing closed here would silently exclude carriers from new lanes —
// failing open lets the carrier be the authority.

const log = getLogger('b2b.serviceability');

// ─── In-memory implementation ──────────────────────────────────────────

export class InMemoryServiceabilityChecker implements ServiceabilityChecker {
    private readonly serviceable = new Map<CourierCode, Set<string>>();

    // Seed with a list of serviceable pincodes per carrier.
    seed(courier: CourierCode, pincodes: readonly string[]): void {
        if (!this.serviceable.has(courier)) this.serviceable.set(courier, new Set());
        const set = this.serviceable.get(courier)!;
        for (const p of pincodes) set.add(p);
    }

    async check(
        courier: CourierCode,
        originPincode: string,
        destinationPincode: string,
    ): Promise<ServiceabilityResult> {
        const set = this.serviceable.get(courier);
        if (!set || set.size === 0) {
            // No data — fail open. Carrier becomes the authority.
            return { serviceable: true };
        }
        const oOk = set.has(originPincode);
        const dOk = set.has(destinationPincode);
        if (oOk && dOk) return { serviceable: true };
        return {
            serviceable: false,
            reason: !oOk && !dOk
                ? 'Both pincodes not in carrier network'
                : !oOk
                    ? `Origin pincode ${originPincode} not in carrier network`
                    : `Destination pincode ${destinationPincode} not in carrier network`,
        };
    }

    clear(): void {
        this.serviceable.clear();
    }
}

// ─── Firestore implementation with LRU cache ───────────────────────────

const DEFAULT_CACHE_SIZE = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
    readonly serviceable: boolean;
    readonly expiresAt: number;
}

export class FirestoreServiceabilityChecker implements ServiceabilityChecker {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly cacheSize: number;

    constructor(
        private readonly db: Firestore,
        opts: { cacheSize?: number } = {},
    ) {
        this.cacheSize = opts.cacheSize ?? DEFAULT_CACHE_SIZE;
    }

    async check(
        courier: CourierCode,
        originPincode: string,
        destinationPincode: string,
    ): Promise<ServiceabilityResult> {
        const [oOk, dOk] = await Promise.all([
            this.isPincodeServiceable(courier, originPincode),
            this.isPincodeServiceable(courier, destinationPincode),
        ]);
        if (oOk && dOk) return { serviceable: true };
        if (oOk === null && dOk === null) {
            // No data — fail open per policy.
            return { serviceable: true };
        }
        return {
            serviceable: false,
            reason: !oOk
                ? `Origin pincode ${originPincode} not in carrier network`
                : `Destination pincode ${destinationPincode} not in carrier network`,
        };
    }

    private async isPincodeServiceable(
        courier: CourierCode,
        pincode: string,
    ): Promise<boolean | null> {
        const key = `${courier}__${pincode}`;
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.serviceable;

        try {
            const doc = await this.db
                .collection(COLLECTIONS.B2B_SERVICEABILITY)
                .doc(key)
                .get();
            if (!doc.exists) {
                // No data — null is "unknown", caller treats as fail-open.
                return null;
            }
            const data = doc.data() as { serviceable?: boolean };
            const result = data.serviceable !== false;
            this.cacheSet(key, result);
            return result;
        } catch (err) {
            log.warn('serviceability lookup failed', {
                courier,
                pincode,
                error: err instanceof Error ? err.message : String(err),
            });
            // Network/permission error → fail open. Don't block bookings on
            // a flaky lookup table.
            return null;
        }
    }

    private cacheSet(key: string, serviceable: boolean): void {
        if (this.cache.size >= this.cacheSize) {
            // Naive LRU: remove the oldest insertion. Maps preserve insertion
            // order so deleting the first key is O(1).
            const first = this.cache.keys().next().value;
            if (first !== undefined) this.cache.delete(first);
        }
        this.cache.set(key, {
            serviceable,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
    }
}
