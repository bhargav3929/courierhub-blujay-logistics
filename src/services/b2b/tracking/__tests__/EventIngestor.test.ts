import { describe, it, expect } from 'vitest';
import { EventIngestor } from '../EventIngestor';
import { computeDedupKey } from '../dedupKey';
import { buildHybridConfig } from '../hybridConfig';
import { ApiKeyId, PartnerId, ShipmentId, UserId, EventId } from '../../../../types/b2b/ids';
import { StaleVersionError } from '../../../../types/b2b/ports';
import type {
    AppendEventInput,
    AppendEventResult,
    Clock,
    EffectDispatcher,
    EffectDispatchInput,
    EventStore,
    ProjectionUpdate,
    ProjectionWriter,
    ShipmentContext,
    ShipmentReader,
} from '../../../../types/b2b/ports';
import type { NormalizedEvent } from '../../../../types/b2b/tracking';
import type { ShipmentSnapshot, StateInitiator } from '../../../../types/b2b/state-machine';
import type { ShipmentStatus } from '../../../../types/b2b/shipment';

// ─── In-memory port implementations ─────────────────────────────────────

class InMemoryShipmentReader implements ShipmentReader {
    private readonly store = new Map<string, ShipmentContext>();
    set(partnerId: string, shipmentId: string, ctx: ShipmentContext) {
        this.store.set(`${partnerId}::${shipmentId}`, ctx);
    }
    async load(partnerId: string, shipmentId: string) {
        return this.store.get(`${partnerId}::${shipmentId}`) ?? null;
    }
}

class InMemoryEventStore implements EventStore {
    public readonly recorded: Array<AppendEventInput & { eventId: ReturnType<typeof EventId> }> = [];
    private readonly byKey = new Map<string, ReturnType<typeof EventId>>();
    private counter = 0;

    async appendOrFindDuplicate(input: AppendEventInput): Promise<AppendEventResult> {
        const existing = this.byKey.get(input.event.dedupKey);
        if (existing) {
            return { stored: false, existingEventId: existing };
        }
        const eventId = EventId(`evt_${++this.counter}`);
        this.byKey.set(input.event.dedupKey, eventId);
        this.recorded.push({ ...input, eventId });
        return { stored: true, eventId };
    }
}

class InMemoryProjectionWriter implements ProjectionWriter {
    public readonly updates: ProjectionUpdate[] = [];
    public failNextWith: Error | null = null;

    async update(update: ProjectionUpdate): Promise<void> {
        if (this.failNextWith) {
            const err = this.failNextWith;
            this.failNextWith = null;
            throw err;
        }
        this.updates.push(update);
    }
}

class InMemoryEffectDispatcher implements EffectDispatcher {
    public readonly dispatched: EffectDispatchInput[] = [];
    async dispatch(input: EffectDispatchInput): Promise<void> {
        this.dispatched.push(input);
    }
}

class FixedClock implements Clock {
    constructor(private readonly fixed: Date) {}
    now(): Date { return this.fixed; }
}

// ─── fixtures ───────────────────────────────────────────────────────────

const PARTNER = PartnerId('p_1');
const SHIP = ShipmentId('ship_1');

const COURIER_INIT: StateInitiator = { type: 'courier_webhook', courier: 'bluedart' };
const PARTNER_INIT: StateInitiator = { type: 'partner_api', partnerId: PARTNER, apiKeyId: ApiKeyId('k_1') };

const snap = (status: ShipmentStatus, opts: Partial<ShipmentSnapshot> = {}): ShipmentSnapshot => ({
    status,
    previousStatus: null,
    fulfillmentMode: 'courier',
    trackingMode: 'automatic',
    ...opts,
});

function buildEvent(opts: {
    source: NormalizedEvent['source'];
    impliedStatus: ShipmentStatus | null;
    occurredAt?: Date;
    type?: NormalizedEvent['type'];
}): NormalizedEvent {
    const occurredAt = opts.occurredAt ?? new Date('2026-05-15T10:00:00Z');
    return {
        type: opts.type ?? 'shipment.in_transit',
        rawCode: 'TEST',
        source: opts.source,
        occurredAt,
        receivedAt: new Date('2026-05-15T10:00:05Z'),
        location: { city: null, pincode: null, raw: null },
        facility: null,
        description: 'test',
        impliedStatus: opts.impliedStatus,
        impliedReason: null,
        dedupKey: computeDedupKey({
            source: opts.source,
            rawCode: 'TEST',
            occurredAt,
            locationRaw: null,
            shipmentId: SHIP,
        }),
    };
}

function makeIngestor(overrides: { now?: Date } = {}) {
    const reader = new InMemoryShipmentReader();
    const store = new InMemoryEventStore();
    const writer = new InMemoryProjectionWriter();
    const dispatcher = new InMemoryEffectDispatcher();
    const clock = new FixedClock(overrides.now ?? new Date('2026-05-15T10:00:10Z'));
    const ingestor = new EventIngestor({
        shipmentReader: reader,
        eventStore: store,
        projectionWriter: writer,
        effectDispatcher: dispatcher,
        clock,
    });
    return { ingestor, reader, store, writer, dispatcher };
}

const baseInput = { shipmentId: SHIP, partnerId: PARTNER };

// ─── happy path ─────────────────────────────────────────────────────────

describe('EventIngestor.ingest — applied (happy path)', () => {
    it('records the event, advances projection, dispatches effects', async () => {
        const { ingestor, reader, store, writer, dispatcher } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null,
            lastEventAt: null,
            stateVersion: 3,
        });
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('applied');
        if (r.outcome === 'applied') {
            expect(r.from).toBe('picked_up');
            expect(r.to).toBe('in_transit');
            expect(r.effects).toContain('emit_partner_webhook');
        }
        expect(store.recorded).toHaveLength(1);
        expect(store.recorded[0].applied).toBe(true);
        expect(writer.updates).toHaveLength(1);
        expect(writer.updates[0].expectedVersion).toBe(3);
        expect(writer.updates[0].nextStatus).toBe('in_transit');
        expect(dispatcher.dispatched).toHaveLength(1);
        expect(dispatcher.dispatched[0].to).toBe('in_transit');
    });
});

// ─── deduplication ──────────────────────────────────────────────────────

describe('EventIngestor.ingest — deduplication', () => {
    it('returns duplicate for re-ingest of the same event', async () => {
        const { ingestor, reader, store, writer, dispatcher } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });

        const r1 = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });
        const r2 = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r1.outcome).toBe('applied');
        expect(r2.outcome).toBe('duplicate');
        // Event store: still one record. Projection: only advanced once.
        // Effects: only fired once.
        expect(store.recorded).toHaveLength(1);
        expect(writer.updates).toHaveLength(1);
        expect(dispatcher.dispatched).toHaveLength(1);
    });
});

// ─── no_change paths ────────────────────────────────────────────────────

describe('EventIngestor.ingest — no_change/same_status', () => {
    it('records event with applied=false; projection unchanged', async () => {
        const { ingestor, reader, store, writer } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('in_transit'),
            hybridConfig: null, lastEventAt: null, stateVersion: 5,
        });
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('no_change');
        if (r.outcome === 'no_change') expect(r.reason).toBe('same_status');
        expect(store.recorded).toHaveLength(1);
        expect(store.recorded[0].applied).toBe(false);
        expect(store.recorded[0].appliedReason).toBe('same_status');
        expect(writer.updates).toHaveLength(0);
    });
});

describe('EventIngestor.ingest — no_change/stale_by_rank', () => {
    it('records but does not regress projection', async () => {
        const { ingestor, reader, store, writer } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('delivered'),
            hybridConfig: null, lastEventAt: null, stateVersion: 7,
        });
        // stale OFD scan arrives on a delivered shipment
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'out_for_delivery' });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('no_change');
        if (r.outcome === 'no_change') expect(r.reason).toBe('stale_by_rank');
        expect(store.recorded).toHaveLength(1);
        expect(store.recorded[0].appliedReason).toBe('stale_by_rank');
        expect(writer.updates).toHaveLength(0);
    });
});

describe('EventIngestor.ingest — no_change/no_status_implied', () => {
    it('records informational events (arrived_at_hub)', async () => {
        const { ingestor, reader, store, writer } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('in_transit'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({
            source: 'bluedart',
            impliedStatus: null,
            type: 'shipment.arrived_at_hub',
        });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('no_change');
        if (r.outcome === 'no_change') expect(r.reason).toBe('no_status_implied');
        expect(store.recorded).toHaveLength(1);
        expect(writer.updates).toHaveLength(0);
    });
});

// ─── authority gate ─────────────────────────────────────────────────────

describe('EventIngestor.ingest — authority gate (hybrid)', () => {
    it('blocks courier events beyond switchover; event recorded with authority reason', async () => {
        const { ingestor, reader, store, writer } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('in_transit', { trackingMode: 'hybrid' }),
            hybridConfig: buildHybridConfig('in_transit'),
            lastEventAt: null,
            stateVersion: 0,
        });
        // Courier event for delivered — beyond courier authority (rank > in_transit)
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'delivered' });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('authority_blocked');
        if (r.outcome === 'authority_blocked') {
            expect(r.reason).toBe('beyond_courier_authority');
        }
        expect(store.recorded).toHaveLength(1);
        expect(store.recorded[0].appliedReason).toBe('authority_blocked_courier');
        expect(writer.updates).toHaveLength(0);
    });

    it('blocks partner events below partner authority; event recorded', async () => {
        const { ingestor, reader, store, writer } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('in_transit', { trackingMode: 'hybrid' }),
            hybridConfig: buildHybridConfig('in_transit'),
            lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({ source: 'partner_api', impliedStatus: 'picked_up' });

        const r = await ingestor.ingest({ event, initiator: PARTNER_INIT, ...baseInput });

        expect(r.outcome).toBe('authority_blocked');
        if (r.outcome === 'authority_blocked') {
            expect(r.reason).toBe('below_partner_authority');
        }
        expect(store.recorded[0].appliedReason).toBe('authority_blocked_partner');
        expect(writer.updates).toHaveLength(0);
    });
});

describe('EventIngestor.ingest — authority gate (automatic mode)', () => {
    it('blocks partner events in automatic mode', async () => {
        const { ingestor, reader } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('in_transit'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({ source: 'partner_api', impliedStatus: 'out_for_delivery' });

        const r = await ingestor.ingest({ event, initiator: PARTNER_INIT, ...baseInput });

        expect(r.outcome).toBe('authority_blocked');
        if (r.outcome === 'authority_blocked') {
            expect(r.reason).toBe('partner_event_in_automatic_mode');
        }
    });
});

// ─── initiator/source validation ────────────────────────────────────────

describe('EventIngestor.ingest — initiator validation', () => {
    it('rejects when initiator type does not match event source', async () => {
        const { ingestor, reader, store } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        // partner_api initiator with a bluedart-sourced event
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });

        const r = await ingestor.ingest({ event, initiator: PARTNER_INIT, ...baseInput });

        expect(r.outcome).toBe('rejected');
        if (r.outcome === 'rejected') {
            expect(r.error.code).toBe('initiator_source_mismatch');
        }
        expect(store.recorded).toHaveLength(0);  // not recorded
    });

    it('rejects when courier_webhook initiator targets the wrong carrier', async () => {
        const { ingestor, reader } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({ source: 'delhivery', impliedStatus: 'in_transit' });
        const init: StateInitiator = { type: 'courier_webhook', courier: 'bluedart' };

        const r = await ingestor.ingest({ event, initiator: init, ...baseInput });
        expect(r.outcome).toBe('rejected');
    });
});

// ─── clock skew guard ───────────────────────────────────────────────────

describe('EventIngestor.ingest — future event guard', () => {
    it('rejects events whose occurredAt is far in the future', async () => {
        const { ingestor, reader, store } = makeIngestor({
            now: new Date('2026-05-15T10:00:00Z'),
        });
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({
            source: 'bluedart',
            impliedStatus: 'in_transit',
            occurredAt: new Date('2026-05-15T10:30:00Z'),  // 30 min in future
        });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('rejected');
        if (r.outcome === 'rejected') expect(r.error.code).toBe('future_event');
        expect(store.recorded).toHaveLength(0);
    });

    it('accepts events within the 5-minute tolerance window', async () => {
        const { ingestor, reader } = makeIngestor({
            now: new Date('2026-05-15T10:00:00Z'),
        });
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({
            source: 'bluedart',
            impliedStatus: 'in_transit',
            occurredAt: new Date('2026-05-15T10:02:00Z'),  // 2 min in future, within tolerance
        });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });
        expect(r.outcome).toBe('applied');
    });
});

// ─── shipment not found ─────────────────────────────────────────────────

describe('EventIngestor.ingest — shipment not found', () => {
    it('rejects without recording', async () => {
        const { ingestor, store } = makeIngestor();
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('rejected');
        if (r.outcome === 'rejected') expect(r.error.code).toBe('shipment_not_found');
        expect(store.recorded).toHaveLength(0);
    });
});

// ─── illegal_recorded vs rejected ───────────────────────────────────────

describe('EventIngestor.ingest — illegal carrier event (recorded for audit)', () => {
    it('records courier-driven illegal transitions but does not move projection', async () => {
        const { ingestor, reader, store, writer } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('draft'),     // draft → delivered is forbidden
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'delivered' });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('illegal_recorded');
        if (r.outcome === 'illegal_recorded') {
            expect(r.transitionError.code).toBe('forbidden_transition');
        }
        expect(store.recorded).toHaveLength(1);
        expect(store.recorded[0].applied).toBe(false);
        expect(store.recorded[0].appliedReason).toBe('transition_forbidden');
        expect(writer.updates).toHaveLength(0);
    });
});

describe('EventIngestor.ingest — illegal partner event (rejected, not recorded)', () => {
    it('does not record partner-driven illegal transitions', async () => {
        const { ingestor, reader, store } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('booked', { trackingMode: 'manual' }),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        // Partner trying to skip from booked → delivered (no rule for this edge)
        const event = buildEvent({ source: 'partner_api', impliedStatus: 'delivered' });

        const r = await ingestor.ingest({ event, initiator: PARTNER_INIT, ...baseInput });

        expect(r.outcome).toBe('rejected');
        if (r.outcome === 'rejected') {
            expect(r.error.code).toBe('state_transition_forbidden');
        }
        expect(store.recorded).toHaveLength(0);
    });
});

// ─── projection conflict ────────────────────────────────────────────────

describe('EventIngestor.ingest — projection conflict (optimistic lock)', () => {
    it('returns projection_conflict but keeps event in the log', async () => {
        const { ingestor, reader, store, writer, dispatcher } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null, lastEventAt: null, stateVersion: 3,
        });
        writer.failNextWith = new StaleVersionError(5, 3);
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });

        const r = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r.outcome).toBe('projection_conflict');
        expect(store.recorded).toHaveLength(1);     // event preserved
        expect(writer.updates).toHaveLength(0);     // projection not moved
        expect(dispatcher.dispatched).toHaveLength(0); // effects NOT fired
    });
});

// ─── replay safety ──────────────────────────────────────────────────────

describe('EventIngestor.ingest — replay safety', () => {
    it('replaying the same event N times produces effects exactly once', async () => {
        const { ingestor, reader, store, writer, dispatcher } = makeIngestor();
        reader.set(PARTNER, SHIP, {
            snapshot: snap('picked_up'),
            hybridConfig: null, lastEventAt: null, stateVersion: 0,
        });
        const event = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });

        const r1 = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });
        const r2 = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });
        const r3 = await ingestor.ingest({ event, initiator: COURIER_INIT, ...baseInput });

        expect(r1.outcome).toBe('applied');
        expect(r2.outcome).toBe('duplicate');
        expect(r3.outcome).toBe('duplicate');
        expect(store.recorded).toHaveLength(1);
        expect(writer.updates).toHaveLength(1);
        expect(dispatcher.dispatched).toHaveLength(1);
    });

    it('two distinct events for the same shipment both apply', async () => {
        const { ingestor, reader, store, writer, dispatcher } = makeIngestor();
        // Reader returns evolving snapshot — simulates the repository.
        let stateVersion = 0;
        let status: ShipmentStatus = 'picked_up';
        reader.load = async () => ({
            snapshot: snap(status),
            hybridConfig: null,
            lastEventAt: null,
            stateVersion,
        });
        writer.update = async (u) => {
            stateVersion = u.expectedVersion + 1;
            status = u.nextStatus;
            writer.updates.push(u);
        };

        const e1 = buildEvent({ source: 'bluedart', impliedStatus: 'in_transit' });
        const e2 = buildEvent({
            source: 'bluedart',
            impliedStatus: 'out_for_delivery',
            occurredAt: new Date('2026-05-15T10:05:00Z'),
        });

        const r1 = await ingestor.ingest({ event: e1, initiator: COURIER_INIT, ...baseInput });
        const r2 = await ingestor.ingest({ event: e2, initiator: COURIER_INIT, ...baseInput });

        expect(r1.outcome).toBe('applied');
        expect(r2.outcome).toBe('applied');
        if (r2.outcome === 'applied') {
            expect(r2.from).toBe('in_transit');
            expect(r2.to).toBe('out_for_delivery');
        }
        expect(store.recorded).toHaveLength(2);
        expect(writer.updates).toHaveLength(2);
        expect(dispatcher.dispatched).toHaveLength(2);
    });
});
