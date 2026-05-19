import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreShipmentWriter } from '../FirestoreShipmentWriter';
import {
    BOOKING_SAGA_DATE_FIELDS,
    FirestoreSagaCheckpointStore,
} from '../FirestoreSagaCheckpointStore';
import { ApiKeyId, PartnerId } from '../../../../types/b2b/ids';
import type { SagaCheckpoint } from '../../../../types/b2b/saga';

// ─── Tiny Firestore mock (only the surface these adapters use) ─────────

class MockStore {
    public readonly docs = new Map<string, Record<string, unknown>>();
}

class MockDocRef {
    constructor(public readonly path: string, private readonly store: MockStore) {}
    async get() {
        const data = this.store.docs.get(this.path);
        return {
            exists: data !== undefined,
            id: this.path.split('/').pop() ?? '',
            data: () => (data ? deepClone(data) : undefined),
        };
    }
    async create(data: Record<string, unknown>): Promise<void> {
        if (this.store.docs.has(this.path)) {
            const err = new Error('already exists') as Error & { code: number };
            err.code = 6;
            throw err;
        }
        this.store.docs.set(this.path, deepClone(data));
    }
    async set(data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void> {
        if (opts?.merge && this.store.docs.has(this.path)) {
            const merged = { ...this.store.docs.get(this.path)!, ...data };
            this.store.docs.set(this.path, deepClone(merged));
        } else {
            this.store.docs.set(this.path, deepClone(data));
        }
    }
    async update(data: Record<string, unknown>): Promise<void> {
        const existing = this.store.docs.get(this.path);
        if (!existing) {
            const err = new Error('not found') as Error & { code: number };
            err.code = 5;
            throw err;
        }
        this.store.docs.set(this.path, applyUpdate(existing, data));
    }
}

class MockCollectionRef {
    constructor(public readonly path: string, private readonly store: MockStore) {}
    doc(id: string) { return new MockDocRef(`${this.path}/${id}`, this.store); }
}

class MockTransaction {
    private readonly pending: Array<() => Promise<void>> = [];
    constructor(private readonly store: MockStore) {}
    async get(ref: MockDocRef) { return ref.get(); }
    create(ref: MockDocRef, data: Record<string, unknown>) {
        this.pending.push(() => ref.create(data));
    }
    update(ref: MockDocRef, data: Record<string, unknown>) {
        this.pending.push(() => ref.update(data));
    }
    async commit() { for (const w of this.pending) await w(); }
}

class MockFirestore {
    public readonly store = new MockStore();
    collection(name: string) { return new MockCollectionRef(name, this.store); }
    async runTransaction<T>(fn: (tx: MockTransaction) => Promise<T>): Promise<T> {
        const tx = new MockTransaction(this.store);
        const r = await fn(tx);
        await tx.commit();
        return r;
    }
}

function deepClone<T>(v: T): T {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (v instanceof Date) return new Date(v.getTime()) as unknown as T;
    const ctor = (v as { constructor?: { name?: string } }).constructor;
    if (ctor && ctor.name && ctor.name !== 'Object' && !Array.isArray(v)) return v;
    if (Array.isArray(v)) return v.map(deepClone) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
        out[k] = deepClone((v as Record<string, unknown>)[k]);
    }
    return out as T;
}

function applyUpdate(existing: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
    const result = deepClone(existing);
    for (const [key, value] of Object.entries(update)) {
        setNested(result, key, value);
    }
    return result;
}

function setNested(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cur: Record<string, unknown> = target;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const next = cur[part];
        if (next === undefined || next === null || typeof next !== 'object') cur[part] = {};
        cur = cur[part] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
}

function asFirestore(mock: MockFirestore): Firestore {
    return mock as unknown as Firestore;
}

// ─── FirestoreShipmentWriter ────────────────────────────────────────────

describe('FirestoreShipmentWriter.createDraft', () => {
    let mock: MockFirestore;
    let writer: FirestoreShipmentWriter;

    beforeEach(() => {
        mock = new MockFirestore();
        writer = new FirestoreShipmentWriter(asFirestore(mock));
    });

    const validInput = () => ({
        partnerId: PartnerId('p_1'),
        idempotencyKey: 'idem_001',
        apiKeyId: ApiKeyId('k_1'),
        fulfillmentMode: 'courier' as const,
        trackingMode: 'automatic' as const,
        origin: {
            name: 'A', phone: '+919876543210', line1: '1',
            city: 'Bengaluru', state: 'KA', pincode: '560001', country: 'IN',
        },
        destination: {
            name: 'B', phone: '+919876500000', line1: '1',
            city: 'Delhi', state: 'DL', pincode: '110001', country: 'IN',
        },
        parcel: {
            weightGrams: 500,
            dimensionsCm: { length: 20, width: 15, height: 10 },
            declaredValuePaise: 50_000,
            contents: 't', isCod: false, codAmountPaise: 0,
        },
    });

    it('creates a new draft shipment + idempotency index entry', async () => {
        const r = await writer.createDraft(validInput());
        expect(r.created).toBe(true);
        if (r.created) {
            expect(r.shipmentId).toMatch(/^ship_/);
            // Both docs exist
            expect(mock.store.docs.has(`shipments/${r.shipmentId}`)).toBe(true);
            expect(mock.store.docs.has(`b2b_shipment_idempotency_index/p_1__idem_001`)).toBe(true);
        }
    });

    it('returns the existing shipmentId on retry with the same idempotency key', async () => {
        const first = await writer.createDraft(validInput());
        const second = await writer.createDraft(validInput());
        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        if (first.created && !second.created) {
            expect(second.existingShipmentId).toBe(first.shipmentId);
        }
        // Only ONE shipment doc, only ONE index doc.
        const shipmentCount = [...mock.store.docs.keys()].filter(k => k.startsWith('shipments/')).length;
        expect(shipmentCount).toBe(1);
    });

    it('different idempotency keys produce different shipments', async () => {
        const r1 = await writer.createDraft({ ...validInput(), idempotencyKey: 'a' });
        const r2 = await writer.createDraft({ ...validInput(), idempotencyKey: 'b' });
        expect(r1.created && r2.created).toBe(true);
        if (r1.created && r2.created) {
            expect(r1.shipmentId).not.toBe(r2.shipmentId);
        }
    });

    it('writes status="draft" with stateVersion=0', async () => {
        const r = await writer.createDraft(validInput());
        if (r.created) {
            const doc = mock.store.docs.get(`shipments/${r.shipmentId}`);
            expect(doc?.status).toBe('draft');
            expect(doc?.stateVersion).toBe(0);
            expect(doc?.shipmentSource).toBe('b2b_api');
            expect(doc?.awaitingCarrierReconciliation).toBe(false);
        }
    });
});

describe('FirestoreShipmentWriter.markAwaitingReconciliation', () => {
    let mock: MockFirestore;
    let writer: FirestoreShipmentWriter;

    beforeEach(() => {
        mock = new MockFirestore();
        writer = new FirestoreShipmentWriter(asFirestore(mock));
    });

    it('sets the flag and stores attempt metadata', async () => {
        // Seed a shipment to update
        mock.store.docs.set('shipments/ship_x', {
            partnerId: 'p_1',
            status: 'draft',
            stateVersion: 0,
            awaitingCarrierReconciliation: false,
        });
        const nextAt = new Date('2026-05-15T11:00:00Z');
        await writer.markAwaitingReconciliation({
            partnerId: PartnerId('p_1'),
            shipmentId: 'ship_x' as never,
            courier: 'bluedart',
            referenceNumber: 'ship_x',
            attempts: 1,
            nextAttemptAt: nextAt,
            lastError: 'gateway timeout',
        });
        const doc = mock.store.docs.get('shipments/ship_x') as Record<string, unknown>;
        expect(doc.awaitingCarrierReconciliation).toBe(true);
        expect(doc.reconcileAttempts).toBe(1);
        expect(doc.reconcileCourier).toBe('bluedart');
        expect(doc.reconcileLastError).toBe('gateway timeout');
    });
});

// ─── FirestoreSagaCheckpointStore ───────────────────────────────────────

interface TestState {
    a: number;
    b: string;
    quotedAt: Date;
}

describe('FirestoreSagaCheckpointStore', () => {
    let mock: MockFirestore;
    let store: FirestoreSagaCheckpointStore<TestState>;

    beforeEach(() => {
        mock = new MockFirestore();
        store = new FirestoreSagaCheckpointStore<TestState>(
            asFirestore(mock),
            ['quotedAt'],
        );
    });

    const initialState = (): TestState => ({
        a: 0,
        b: 'init',
        quotedAt: new Date('2026-05-15T10:00:00Z'),
    });

    it('loadOrCreate returns exists=false and creates the doc on first call', async () => {
        const { exists, checkpoint } = await store.loadOrCreate('saga_1', initialState());
        expect(exists).toBe(false);
        expect(checkpoint.status).toBe('in_progress');
        expect(checkpoint.stepIndex).toBe(0);
        expect(mock.store.docs.has('b2b_sagas/saga_1')).toBe(true);
    });

    it('loadOrCreate returns exists=true on second call', async () => {
        await store.loadOrCreate('saga_1', initialState());
        const second = await store.loadOrCreate('saga_1', initialState());
        expect(second.exists).toBe(true);
    });

    it('save and load round-trip preserves state and revives Date fields', async () => {
        await store.loadOrCreate('saga_2', initialState());
        const advanced: SagaCheckpoint<TestState> = {
            sagaId: 'saga_2',
            stepIndex: 3,
            state: { a: 42, b: 'changed', quotedAt: new Date('2026-05-15T11:00:00Z') },
            status: 'in_progress',
            compensatedSteps: [],
            updatedAt: new Date(),
        };
        await store.save(advanced);

        const loaded = await store.loadOrCreate('saga_2', initialState());
        expect(loaded.exists).toBe(true);
        expect(loaded.checkpoint.stepIndex).toBe(3);
        expect(loaded.checkpoint.state.a).toBe(42);
        expect(loaded.checkpoint.state.b).toBe('changed');
        expect(loaded.checkpoint.state.quotedAt).toBeInstanceOf(Date);
        expect(loaded.checkpoint.state.quotedAt.toISOString())
            .toBe('2026-05-15T11:00:00.000Z');
    });

    it('persists completed status across reloads', async () => {
        await store.loadOrCreate('saga_3', initialState());
        await store.save({
            sagaId: 'saga_3',
            stepIndex: 5,
            state: initialState(),
            status: 'completed',
            compensatedSteps: [],
            updatedAt: new Date(),
        });
        const reloaded = await store.loadOrCreate('saga_3', initialState());
        expect(reloaded.checkpoint.status).toBe('completed');
    });

    it('records compensated saga state for ops review', async () => {
        await store.loadOrCreate('saga_4', initialState());
        await store.save({
            sagaId: 'saga_4',
            stepIndex: 2,
            state: initialState(),
            status: 'compensation_failed',
            error: 'compensation of cancel_awb failed',
            compensatedSteps: ['s1'],
            updatedAt: new Date(),
        });
        const reloaded = await store.loadOrCreate('saga_4', initialState());
        expect(reloaded.checkpoint.status).toBe('compensation_failed');
        expect(reloaded.checkpoint.error).toContain('cancel_awb');
        expect(reloaded.checkpoint.compensatedSteps).toEqual(['s1']);
    });

    it('exposes the BOOKING_SAGA_DATE_FIELDS constant', () => {
        expect(BOOKING_SAGA_DATE_FIELDS).toContain('pricing.quotedAt');
        expect(BOOKING_SAGA_DATE_FIELDS).toContain('labelArtifact.retrievedAt');
    });
});
