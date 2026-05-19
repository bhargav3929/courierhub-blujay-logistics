import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreEventStore } from '../FirestoreEventStore';
import { FirestoreProjectionWriter } from '../FirestoreProjectionWriter';
import { FirestoreShipmentReader } from '../FirestoreShipmentReader';
import { StaleVersionError } from '../../../../types/b2b/ports';
import { PartnerId, ShipmentId } from '../../../../types/b2b/ids';
import type { NormalizedEvent } from '../../../../types/b2b/tracking';

// ─── tiny Firestore mock (covers only what the adapters call) ───────────

class MockStore {
    public readonly docs = new Map<string, Record<string, unknown>>();
}

class MockDocRef {
    constructor(public readonly path: string, private readonly store: MockStore) {}

    async get(): Promise<MockDocSnapshot> {
        const data = this.store.docs.get(this.path);
        return new MockDocSnapshot(this.path, data);
    }

    async create(data: Record<string, unknown>): Promise<void> {
        if (this.store.docs.has(this.path)) {
            const err = new Error('already exists') as Error & { code: number };
            err.code = 6;
            throw err;
        }
        this.store.docs.set(this.path, deepClone(data));
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

    collection(name: string): MockCollectionRef {
        return new MockCollectionRef(`${this.path}/${name}`, this.store);
    }
}

class MockDocSnapshot {
    constructor(
        public readonly id: string,
        private readonly _data: Record<string, unknown> | undefined,
    ) {}
    get exists(): boolean { return this._data !== undefined; }
    data(): Record<string, unknown> | undefined {
        return this._data ? deepClone(this._data) : undefined;
    }
}

class MockCollectionRef {
    constructor(public readonly path: string, private readonly store: MockStore) {}
    doc(id: string): MockDocRef {
        return new MockDocRef(`${this.path}/${id}`, this.store);
    }
}

class MockTransaction {
    private readonly pending: Array<() => Promise<void>> = [];
    constructor(private readonly store: MockStore) {}

    async get(ref: MockDocRef): Promise<MockDocSnapshot> {
        return ref.get();
    }
    update(ref: MockDocRef, data: Record<string, unknown>): void {
        this.pending.push(() => ref.update(data));
    }
    async commit(): Promise<void> {
        for (const w of this.pending) await w();
    }
}

class MockFirestore {
    public readonly store = new MockStore();

    collection(name: string): MockCollectionRef {
        return new MockCollectionRef(name, this.store);
    }

    async runTransaction<T>(fn: (tx: MockTransaction) => Promise<T>): Promise<T> {
        const tx = new MockTransaction(this.store);
        const result = await fn(tx);
        await tx.commit();
        return result;
    }
}

function deepClone<T>(v: T): T {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (v instanceof Date) return new Date(v.getTime()) as unknown as T;
    // Pass through class instances (Timestamp, FieldValue sentinels)
    const ctor = (v as { constructor?: { name?: string } }).constructor;
    if (ctor && ctor.name && ctor.name !== 'Object' && !Array.isArray(v)) {
        return v;
    }
    if (Array.isArray(v)) return v.map(deepClone) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
        out[k] = deepClone((v as Record<string, unknown>)[k]);
    }
    return out as T;
}

function applyUpdate(
    existing: Record<string, unknown>,
    update: Record<string, unknown>,
): Record<string, unknown> {
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
        if (next === undefined || next === null || typeof next !== 'object') {
            cur[part] = {};
        }
        cur = cur[part] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
}

// ─── fixtures ───────────────────────────────────────────────────────────

const PARTNER = PartnerId('p_1');
const OTHER = PartnerId('p_other');
const SHIP = ShipmentId('ship_1');

function asFirestore(mock: MockFirestore): Firestore {
    return mock as unknown as Firestore;
}

function buildEvent(dedupKey: string): NormalizedEvent {
    return {
        type: 'shipment.in_transit',
        rawCode: 'TEST',
        source: 'bluedart',
        occurredAt: new Date('2026-05-15T10:00:00Z'),
        receivedAt: new Date('2026-05-15T10:00:05Z'),
        location: { city: null, pincode: null, raw: null },
        facility: null,
        description: 'test',
        impliedStatus: 'in_transit',
        impliedReason: null,
        dedupKey,
    };
}

// ─── FirestoreShipmentReader ────────────────────────────────────────────

describe('FirestoreShipmentReader', () => {
    let mock: MockFirestore;
    let reader: FirestoreShipmentReader;

    beforeEach(() => {
        mock = new MockFirestore();
        reader = new FirestoreShipmentReader(asFirestore(mock));
    });

    it('returns null when the shipment does not exist', async () => {
        expect(await reader.load(PARTNER, SHIP)).toBeNull();
    });

    it('returns null on cross-tenant access (no existence leak)', async () => {
        mock.store.docs.set('shipments/ship_1', {
            partnerId: OTHER,
            status: 'in_transit',
            fulfillmentMode: 'courier',
            trackingMode: 'automatic',
            stateVersion: 1,
        });
        expect(await reader.load(PARTNER, SHIP)).toBeNull();
    });

    it('returns a fully-typed snapshot on legitimate access', async () => {
        mock.store.docs.set('shipments/ship_1', {
            partnerId: PARTNER,
            status: 'in_transit',
            previousStatus: 'picked_up',
            fulfillmentMode: 'courier',
            trackingMode: 'automatic',
            stateVersion: 3,
        });
        const r = await reader.load(PARTNER, SHIP);
        expect(r).not.toBeNull();
        if (r) {
            expect(r.snapshot.status).toBe('in_transit');
            expect(r.snapshot.previousStatus).toBe('picked_up');
            expect(r.snapshot.fulfillmentMode).toBe('courier');
            expect(r.snapshot.trackingMode).toBe('automatic');
            expect(r.stateVersion).toBe(3);
        }
    });

    it('parses hybrid config when present', async () => {
        mock.store.docs.set('shipments/ship_1', {
            partnerId: PARTNER,
            status: 'in_transit',
            fulfillmentMode: 'courier',
            trackingMode: 'hybrid',
            stateVersion: 0,
            hybridConfig: {
                switchAfterStatus: 'in_transit',
                courierAuthorityUntilRank: 40,
                partnerAuthorityFromRank: 50,
            },
        });
        const r = await reader.load(PARTNER, SHIP);
        expect(r?.hybridConfig).toEqual({
            switchAfterStatus: 'in_transit',
            courierAuthorityUntilRank: 40,
            partnerAuthorityFromRank: 50,
        });
    });

    it('parses tracking.lastEventAt as a Date', async () => {
        const at = new Date('2026-05-15T10:00:00Z');
        mock.store.docs.set('shipments/ship_1', {
            partnerId: PARTNER,
            status: 'in_transit',
            fulfillmentMode: 'courier',
            trackingMode: 'automatic',
            stateVersion: 0,
            tracking: { lastEventAt: Timestamp.fromDate(at) },
        });
        const r = await reader.load(PARTNER, SHIP);
        expect(r?.lastEventAt?.toISOString()).toBe(at.toISOString());
    });

    it('defaults stateVersion to 0 when absent', async () => {
        mock.store.docs.set('shipments/ship_1', {
            partnerId: PARTNER,
            status: 'draft',
            fulfillmentMode: 'courier',
            trackingMode: 'automatic',
        });
        const r = await reader.load(PARTNER, SHIP);
        expect(r?.stateVersion).toBe(0);
    });

    it('throws on a corrupt status field (fail fast)', async () => {
        mock.store.docs.set('shipments/ship_1', {
            partnerId: PARTNER,
            status: 'BOGUS',
            fulfillmentMode: 'courier',
            trackingMode: 'automatic',
        });
        await expect(reader.load(PARTNER, SHIP)).rejects.toThrow(/invalid status/);
    });

    it('drops malformed hybridConfig as null (treat as non-hybrid)', async () => {
        mock.store.docs.set('shipments/ship_1', {
            partnerId: PARTNER,
            status: 'in_transit',
            fulfillmentMode: 'courier',
            trackingMode: 'hybrid',
            stateVersion: 0,
            hybridConfig: { switchAfterStatus: 'in_transit' }, // missing ranks
        });
        const r = await reader.load(PARTNER, SHIP);
        expect(r?.hybridConfig).toBeNull();
    });
});

// ─── FirestoreEventStore ────────────────────────────────────────────────

describe('FirestoreEventStore', () => {
    let mock: MockFirestore;
    let store: FirestoreEventStore;

    beforeEach(() => {
        mock = new MockFirestore();
        store = new FirestoreEventStore(asFirestore(mock));
    });

    const baseInput = (dedupKey: string) => ({
        shipmentId: SHIP,
        partnerId: PARTNER,
        event: buildEvent(dedupKey),
        applied: true,
        appliedReason: 'applied' as const,
        statusTransition: { from: 'picked_up' as const, to: 'in_transit' as const },
    });

    it('stores a new event at shipments/{id}/events/{dedupKey}', async () => {
        const r = await store.appendOrFindDuplicate(baseInput('key1'));
        expect(r.stored).toBe(true);
        if (r.stored) expect(r.eventId).toBe('key1');
        expect(mock.store.docs.has('shipments/ship_1/events/key1')).toBe(true);
    });

    it('maps ALREADY_EXISTS to { stored: false, existingEventId }', async () => {
        const first = await store.appendOrFindDuplicate(baseInput('key1'));
        const second = await store.appendOrFindDuplicate(baseInput('key1'));
        expect(first.stored).toBe(true);
        expect(second.stored).toBe(false);
        if (!second.stored) expect(second.existingEventId).toBe('key1');
        expect(mock.store.docs.size).toBe(1);
    });

    it('writes partnerId, applied, appliedReason, and statusTransition', async () => {
        await store.appendOrFindDuplicate(baseInput('key2'));
        const doc = mock.store.docs.get('shipments/ship_1/events/key2');
        expect(doc?.partnerId).toBe(PARTNER);
        expect(doc?.applied).toBe(true);
        expect(doc?.appliedReason).toBe('applied');
        expect(doc?.statusTransition).toEqual({ from: 'picked_up', to: 'in_transit' });
    });

    it('stores informational events with applied=false', async () => {
        await store.appendOrFindDuplicate({
            shipmentId: SHIP, partnerId: PARTNER,
            event: { ...buildEvent('key3'), impliedStatus: null, type: 'shipment.arrived_at_hub' },
            applied: false,
            appliedReason: 'no_status_implied',
            statusTransition: null,
        });
        const doc = mock.store.docs.get('shipments/ship_1/events/key3');
        expect(doc?.applied).toBe(false);
        expect(doc?.appliedReason).toBe('no_status_implied');
        expect(doc?.statusTransition).toBeNull();
    });
});

// ─── FirestoreProjectionWriter ──────────────────────────────────────────

describe('FirestoreProjectionWriter', () => {
    let mock: MockFirestore;
    let writer: FirestoreProjectionWriter;

    beforeEach(() => {
        mock = new MockFirestore();
        writer = new FirestoreProjectionWriter(asFirestore(mock));
    });

    function seed(opts: { status: string; stateVersion: number; partnerId?: string; extra?: Record<string, unknown> }) {
        mock.store.docs.set('shipments/ship_1', {
            partnerId: opts.partnerId ?? PARTNER,
            status: opts.status,
            stateVersion: opts.stateVersion,
            ...(opts.extra ?? {}),
        });
    }

    it('advances status and bumps stateVersion', async () => {
        seed({ status: 'picked_up', stateVersion: 3 });
        await writer.update({
            shipmentId: SHIP, partnerId: PARTNER,
            expectedVersion: 3,
            nextStatus: 'in_transit',
            previousStatus: 'picked_up',
            statusReason: null,
            lastEventAt: new Date('2026-05-15T10:00:00Z'),
        });
        const doc = mock.store.docs.get('shipments/ship_1');
        expect(doc?.status).toBe('in_transit');
        expect(doc?.previousStatus).toBe('picked_up');
        expect(doc?.stateVersion).toBe(4);
    });

    it('throws StaleVersionError on version mismatch', async () => {
        seed({ status: 'picked_up', stateVersion: 5 });
        await expect(
            writer.update({
                shipmentId: SHIP, partnerId: PARTNER,
                expectedVersion: 3,
                nextStatus: 'in_transit', previousStatus: 'picked_up',
                statusReason: null, lastEventAt: new Date(),
            }),
        ).rejects.toBeInstanceOf(StaleVersionError);
        // The doc must not have changed.
        const doc = mock.store.docs.get('shipments/ship_1');
        expect(doc?.stateVersion).toBe(5);
        expect(doc?.status).toBe('picked_up');
    });

    it('throws when the shipment does not exist', async () => {
        await expect(
            writer.update({
                shipmentId: SHIP, partnerId: PARTNER,
                expectedVersion: 0,
                nextStatus: 'in_transit', previousStatus: 'picked_up',
                statusReason: null, lastEventAt: new Date(),
            }),
        ).rejects.toThrow(/not found/);
    });

    it('throws on cross-tenant write (defense in depth)', async () => {
        seed({ status: 'picked_up', stateVersion: 0, partnerId: OTHER });
        await expect(
            writer.update({
                shipmentId: SHIP, partnerId: PARTNER,
                expectedVersion: 0,
                nextStatus: 'in_transit', previousStatus: 'picked_up',
                statusReason: null, lastEventAt: new Date(),
            }),
        ).rejects.toThrow(/partnerId mismatch/);
    });

    it('writes tracking.deliveredAt when status becomes delivered', async () => {
        seed({ status: 'out_for_delivery', stateVersion: 5 });
        const at = new Date('2026-05-15T14:00:00Z');
        await writer.update({
            shipmentId: SHIP, partnerId: PARTNER,
            expectedVersion: 5,
            nextStatus: 'delivered', previousStatus: 'out_for_delivery',
            statusReason: null, lastEventAt: at,
        });
        const doc = mock.store.docs.get('shipments/ship_1') as {
            tracking?: { deliveredAt?: Timestamp; lastEventAt?: Timestamp };
        };
        expect(doc.tracking?.deliveredAt).toBeDefined();
        expect(doc.tracking?.lastEventAt).toBeDefined();
        expect((doc.tracking?.deliveredAt as Timestamp).toMillis()).toBe(at.getTime());
    });

    it('writes tracking.cancelledAt on cancellation', async () => {
        seed({ status: 'booked', stateVersion: 1 });
        const at = new Date('2026-05-15T10:30:00Z');
        await writer.update({
            shipmentId: SHIP, partnerId: PARTNER,
            expectedVersion: 1,
            nextStatus: 'cancelled', previousStatus: 'booked',
            statusReason: 'partner_requested', lastEventAt: at,
        });
        const doc = mock.store.docs.get('shipments/ship_1') as {
            tracking?: { cancelledAt?: Timestamp };
            statusReason?: string;
        };
        expect(doc.tracking?.cancelledAt).toBeDefined();
        expect(doc.statusReason).toBe('partner_requested');
    });

    it('preserves sibling tracking.* fields via dot-notation update', async () => {
        const expectedDelivery = Timestamp.fromDate(new Date('2026-05-20T00:00:00Z'));
        seed({
            status: 'in_transit',
            stateVersion: 2,
            extra: {
                tracking: { expectedDeliveryAt: expectedDelivery },
            },
        });
        await writer.update({
            shipmentId: SHIP, partnerId: PARTNER,
            expectedVersion: 2,
            nextStatus: 'out_for_delivery', previousStatus: 'in_transit',
            statusReason: null, lastEventAt: new Date(),
        });
        const doc = mock.store.docs.get('shipments/ship_1') as {
            tracking?: { expectedDeliveryAt?: Timestamp; lastEventAt?: Timestamp };
        };
        // sibling field still there
        expect(doc.tracking?.expectedDeliveryAt).toBe(expectedDelivery);
        // new field added
        expect(doc.tracking?.lastEventAt).toBeDefined();
    });
});
