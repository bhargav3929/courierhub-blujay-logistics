import { describe, it, expect, beforeEach } from 'vitest';
import {
    commitIdempotency,
    computeRequestHash,
    reserveIdempotency,
    validateIdempotencyKey,
} from '../idempotency';
import { PartnerId } from '../../../../../types/b2b/ids';
import type {
    IdempotencyCommitInput,
    IdempotencyReserveInput,
    IdempotencyReserveResult,
    IdempotencyStore,
} from '../../../../../types/b2b/ports';

// ─── In-memory idempotency store for unit tests ─────────────────────────

interface StoredRow {
    requestHash: string;
    status: 'in_progress' | 'committed';
    response?: { httpStatus: number; body: unknown };
}

class InMemoryIdempotencyStore implements IdempotencyStore {
    public readonly rows = new Map<string, StoredRow>();

    private key(partnerId: string, key: string): string {
        return `${partnerId}::${key}`;
    }

    async reserve(input: IdempotencyReserveInput): Promise<IdempotencyReserveResult> {
        const k = this.key(input.partnerId, input.key);
        const existing = this.rows.get(k);
        if (!existing) {
            this.rows.set(k, { requestHash: input.requestHash, status: 'in_progress' });
            return { state: 'reserved' };
        }
        if (existing.requestHash !== input.requestHash) {
            return { state: 'mismatch' };
        }
        if (existing.status === 'committed' && existing.response) {
            return { state: 'committed', response: existing.response };
        }
        return { state: 'in_progress' };
    }

    async commit(input: IdempotencyCommitInput): Promise<void> {
        const k = this.key(input.partnerId, input.key);
        const existing = this.rows.get(k);
        if (!existing) throw new Error('commit before reserve');
        existing.status = 'committed';
        existing.response = input.response;
    }
}

const PARTNER = PartnerId('p_1');

// ─── computeRequestHash ─────────────────────────────────────────────────

describe('computeRequestHash', () => {
    it('is deterministic for identical inputs', () => {
        const a = computeRequestHash('POST', '/api/x', { foo: 1 });
        const b = computeRequestHash('POST', '/api/x', { foo: 1 });
        expect(a).toBe(b);
    });

    it('differs for different bodies', () => {
        const a = computeRequestHash('POST', '/api/x', { foo: 1 });
        const b = computeRequestHash('POST', '/api/x', { foo: 2 });
        expect(a).not.toBe(b);
    });

    it('differs for different paths', () => {
        const a = computeRequestHash('POST', '/api/x', { foo: 1 });
        const b = computeRequestHash('POST', '/api/y', { foo: 1 });
        expect(a).not.toBe(b);
    });

    it('returns a sha256 hex string', () => {
        const a = computeRequestHash('POST', '/api/x', { foo: 1 });
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });
});

// ─── validateIdempotencyKey ─────────────────────────────────────────────

describe('validateIdempotencyKey', () => {
    it('accepts alphanumeric, dash, underscore, colon, dot', () => {
        expect(validateIdempotencyKey('abc123')).toBe(true);
        expect(validateIdempotencyKey('req-123_456:abc.def')).toBe(true);
    });

    it('rejects empty string', () => {
        expect(validateIdempotencyKey('')).toBe(false);
    });

    it('rejects keys over 200 chars', () => {
        expect(validateIdempotencyKey('x'.repeat(201))).toBe(false);
    });

    it('rejects unusual characters', () => {
        expect(validateIdempotencyKey('with space')).toBe(false);
        expect(validateIdempotencyKey('with/slash')).toBe(false);
        expect(validateIdempotencyKey('with@symbol')).toBe(false);
    });
});

// ─── reserveIdempotency / commitIdempotency ─────────────────────────────

describe('reserveIdempotency + commitIdempotency', () => {
    let store: InMemoryIdempotencyStore;
    beforeEach(() => { store = new InMemoryIdempotencyStore(); });

    const hash = (body: unknown) => computeRequestHash('POST', '/p', body);

    it('first reserve returns proceed', async () => {
        const r = await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        expect(r.kind).toBe('proceed');
    });

    it('second reserve before commit returns in_progress', async () => {
        await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        const r2 = await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        expect(r2.kind).toBe('in_progress');
    });

    it('reserve after commit returns replay with cached body', async () => {
        await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        await commitIdempotency(store, PARTNER, 'k1', 200, { data: 'success' });
        const r = await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        expect(r.kind).toBe('replay');
        if (r.kind === 'replay') {
            expect(r.response.httpStatus).toBe(200);
            expect(r.response.body).toEqual({ data: 'success' });
        }
    });

    it('same key, different body returns mismatch', async () => {
        await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        const r = await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 2 }));
        expect(r.kind).toBe('mismatch');
    });

    it('different keys are independent', async () => {
        await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        const r = await reserveIdempotency(store, PARTNER, 'k2', hash({ a: 1 }));
        expect(r.kind).toBe('proceed');
    });

    it('replay preserves the original HTTP status (e.g. 409)', async () => {
        await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        await commitIdempotency(store, PARTNER, 'k1', 409, { error: { code: 'state_transition_forbidden' } });
        const r = await reserveIdempotency(store, PARTNER, 'k1', hash({ a: 1 }));
        expect(r.kind).toBe('replay');
        if (r.kind === 'replay') {
            expect(r.response.httpStatus).toBe(409);
        }
    });
});
