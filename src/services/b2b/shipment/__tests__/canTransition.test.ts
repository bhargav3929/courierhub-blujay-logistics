import { describe, it, expect } from 'vitest';
import { canTransition, destinationOf } from '../canTransition';

// canTransition is the pure boolean+diagnostic gate behind the state machine.
// Tests focus on the lookup behavior and the three failure modes:
//   forbidden_transition, forbidden_for_initiator, forbidden_for_mode.

describe('canTransition — happy paths', () => {
    it('partner_api can book a draft shipment', () => {
        const r = canTransition({
            from: 'draft', command: 'book', initiator: 'partner_api',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.to).toBe('booked');
            expect(r.effects).toContain('emit_partner_webhook');
        }
    });

    it('courier_webhook can mark in_transit from picked_up', () => {
        const r = canTransition({
            from: 'picked_up', command: 'mark_in_transit', initiator: 'courier_webhook',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.to).toBe('in_transit');
    });

    it('mark_delivered carries settle_cod and finalize_billing', () => {
        const r = canTransition({
            from: 'out_for_delivery', command: 'mark_delivered', initiator: 'courier_webhook',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.effects).toContain('settle_cod');
            expect(r.effects).toContain('finalize_billing');
        }
    });

    it('initiate_rto from undelivered schedules rto_pickup', () => {
        const r = canTransition({
            from: 'undelivered', command: 'initiate_rto', initiator: 'admin_user',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.effects).toContain('schedule_rto_pickup');
    });
});

describe('canTransition — illegal transitions', () => {
    it('returns forbidden_transition for unknown (from, command) pair', () => {
        const r = canTransition({
            from: 'draft', command: 'mark_delivered', initiator: 'admin_user',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_transition');
    });

    it('returns forbidden_for_initiator when initiator is not in allow list', () => {
        // courier_webhook is never authorized to put_on_hold.
        const r = canTransition({
            from: 'in_transit', command: 'put_on_hold', initiator: 'courier_webhook',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_for_initiator');
    });

    it('returns forbidden_for_mode when initiator is listed but mode does not match', () => {
        // partner_api can drive mark_in_transit only in self_shipment OR hybrid.
        const r = canTransition({
            from: 'picked_up', command: 'mark_in_transit', initiator: 'partner_api',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_for_mode');
    });
});

describe('canTransition — mode gating', () => {
    it('partner_api succeeds in self_shipment mode for mark_in_transit', () => {
        const r = canTransition({
            from: 'picked_up', command: 'mark_in_transit', initiator: 'partner_api',
            fulfillmentMode: 'self_shipment', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
    });

    it('partner_api succeeds in hybrid tracking mode for mark_in_transit', () => {
        const r = canTransition({
            from: 'picked_up', command: 'mark_in_transit', initiator: 'partner_api',
            fulfillmentMode: 'courier', trackingMode: 'hybrid',
        });
        expect(r.ok).toBe(true);
    });

    it('partner_api succeeds in self_shipment for mark_rto_in_transit', () => {
        // RTO transitions only allow partner_api in self_shipment (not hybrid).
        const r = canTransition({
            from: 'rto_initiated', command: 'mark_rto_in_transit', initiator: 'partner_api',
            fulfillmentMode: 'self_shipment', trackingMode: 'manual',
        });
        expect(r.ok).toBe(true);
    });

    it('partner_api fails in hybrid for mark_rto_in_transit (self_shipment-only edge)', () => {
        const r = canTransition({
            from: 'rto_initiated', command: 'mark_rto_in_transit', initiator: 'partner_api',
            fulfillmentMode: 'courier', trackingMode: 'hybrid',
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe('forbidden_for_mode');
    });

    it('partner_api can always initiate_rto from undelivered regardless of mode', () => {
        const r = canTransition({
            from: 'undelivered', command: 'initiate_rto', initiator: 'partner_api',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
    });
});

describe('canTransition — initiator coverage', () => {
    it('admin_user can drive cancel from booked', () => {
        const r = canTransition({
            from: 'booked', command: 'cancel', initiator: 'admin_user',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
    });

    it('system can drive cancel from draft (cleanup job)', () => {
        const r = canTransition({
            from: 'draft', command: 'cancel', initiator: 'system',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
    });

    it('courier_poll can mark_delivered (poll-based reconciliation)', () => {
        const r = canTransition({
            from: 'out_for_delivery', command: 'mark_delivered', initiator: 'courier_poll',
            fulfillmentMode: 'courier', trackingMode: 'automatic',
        });
        expect(r.ok).toBe(true);
    });
});

describe('destinationOf', () => {
    it('returns the destination for an existing edge', () => {
        expect(destinationOf('booked', 'mark_ready_for_pickup')).toBe('ready_for_pickup');
        expect(destinationOf('out_for_delivery', 'mark_delivered')).toBe('delivered');
    });

    it('returns null for a non-existent edge', () => {
        expect(destinationOf('draft', 'mark_delivered')).toBeNull();
        expect(destinationOf('in_transit', 'book')).toBeNull();
    });
});
