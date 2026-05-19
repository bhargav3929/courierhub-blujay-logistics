import { describe, it, expect, beforeEach } from 'vitest';
import { BookingReconciler } from '../BookingReconciler';
import { CarrierError } from '../../couriers/shared/carrierErrors';
import { CircuitOpenError } from '../../couriers/shared/circuitBreaker';
import type { CourierAdapter } from '../../../../types/b2b/courier-adapter';
import type {
    Clock,
    ClearReconciliationInput,
    DueReconciliation,
    MarkAwaitingReconciliationInput,
    ReconciliationDueQuery,
    ShipmentWriter,
} from '../../../../types/b2b/ports';
import type { CourierCode } from '../../../../types/b2b/shipment';
import { PartnerId, ShipmentId } from '../../../../types/b2b/ids';

// ─── Stubs ─────────────────────────────────────────────────────────────

class StaticDueQuery implements ReconciliationDueQuery {
    constructor(private readonly rows: readonly DueReconciliation[]) {}
    async findDue() { return this.rows; }
}

class FixedClock implements Clock {
    constructor(public fixed: Date) {}
    now() { return new Date(this.fixed.getTime()); }
}

class FakeShipmentWriter implements Partial<ShipmentWriter> {
    public marked: MarkAwaitingReconciliationInput[] = [];
    public cleared: ClearReconciliationInput[] = [];
    async markAwaitingReconciliation(input: MarkAwaitingReconciliationInput) {
        this.marked.push(input);
    }
    async clearReconciliation(input: ClearReconciliationInput) {
        this.cleared.push(input);
    }
    // Unused methods on the port — stubs so type satisfies
    async createDraft(): never { throw new Error('unused'); }
    async attachCarrier() { return; }
    async attachPricing() { return; }
    async attachLabel() { return; }
}

class StubAdapter implements Partial<CourierAdapter> {
    readonly courier: CourierCode;
    public lookupResult: { awb: string } | null = null;
    public lookupThrows: Error | null = null;
    public cancelThrows: Error | null = null;
    public cancelCount = 0;

    constructor(courier: CourierCode) { this.courier = courier; }

    async lookupByReference(): Promise<{ awb: string } | null> {
        if (this.lookupThrows) throw this.lookupThrows;
        return this.lookupResult;
    }
    async cancel(): Promise<void> {
        this.cancelCount += 1;
        if (this.cancelThrows) throw this.cancelThrows;
    }
}

const NOW = new Date('2026-05-15T12:00:00Z');
const PARTNER = PartnerId('p_1');

function due(id: string, attempts = 1, courier: CourierCode = 'bluedart'): DueReconciliation {
    return {
        shipmentId: ShipmentId(id),
        partnerId: PARTNER,
        courier,
        referenceNumber: id,
        attempts,
    };
}

function build(opts: {
    due: readonly DueReconciliation[];
    adapters: Record<string, StubAdapter>;
}) {
    const writer = new FakeShipmentWriter();
    const reconciler = new BookingReconciler({
        dueQuery: new StaticDueQuery(opts.due),
        shipmentWriter: writer as unknown as ShipmentWriter,
        clock: new FixedClock(NOW),
        getAdapter: (c) => (opts.adapters[c] as unknown as CourierAdapter) ?? null,
    });
    return { reconciler, writer };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('BookingReconciler — orphan AWB recovery', () => {
    it('cancels the carrier AWB and clears the flag', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.lookupResult = { awb: 'AWB-LIVE' };
        const { reconciler, writer } = build({
            due: [due('ship_1')],
            adapters: { bluedart: adapter },
        });
        const summary = await reconciler.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.recovered).toBe(1);
        expect(adapter.cancelCount).toBe(1);
        expect(writer.cleared).toHaveLength(1);
        expect(writer.cleared[0].resolvedWithAwb).toBe('AWB-LIVE');
    });

    it('keeps the flag set when carrier cancel fails (so we retry next run)', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.lookupResult = { awb: 'AWB-LIVE' };
        adapter.cancelThrows = new CarrierError({
            courier: 'bluedart', operation: 'cancel',
            category: 'transient', httpStatus: 503,
        });
        const { reconciler, writer } = build({
            due: [due('ship_1')],
            adapters: { bluedart: adapter },
        });
        const summary = await reconciler.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.recovered).toBe(0);
        expect(summary.errors).toBe(1);
        expect(summary.retryScheduled).toBe(1);
        expect(writer.cleared).toHaveLength(0);
        expect(writer.marked).toHaveLength(1);
        expect(writer.marked[0].attempts).toBe(2);
    });
});

describe('BookingReconciler — not found at carrier', () => {
    it('schedules a retry with exponential backoff', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.lookupResult = null;
        const { reconciler, writer } = build({
            due: [due('ship_1', 1)],
            adapters: { bluedart: adapter },
        });
        await reconciler.runOnce({ batchSize: 10, concurrency: 1 });
        expect(writer.marked).toHaveLength(1);
        const nextAt = writer.marked[0].nextAttemptAt;
        // Second attempt → 15min backoff
        const expected = new Date(NOW.getTime() + 15 * 60 * 1000);
        expect(nextAt.toISOString()).toBe(expected.toISOString());
    });

    it('abandons after max attempts', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.lookupResult = null;
        const { reconciler, writer } = build({
            due: [due('ship_1', /* attempts so far */ 5)],
            adapters: { bluedart: adapter },
        });
        const summary = await reconciler.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.abandoned).toBe(1);
        expect(writer.cleared).toHaveLength(1);
        expect(writer.cleared[0].resolvedWithAwb).toBeNull();
    });
});

describe('BookingReconciler — operational failures', () => {
    it('treats permanent carrier error from lookup as not-found', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.lookupThrows = new CarrierError({
            courier: 'bluedart', operation: 'lookupByReference',
            category: 'permanent', httpStatus: 400,
        });
        const { reconciler, writer } = build({
            due: [due('ship_1', 1)],
            adapters: { bluedart: adapter },
        });
        const summary = await reconciler.runOnce({ batchSize: 10, concurrency: 1 });
        // Treated as not-found → schedule retry
        expect(summary.retryScheduled).toBe(1);
        expect(writer.marked).toHaveLength(1);
    });

    it('counts circuit-open errors separately', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.lookupThrows = new CircuitOpenError('bluedart::lookupByReference', Date.now() + 60_000);
        const { reconciler, writer } = build({
            due: [due('ship_1')],
            adapters: { bluedart: adapter },
        });
        const summary = await reconciler.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.circuitOpen).toBe(1);
        expect(writer.cleared).toHaveLength(0);
        expect(writer.marked).toHaveLength(0);
    });

    it('counts missing adapter', async () => {
        const { reconciler } = build({
            due: [due('ship_1', 1, 'dtdc')],
            adapters: {}, // no adapters
        });
        const summary = await reconciler.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.missingAdapter).toBe(1);
    });
});

describe('BookingReconciler — idempotency', () => {
    it('runs are idempotent: a recovered shipment is not re-recovered next run', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.lookupResult = { awb: 'AWB-LIVE' };
        // First run: due query returns the shipment
        const { reconciler: r1, writer: w1 } = build({
            due: [due('ship_1')],
            adapters: { bluedart: adapter },
        });
        await r1.runOnce({ batchSize: 10, concurrency: 1 });
        expect(w1.cleared).toHaveLength(1);

        // Second run: the dueQuery's underlying store would no longer return
        // this shipment (clearReconciliation was called). Simulate by passing
        // an empty due list.
        const { reconciler: r2, writer: w2 } = build({
            due: [],
            adapters: { bluedart: adapter },
        });
        const summary = await r2.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.examined).toBe(0);
        expect(adapter.cancelCount).toBe(1);    // not re-cancelled
        expect(w2.cleared).toHaveLength(0);
    });
});
