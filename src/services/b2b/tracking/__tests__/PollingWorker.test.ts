import { describe, it, expect, beforeEach } from 'vitest';
import {
    PollingWorker,
    type DueShipment,
    type PollingDueQuery,
} from '../PollingWorker';
import type { CourierAdapter } from '../../../../types/b2b/courier-adapter';
import type { EventIngestor } from '../EventIngestor';
import type { Clock } from '../../../../types/b2b/ports';
import type { CourierCode } from '../../../../types/b2b/shipment';
import type { RawTrackingEvent, NormalizedEvent } from '../../../../types/b2b/tracking';
import { PartnerId, ShipmentId, EventId } from '../../../../types/b2b/ids';
import { CarrierError } from '../../couriers/shared/carrierErrors';
import { CircuitOpenError } from '../../couriers/shared/circuitBreaker';

// ─── Stubs ──────────────────────────────────────────────────────────────

class StaticDueQuery implements PollingDueQuery {
    constructor(private readonly rows: readonly DueShipment[]) {}
    async findDue() { return this.rows; }
}

class FixedClock implements Clock {
    constructor(private readonly t: Date) {}
    now() { return new Date(this.t.getTime()); }
}

class StubAdapter implements Partial<CourierAdapter> {
    readonly courier: CourierCode;
    public pollCount = 0;
    public toReturn: readonly RawTrackingEvent[] = [];
    public throwOn: 'transient' | 'permanent' | 'circuit' | null = null;

    constructor(courier: CourierCode) { this.courier = courier; }

    async pollStatus(): Promise<readonly RawTrackingEvent[]> {
        this.pollCount += 1;
        if (this.throwOn === 'transient') {
            throw new CarrierError({
                courier: this.courier, operation: 'pollStatus',
                category: 'transient', httpStatus: 503,
            });
        }
        if (this.throwOn === 'permanent') {
            throw new CarrierError({
                courier: this.courier, operation: 'pollStatus',
                category: 'permanent', httpStatus: 400,
            });
        }
        if (this.throwOn === 'circuit') {
            throw new CircuitOpenError(`${this.courier}::pollStatus`, Date.now() + 60_000);
        }
        return this.toReturn;
    }

    normalize(raw: RawTrackingEvent, shipmentId: ShipmentId, receivedAt: Date): NormalizedEvent {
        return {
            type: 'shipment.in_transit',
            rawCode: raw.rawCode,
            source: raw.source,
            occurredAt: raw.occurredAt,
            receivedAt,
            location: { city: null, pincode: null, raw: raw.locationRaw },
            facility: raw.facility,
            description: raw.description,
            impliedStatus: 'in_transit',
            impliedReason: null,
            dedupKey: `dedup:${raw.rawCode}:${shipmentId}`,
        };
    }
}

class StubIngestor {
    public calls: { eventId: string; outcome: string }[] = [];
    public toReturnOutcome: 'applied' | 'duplicate' | 'no_change' = 'applied';

    async ingest(input: { event: NormalizedEvent }) {
        const eventId = EventId(input.event.dedupKey);
        this.calls.push({ eventId, outcome: this.toReturnOutcome });
        switch (this.toReturnOutcome) {
            case 'applied':
                return {
                    outcome: 'applied' as const,
                    eventId, from: 'picked_up' as const, to: 'in_transit' as const,
                    effects: ['emit_partner_webhook'] as const,
                };
            case 'duplicate':
                return { outcome: 'duplicate' as const, existingEventId: eventId };
            case 'no_change':
                return { outcome: 'no_change' as const, reason: 'same_status' as const, recordedEventId: eventId };
        }
    }
}

// ─── fixtures ───────────────────────────────────────────────────────────

const NOW = new Date('2026-05-15T12:00:00Z');
const PARTNER = PartnerId('p_1');

function due(opts: Partial<DueShipment> & { id: string }): DueShipment {
    return {
        shipmentId: ShipmentId(opts.id),
        partnerId: opts.partnerId ?? PARTNER,
        courier: opts.courier ?? 'bluedart',
        awb: opts.awb ?? `AWB-${opts.id}`,
        status: opts.status ?? 'in_transit',
        lastEventAt: opts.lastEventAt ?? new Date(NOW.getTime() - 60 * 60_000),
    };
}

function rawEvent(code: string): RawTrackingEvent {
    return {
        source: 'bluedart',
        rawCode: code,
        description: 'test',
        occurredAt: new Date(NOW.getTime() - 30 * 60_000),
        locationRaw: null,
        facility: null,
        payload: {},
    };
}

function build(opts: {
    due: readonly DueShipment[];
    adapters: Record<string, StubAdapter>;
}) {
    const ingestor = new StubIngestor();
    const worker = new PollingWorker({
        dueQuery: new StaticDueQuery(opts.due),
        ingestor: ingestor as unknown as EventIngestor,
        clock: new FixedClock(NOW),
        getAdapter: (c) => (opts.adapters[c] as unknown as CourierAdapter) ?? null,
    });
    return { worker, ingestor };
}

// ─── tests ──────────────────────────────────────────────────────────────

describe('PollingWorker — applied path', () => {
    it('polls each due shipment and feeds events to the ingestor', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.toReturn = [rawEvent('07'), rawEvent('08')];
        const { worker, ingestor } = build({
            due: [due({ id: 'ship_1' }), due({ id: 'ship_2' })],
            adapters: { bluedart: adapter },
        });
        const summary = await worker.runOnce({ batchSize: 10, concurrency: 4 });
        expect(summary.polled).toBe(2);
        expect(adapter.pollCount).toBe(2);
        expect(summary.eventsIngested).toBe(4);   // 2 shipments × 2 events
        expect(summary.applied).toBe(4);
        expect(ingestor.calls).toHaveLength(4);
    });
});

describe('PollingWorker — stale shipments', () => {
    it('skips shipments older than staleAfterDays', async () => {
        // in_transit has staleAfterDays = 14. Make this shipment 30 days stale.
        const adapter = new StubAdapter('bluedart');
        const { worker } = build({
            due: [due({
                id: 'ship_old',
                lastEventAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60_000),
            })],
            adapters: { bluedart: adapter },
        });
        const summary = await worker.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.stale).toBe(1);
        expect(summary.polled).toBe(0);
        expect(adapter.pollCount).toBe(0);
    });
});

describe('PollingWorker — carrier failures', () => {
    it('counts transient carrier errors and continues', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.throwOn = 'transient';
        const { worker } = build({
            due: [due({ id: 'ship_1' }), due({ id: 'ship_2' })],
            adapters: { bluedart: adapter },
        });
        const summary = await worker.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.polled).toBe(2);
        expect(summary.carrierFailures).toBe(2);
        expect(summary.applied).toBe(0);
    });

    it('counts CircuitOpenError separately from carrierFailures', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.throwOn = 'circuit';
        const { worker } = build({
            due: [due({ id: 'ship_1' })],
            adapters: { bluedart: adapter },
        });
        const summary = await worker.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.circuitOpen).toBe(1);
        expect(summary.carrierFailures).toBe(0);
    });
});

describe('PollingWorker — missing adapter', () => {
    it('counts shipments whose courier has no registered adapter', async () => {
        const { worker } = build({
            due: [due({ id: 'ship_1', courier: 'dtdc' })],
            adapters: {}, // no adapters registered
        });
        const summary = await worker.runOnce({ batchSize: 10, concurrency: 1 });
        expect(summary.missingAdapter).toBe(1);
        expect(summary.polled).toBe(0);
    });
});

describe('PollingWorker — does not write status directly', () => {
    it('only feeds events to the ingestor; never bypasses it', async () => {
        // This is structurally enforced — the worker has no ProjectionWriter
        // dependency. But verify the call shape anyway: every adapter event
        // results in exactly one ingestor.ingest() call.
        const adapter = new StubAdapter('bluedart');
        adapter.toReturn = [rawEvent('07'), rawEvent('08'), rawEvent('11')];
        const { worker, ingestor } = build({
            due: [due({ id: 'ship_1' })],
            adapters: { bluedart: adapter },
        });
        await worker.runOnce({ batchSize: 10, concurrency: 1 });
        expect(ingestor.calls).toHaveLength(3);
    });
});

describe('PollingWorker — concurrency boundary', () => {
    it('processes all items even when batchSize > concurrency', async () => {
        const adapter = new StubAdapter('bluedart');
        adapter.toReturn = [];
        const { worker } = build({
            due: [
                due({ id: 'ship_1' }),
                due({ id: 'ship_2' }),
                due({ id: 'ship_3' }),
                due({ id: 'ship_4' }),
                due({ id: 'ship_5' }),
            ],
            adapters: { bluedart: adapter },
        });
        const summary = await worker.runOnce({ batchSize: 10, concurrency: 2 });
        expect(summary.polled).toBe(5);
        expect(adapter.pollCount).toBe(5);
    });
});
