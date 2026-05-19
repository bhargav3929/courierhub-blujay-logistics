import { describe, it, expect } from 'vitest';
import { AuthorityGate } from '../AuthorityGate';
import { buildHybridConfig } from '../hybridConfig';
import type { ShipmentSnapshot } from '../../../../types/b2b/state-machine';
import type { NormalizedEvent } from '../../../../types/b2b/tracking';
import type { TrackingMode, ShipmentStatus } from '../../../../types/b2b/shipment';

const snap = (
    trackingMode: TrackingMode,
    status: ShipmentStatus = 'in_transit',
): ShipmentSnapshot => ({
    status,
    previousStatus: null,
    fulfillmentMode: 'courier',
    trackingMode,
});

const evt = (
    source: NormalizedEvent['source'],
    impliedStatus: NormalizedEvent['impliedStatus'],
): NormalizedEvent => ({
    type: 'shipment.in_transit',
    rawCode: 'TEST',
    source,
    occurredAt: new Date('2026-05-15T10:00:00Z'),
    receivedAt: new Date('2026-05-15T10:00:05Z'),
    location: { city: null, pincode: null, raw: null },
    facility: null,
    description: 'test',
    impliedStatus,
    impliedReason: null,
    dedupKey: 'test-key',
});

describe('AuthorityGate — automatic mode', () => {
    it('allows courier events', () => {
        const r = AuthorityGate.evaluate(snap('automatic'), evt('bluedart', 'in_transit'), null);
        expect(r.allowProjection).toBe(true);
    });

    it('blocks partner events', () => {
        const r = AuthorityGate.evaluate(snap('automatic'), evt('partner_api', 'in_transit'), null);
        expect(r.allowProjection).toBe(false);
        if (!r.allowProjection) expect(r.reason).toBe('partner_event_in_automatic_mode');
    });
});

describe('AuthorityGate — manual mode', () => {
    it('allows partner events', () => {
        const r = AuthorityGate.evaluate(snap('manual'), evt('partner_api', 'in_transit'), null);
        expect(r.allowProjection).toBe(true);
    });

    it('blocks courier events', () => {
        const r = AuthorityGate.evaluate(snap('manual'), evt('bluedart', 'in_transit'), null);
        expect(r.allowProjection).toBe(false);
        if (!r.allowProjection) expect(r.reason).toBe('courier_event_in_manual_mode');
    });
});

describe('AuthorityGate — hybrid mode (default config: switch at in_transit)', () => {
    it('blocks courier events with rank beyond switchover (out_for_delivery > in_transit)', () => {
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('bluedart', 'out_for_delivery'), null);
        expect(r.allowProjection).toBe(false);
        if (!r.allowProjection) expect(r.reason).toBe('beyond_courier_authority');
    });

    it('allows courier events at or below switchover rank', () => {
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('bluedart', 'in_transit'), null);
        expect(r.allowProjection).toBe(true);
    });

    it('allows courier events well below switchover (picked_up)', () => {
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('bluedart', 'picked_up'), null);
        expect(r.allowProjection).toBe(true);
    });

    it('blocks partner events below partner authority rank', () => {
        // Default partnerAuthorityFromRank = 50 (out_for_delivery).
        // Partner pushing picked_up (rank 30) → blocked.
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('partner_api', 'picked_up'), null);
        expect(r.allowProjection).toBe(false);
        if (!r.allowProjection) expect(r.reason).toBe('below_partner_authority');
    });

    it('allows partner events at partner authority rank (out_for_delivery)', () => {
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('partner_api', 'out_for_delivery'), null);
        expect(r.allowProjection).toBe(true);
    });

    it('allows partner events above partner authority rank (delivered)', () => {
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('partner_api', 'delivered'), null);
        expect(r.allowProjection).toBe(true);
    });
});

describe('AuthorityGate — hybrid mode with custom config', () => {
    it('respects an early switchover (at picked_up)', () => {
        const cfg = buildHybridConfig('picked_up');
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('bluedart', 'in_transit'), cfg);
        // courier event implying in_transit (rank 40) > switch rank 30 → blocked
        expect(r.allowProjection).toBe(false);
    });

    it('respects a late switchover (at out_for_delivery)', () => {
        const cfg = buildHybridConfig('out_for_delivery');
        const r = AuthorityGate.evaluate(snap('hybrid'), evt('bluedart', 'out_for_delivery'), cfg);
        // courier OFD (rank 50) at switch rank 50 — allowed (until-inclusive)
        expect(r.allowProjection).toBe(true);
    });
});

describe('AuthorityGate — override sources', () => {
    it('admin_ui events pass regardless of tracking mode', () => {
        for (const mode of ['automatic', 'manual', 'hybrid'] as const) {
            const r = AuthorityGate.evaluate(snap(mode), evt('admin_ui', 'delivered'), null);
            expect(r.allowProjection).toBe(true);
        }
    });

    it('system events pass regardless of tracking mode', () => {
        for (const mode of ['automatic', 'manual', 'hybrid'] as const) {
            const r = AuthorityGate.evaluate(snap(mode), evt('system', 'cancelled'), null);
            expect(r.allowProjection).toBe(true);
        }
    });
});

describe('AuthorityGate — informational events', () => {
    it('events with no impliedStatus pass through (recorded but no projection move)', () => {
        const r = AuthorityGate.evaluate(snap('automatic'), evt('partner_api', null), null);
        expect(r.allowProjection).toBe(true);
    });
});
