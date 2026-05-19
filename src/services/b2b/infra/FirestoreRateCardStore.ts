import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { ClientId, PartnerId } from '@/types/b2b/ids';
import type {
    MarkupRule,
    RateCard,
} from '@/types/b2b/pricing';
import type { RateCardStore } from '@/types/b2b/ports';
import { getLogger } from '@/services/b2b/http/logger';
import { COLLECTIONS } from './collections';

// Process-cached rate card lookup.
//
// Cache key: `${partnerId}::${clientId ?? '_default'}`
// TTL: 60s (configurable via constructor). Partners updating a card see
// new pricing within 60s without us listening to Firestore changes.
//
// Selection rule:
//   1. Match by partnerId
//   2. Prefer client-specific over partner-default (clientId === null)
//   3. activeFrom <= now AND (activeUntil === null OR activeUntil > now)
//   4. Highest version wins on ties

const DEFAULT_CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
    readonly card: RateCard | null;
    readonly expiresAt: number;
}

interface StoredRateCard {
    id: string;
    partnerId: string;
    clientId: string | null;
    name: string;
    version: number;
    rules: MarkupRule[];
    activeFrom: Timestamp;
    activeUntil: Timestamp | null;
}

const log = getLogger('b2b.ratecard.store');

export class FirestoreRateCardStore implements RateCardStore {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly cacheTtlMs: number;

    constructor(
        private readonly db: Firestore,
        opts: { cacheTtlMs?: number } = {},
    ) {
        this.cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    }

    async findActive(
        partnerId: PartnerId,
        clientId: ClientId | null,
        at: Date,
    ): Promise<RateCard | null> {
        const key = `${partnerId}::${clientId ?? '_default'}`;
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.card;
        }

        const card = await this.findActiveFromFirestore(partnerId, clientId, at);
        this.cache.set(key, {
            card,
            expiresAt: Date.now() + this.cacheTtlMs,
        });
        return card;
    }

    private async findActiveFromFirestore(
        partnerId: PartnerId,
        clientId: ClientId | null,
        at: Date,
    ): Promise<RateCard | null> {
        const nowTs = Timestamp.fromDate(at);
        // Two parallel queries: client-specific + partner-default.
        // Firestore can't OR across (clientId === X OR clientId === null)
        // in one query, so we run them in parallel and merge.
        const [clientCards, defaultCards] = await Promise.all([
            clientId
                ? this.queryActive(partnerId, clientId, nowTs)
                : Promise.resolve<RateCard[]>([]),
            this.queryActive(partnerId, null, nowTs),
        ]);

        const candidates = [...clientCards, ...defaultCards].filter((c) =>
            !c.activeUntil || c.activeUntil > at,
        );
        if (candidates.length === 0) return null;

        // Prefer client-specific over default; then highest version.
        candidates.sort((a, b) => {
            const aSpecific = a.clientId !== undefined && a.clientId !== null ? 1 : 0;
            const bSpecific = b.clientId !== undefined && b.clientId !== null ? 1 : 0;
            if (aSpecific !== bSpecific) return bSpecific - aSpecific;
            return b.version - a.version;
        });
        return candidates[0];
    }

    private async queryActive(
        partnerId: PartnerId,
        clientId: ClientId | null,
        nowTs: Timestamp,
    ): Promise<RateCard[]> {
        try {
            let q = this.db
                .collection(COLLECTIONS.B2B_RATE_CARDS)
                .where('partnerId', '==', partnerId)
                .where('activeFrom', '<=', nowTs);
            q = clientId
                ? q.where('clientId', '==', clientId)
                : q.where('clientId', '==', null);

            const snap = await q.orderBy('activeFrom', 'desc').limit(20).get();
            return snap.docs.map((d) => this.fromFirestore(d.id, d.data() as StoredRateCard));
        } catch (err) {
            log.error('rate card query failed', {
                partnerId,
                clientId: clientId ?? null,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
    }

    private fromFirestore(id: string, data: StoredRateCard): RateCard {
        return {
            id,
            partnerId: data.partnerId as PartnerId,
            clientId: (data.clientId ?? undefined) as ClientId | undefined,
            name: data.name,
            version: data.version,
            rules: data.rules,
            activeFrom: data.activeFrom.toDate(),
            activeUntil: data.activeUntil ? data.activeUntil.toDate() : null,
        };
    }

    // Test helper.
    _clearCache(): void {
        this.cache.clear();
    }
}
