import { describe, it, expect } from 'vitest';
import { ShipmentStateMachine } from '../ShipmentStateMachine';
import { ApiKeyId, PartnerId, UserId } from '../../../../types/b2b/ids';
import type {
    ShipmentSnapshot,
    StateInitiator,
    TransitionContext,
} from '../../../../types/b2b/state-machine';
import type { ShipmentStatus } from '../../../../types/b2b/shipment';
import type { NormalizedEvent } from '../../../../types/b2b/tracking';

// ─── test fixtures ──────────────────────────────────────────────────────

const PARTNER: StateInitiator = {
    type: 'partner_api',
    partnerId: PartnerId('p_1'),
    apiKeyId: ApiKeyId('k_1'),
};
const COURIER: StateInitiator = { type: 'courier_webhook', courier: 'bluedart' };
const POLL: StateInitiator = { type: 'courier_poll', courier: 'delhivery' };
const ADMIN: StateInitiator = { type: 'admin_user', userId: UserId('u_1') };
const SYSTEM: StateInitiator = { type: 'system', job: 'reconcile' };

const ctx = (initiator: StateInitiator): TransitionContext => ({
    initiator,
    occurredAt: new Date('2026-05-15T10:00:00Z'),
    receivedAt: new Date('2026-05-15T10:00:05Z'),
});

const snap = (status: ShipmentStatus, opts: Partial<ShipmentSnapshot> = {}): ShipmentSnapshot => ({
    status,
    previousStatus: null,
    fulfillmentMode: 'courier',
    trackingMode: 'automatic',
    ...opts,
});

const evt = (
    impliedStatus: ShipmentStatus | null,
    overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent => ({
    type: 'shipment.in_transit',
    rawCode: 'TEST',
    source: 'bluedart',
    occurredAt: new Date('2026-05-15T10:00:00Z'),
    receivedAt: new Date('2026-05-15T10:00:05Z'),
    location: { city: null, pincode: null, raw: null },
    facility: null,
    description: 'test event',
    impliedStatus,
    impliedReason: null,
    dedupKey: 'test-key',
    ...overrides,
});

// ─── apply() — sample (happy) transitions ───────────────────────────────

describe('ShipmentStateMachine.apply — sample transitions', () => {
    it('book transitions draft → booked', () => {
        const r = ShipmentStateMachine.apply(snap('draft'), { kind: 'book' }, ctx(PARTNER));
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.from).toBe('draft');
            expect(r.to).toBe('booked');
            expect(r.effects).toContain('emit_partner_webhook');
            expect(r.statusReason).toBeNull();
        }
    });

    it('mark_in_transit transitions picked_up → in_transit (courier)', () => {
        const r = ShipmentStateMachine.apply(snap('picked_up'), { kind: 'mark_in_transit' }, ctx(COURIER));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.to).toBe('in_transit');
    });

    it('mark_delivered carries settle_cod + finalize_billing', () => {
        const r = ShipmentStateMachine.apply(
            snap('out_for_delivery'), { kind: 'mark_delivered' }, ctx(POLL),
        );
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.effects).toContain('settle_cod');
            expect(r.effects).toContain('finalize_billing');
        }
    });

    it('cancel from booked carries the cancellation reason as statusReason', () => {
        const r = ShipmentStateMachine.apply(
            snap('booked'),
            { kind: 'cancel', reason: 'duplicate' },
            ctx(PARTNER),
        );
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.statusReason).toBe('duplicate');
            expect(r.effects).toContain('archive_label');
        }
    });

    it('undelivered → out_for_delivery (re-attempt) is allowed', () => {
        const r = ShipmentStateMachine.apply(
            snap('undelivered'), { kind: 'mark_out_for_delivery' }, ctx(COURIER),
        );
        expect(r.ok).toBe(true);
    });

    it('booked → picked_up direct (skips ready_for_pickup) is allowed', () => {
        const r = ShipmentStateMachine.apply(
            snap('booked'), { kind: 'mark_picked_up' }, ctx(COURIER),
        );
        expect(r.ok).toBe(true);
    });
});

// ─── apply() — illegal transitions ──────────────────────────────────────

describe('ShipmentStateMachine.apply — illegal transitions', () => {
    it('rejects undefined edges as forbidden_transition', () => {
        const r = ShipmentStateMachine.apply(snap('draft'), { kind: 'mark_delivered' }, ctx(ADMIN));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_transition');
    });

    it('rejects wrong initiator as forbidden_for_initiator', () => {
        const r = ShipmentStateMachine.apply(
            snap('in_transit'),
            { kind: 'put_on_hold', reason: 'manual_review' },
            ctx(COURIER), // couriers cannot put shipments on hold
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_for_initiator');
    });

    it('rejects partner_api in pure courier+automatic mode for mid-transit edges', () => {
        const r = ShipmentStateMachine.apply(
            snap('in_transit'),
            { kind: 'mark_out_for_delivery' },
            ctx(PARTNER),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_for_mode');
    });

    it('allows partner_api in self_shipment mode for the same edge', () => {
        const r = ShipmentStateMachine.apply(
            snap('in_transit', { fulfillmentMode: 'self_shipment' }),
            { kind: 'mark_out_for_delivery' },
            ctx(PARTNER),
        );
        expect(r.ok).toBe(true);
    });

    it('allows partner_api in hybrid tracking for the same edge', () => {
        const r = ShipmentStateMachine.apply(
            snap('in_transit', { trackingMode: 'hybrid' }),
            { kind: 'mark_out_for_delivery' },
            ctx(PARTNER),
        );
        expect(r.ok).toBe(true);
    });
});

// ─── terminal states absorb everything except correct_status ────────────

describe('ShipmentStateMachine.apply — terminal states', () => {
    const TERMINALS: ShipmentStatus[] = ['delivered', 'rto_delivered', 'cancelled', 'lost', 'damaged'];

    for (const t of TERMINALS) {
        it(`rejects non-correct_status commands from ${t}`, () => {
            const r = ShipmentStateMachine.apply(snap(t), { kind: 'mark_in_transit' }, ctx(ADMIN));
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.error.code).toBe('forbidden_from_terminal');
        });

        it(`allows correct_status from ${t} (admin only)`, () => {
            const r = ShipmentStateMachine.apply(
                snap(t),
                { kind: 'correct_status', to: 'in_transit', note: 'reverted by ops' },
                ctx(ADMIN),
            );
            expect(r.ok).toBe(true);
        });
    }
});

// ─── release_hold special command ───────────────────────────────────────

describe('ShipmentStateMachine.apply — release_hold', () => {
    it('returns to previousStatus when admin releases', () => {
        const r = ShipmentStateMachine.apply(
            snap('on_hold', { previousStatus: 'in_transit' }),
            { kind: 'release_hold' },
            ctx(ADMIN),
        );
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.from).toBe('on_hold');
            expect(r.to).toBe('in_transit');
            expect(r.effects).toContain('emit_partner_webhook');
        }
    });

    it('rejects non-admin initiators', () => {
        const r = ShipmentStateMachine.apply(
            snap('on_hold', { previousStatus: 'in_transit' }),
            { kind: 'release_hold' },
            ctx(PARTNER),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_for_initiator');
    });

    it('rejects when shipment is not on_hold', () => {
        const r = ShipmentStateMachine.apply(
            snap('in_transit'),
            { kind: 'release_hold' },
            ctx(ADMIN),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_transition');
    });

    it('rejects when previousStatus is null (no anchor to return to)', () => {
        const r = ShipmentStateMachine.apply(
            snap('on_hold', { previousStatus: null }),
            { kind: 'release_hold' },
            ctx(ADMIN),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('precondition_failed');
    });

    it('rejects when previousStatus would be terminal', () => {
        // Pathological state — shouldn't occur in practice but guard against it.
        const r = ShipmentStateMachine.apply(
            snap('on_hold', { previousStatus: 'delivered' }),
            { kind: 'release_hold' },
            ctx(ADMIN),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('precondition_failed');
    });
});

// ─── correct_status admin override ──────────────────────────────────────

describe('ShipmentStateMachine.apply — correct_status', () => {
    it('admin can force a status change out of a terminal', () => {
        const r = ShipmentStateMachine.apply(
            snap('delivered'),
            { kind: 'correct_status', to: 'undelivered', note: 'consignee disputed delivery' },
            ctx(ADMIN),
        );
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.to).toBe('undelivered');
            expect(r.effects).toContain('notify_ops');
            expect(r.statusReason).toContain('manual_correction');
            expect(r.statusReason).toContain('consignee disputed delivery');
        }
    });

    it('rejects non-admin initiators', () => {
        const r = ShipmentStateMachine.apply(
            snap('delivered'),
            { kind: 'correct_status', to: 'undelivered', note: 'try' },
            ctx(PARTNER),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_for_initiator');
    });

    it('rejects no-op (target equals current)', () => {
        const r = ShipmentStateMachine.apply(
            snap('delivered'),
            { kind: 'correct_status', to: 'delivered', note: 'noop' },
            ctx(ADMIN),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('precondition_failed');
    });
});

// ─── applyEvent() — happy path ──────────────────────────────────────────

describe('ShipmentStateMachine.applyEvent — applied', () => {
    it('applies a legit forward event', () => {
        const result = ShipmentStateMachine.applyEvent(
            snap('picked_up'),
            evt('in_transit', { type: 'shipment.in_transit' }),
            ctx(COURIER),
        );
        expect(result.kind).toBe('applied');
        if (result.kind === 'applied') {
            expect(result.from).toBe('picked_up');
            expect(result.to).toBe('in_transit');
        }
    });

    it('OFD → undelivered is a legit forward edge despite lower rank', () => {
        // OFD rank=50, undelivered rank=45; the transition table makes this a
        // legit forward edge (failed delivery attempt). canTransition succeeds
        // before the stale-by-rank guard fires.
        const result = ShipmentStateMachine.applyEvent(
            snap('out_for_delivery'),
            evt('undelivered'),
            ctx(COURIER),
        );
        expect(result.kind).toBe('applied');
        if (result.kind === 'applied') expect(result.to).toBe('undelivered');
    });

    it('undelivered → out_for_delivery (re-attempt) applies', () => {
        const result = ShipmentStateMachine.applyEvent(
            snap('undelivered'),
            evt('out_for_delivery'),
            ctx(COURIER),
        );
        expect(result.kind).toBe('applied');
        if (result.kind === 'applied') expect(result.to).toBe('out_for_delivery');
    });
});

// ─── applyEvent() — duplicate event behavior ────────────────────────────

describe('ShipmentStateMachine.applyEvent — duplicate events', () => {
    it('event implying the current status returns no_change/same_status', () => {
        const result = ShipmentStateMachine.applyEvent(
            snap('in_transit'),
            evt('in_transit'),
            ctx(COURIER),
        );
        expect(result.kind).toBe('no_change');
        if (result.kind === 'no_change') expect(result.reason).toBe('same_status');
    });

    it('re-fired delivered scan on a delivered shipment is a duplicate', () => {
        const result = ShipmentStateMachine.applyEvent(
            snap('delivered'),
            evt('delivered'),
            ctx(COURIER),
        );
        expect(result.kind).toBe('no_change');
        if (result.kind === 'no_change') expect(result.reason).toBe('same_status');
    });

    it('applying the same event twice in sequence is idempotent on the second call', () => {
        // Simulates the EventIngestor calling applyEvent twice with the same
        // event due to a courier retry that escaped dedup. After the first
        // application, the snapshot has advanced; the second call sees the
        // new state and reports no_change.
        const first = ShipmentStateMachine.applyEvent(
            snap('picked_up'),
            evt('in_transit'),
            ctx(COURIER),
        );
        expect(first.kind).toBe('applied');

        const second = ShipmentStateMachine.applyEvent(
            snap('in_transit'),  // snapshot now reflects the first application
            evt('in_transit'),
            ctx(COURIER),
        );
        expect(second.kind).toBe('no_change');
    });
});

// ─── applyEvent() — stale-by-rank ───────────────────────────────────────

describe('ShipmentStateMachine.applyEvent — stale events', () => {
    it('returns no_change/stale_by_rank when event implies a lower-rank, non-edge status', () => {
        // Shipment is delivered (rank 100); stale OFD scan (rank 50) arrives late.
        // OFD is not a legit edge out of delivered (it's terminal anyway).
        const result = ShipmentStateMachine.applyEvent(
            snap('delivered'),
            evt('out_for_delivery'),
            ctx(COURIER),
        );
        expect(result.kind).toBe('no_change');
        if (result.kind === 'no_change') expect(result.reason).toBe('stale_by_rank');
    });

    it('treats a delayed picked_up scan after in_transit as stale', () => {
        const result = ShipmentStateMachine.applyEvent(
            snap('in_transit'),
            evt('picked_up'),
            ctx(COURIER),
        );
        expect(result.kind).toBe('no_change');
        if (result.kind === 'no_change') expect(result.reason).toBe('stale_by_rank');
    });
});

// ─── applyEvent() — no_status_implied ───────────────────────────────────

describe('ShipmentStateMachine.applyEvent — informational events', () => {
    it('returns no_change/no_status_implied for events without implied status', () => {
        const result = ShipmentStateMachine.applyEvent(
            snap('in_transit'),
            evt(null, { type: 'shipment.arrived_at_hub' }),
            ctx(COURIER),
        );
        expect(result.kind).toBe('no_change');
        if (result.kind === 'no_change') expect(result.reason).toBe('no_status_implied');
    });
});

// ─── applyEvent() — rejected (not stale, genuinely illegal) ─────────────

describe('ShipmentStateMachine.applyEvent — rejected', () => {
    it('returns rejected when event implies a forward status the initiator/mode cannot drive', () => {
        // partner_api implying out_for_delivery on courier+automatic mode.
        // Target rank (50) > current rank (40), so not stale — genuinely forbidden.
        const result = ShipmentStateMachine.applyEvent(
            snap('in_transit'),
            evt('out_for_delivery'),
            ctx(PARTNER),
        );
        expect(result.kind).toBe('rejected');
        if (result.kind === 'rejected') expect(result.error.code).toBe('forbidden_for_mode');
    });
});

// ─── helpers ────────────────────────────────────────────────────────────

describe('ShipmentStateMachine helpers', () => {
    it('isTerminal returns true only for terminal statuses', () => {
        expect(ShipmentStateMachine.isTerminal('delivered')).toBe(true);
        expect(ShipmentStateMachine.isTerminal('cancelled')).toBe(true);
        expect(ShipmentStateMachine.isTerminal('rto_delivered')).toBe(true);
        expect(ShipmentStateMachine.isTerminal('in_transit')).toBe(false);
        expect(ShipmentStateMachine.isTerminal('draft')).toBe(false);
    });

    it('rankOf monotonically increases along the happy-path lifecycle', () => {
        expect(ShipmentStateMachine.rankOf('draft'))
            .toBeLessThan(ShipmentStateMachine.rankOf('booked'));
        expect(ShipmentStateMachine.rankOf('booked'))
            .toBeLessThan(ShipmentStateMachine.rankOf('picked_up'));
        expect(ShipmentStateMachine.rankOf('picked_up'))
            .toBeLessThan(ShipmentStateMachine.rankOf('in_transit'));
        expect(ShipmentStateMachine.rankOf('in_transit'))
            .toBeLessThan(ShipmentStateMachine.rankOf('out_for_delivery'));
        expect(ShipmentStateMachine.rankOf('out_for_delivery'))
            .toBeLessThan(ShipmentStateMachine.rankOf('delivered'));
    });

    it('all terminal statuses share the top rank', () => {
        const delivered = ShipmentStateMachine.rankOf('delivered');
        expect(ShipmentStateMachine.rankOf('cancelled')).toBe(delivered);
        expect(ShipmentStateMachine.rankOf('rto_delivered')).toBe(delivered);
        expect(ShipmentStateMachine.rankOf('lost')).toBe(delivered);
        expect(ShipmentStateMachine.rankOf('damaged')).toBe(delivered);
    });
});
