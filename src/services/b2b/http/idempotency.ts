import crypto from 'node:crypto';
import type { PartnerId } from '@/types/b2b/ids';
import type { CachedResponse, IdempotencyStore } from '@/types/b2b/ports';

// Defaults
export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_KEY_LENGTH = 200;
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]+$/;

export type IdempotencyOutcome =
    | { kind: 'proceed' }
    | { kind: 'replay'; response: CachedResponse }
    | { kind: 'in_progress' }
    | { kind: 'mismatch' };

// Stable hash of the request shape. Used to detect that a partner reused an
// Idempotency-Key with a different body. Body is serialized via JSON; any
// non-deterministic field on the partner's side (e.g. Date.now()) WILL trip
// the mismatch detector — that is the intended semantic.
export function computeRequestHash(
    method: string,
    path: string,
    body: unknown,
): string {
    const serialized = JSON.stringify({ method, path, body });
    return crypto.createHash('sha256').update(serialized).digest('hex');
}

// Reject keys outside [1, 200] chars or containing unusual characters. The
// pattern is the union of Stripe's (alnum) and a couple of separators
// partners commonly use (`-`, `_`, `:`, `.`).
export function validateIdempotencyKey(key: string): boolean {
    if (!key || key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
    return KEY_PATTERN.test(key);
}

export async function reserveIdempotency(
    store: IdempotencyStore,
    partnerId: PartnerId,
    key: string,
    requestHash: string,
    ttlSeconds: number = DEFAULT_IDEMPOTENCY_TTL_SECONDS,
): Promise<IdempotencyOutcome> {
    const r = await store.reserve({ partnerId, key, requestHash, ttlSeconds });
    switch (r.state) {
        case 'reserved':    return { kind: 'proceed' };
        case 'committed':   return { kind: 'replay', response: r.response };
        case 'in_progress': return { kind: 'in_progress' };
        case 'mismatch':    return { kind: 'mismatch' };
    }
}

export async function commitIdempotency(
    store: IdempotencyStore,
    partnerId: PartnerId,
    key: string,
    httpStatus: number,
    body: unknown,
): Promise<void> {
    await store.commit({
        partnerId,
        key,
        response: { httpStatus, body },
    });
}
