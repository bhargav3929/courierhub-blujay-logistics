import { describe, it, expect } from 'vitest';
import { EventNormalizer } from '../EventNormalizer';
import { ShipmentId } from '../../../../types/b2b/ids';

const SHIP = ShipmentId('ship_1');
const T0 = new Date('2026-05-15T10:00:00Z');
const T1 = new Date('2026-05-15T10:00:05Z');

describe('EventNormalizer.fromManualEvent', () => {
    it('produces a NormalizedEvent with partner_api source', () => {
        const ev = EventNormalizer.fromManualEvent(
            { status: 'out_for_delivery', occurredAt: T0 },
            SHIP,
            T1,
        );
        expect(ev.source).toBe('partner_api');
        expect(ev.impliedStatus).toBe('out_for_delivery');
        expect(ev.type).toBe('shipment.out_for_delivery');
        expect(ev.receivedAt).toEqual(T1);
        expect(ev.occurredAt).toEqual(T0);
    });

    it('carries location when supplied', () => {
        const ev = EventNormalizer.fromManualEvent(
            {
                status: 'picked_up',
                occurredAt: T0,
                location: { city: 'Bengaluru', raw: 'BLR-WHN-01' },
            },
            SHIP,
            T1,
        );
        expect(ev.location.city).toBe('Bengaluru');
        expect(ev.location.raw).toBe('BLR-WHN-01');
        expect(ev.location.pincode).toBeNull();
    });

    it('carries reasonCode as impliedReason for undelivered', () => {
        const ev = EventNormalizer.fromManualEvent(
            {
                status: 'undelivered',
                occurredAt: T0,
                reasonCode: 'customer_unavailable',
            },
            SHIP,
            T1,
        );
        expect(ev.impliedReason).toBe('customer_unavailable');
    });

    it('produces a deterministic dedupKey for identical inputs', () => {
        const a = EventNormalizer.fromManualEvent(
            { status: 'in_transit', occurredAt: T0 },
            SHIP,
            T1,
        );
        const b = EventNormalizer.fromManualEvent(
            { status: 'in_transit', occurredAt: T0 },
            SHIP,
            new Date('2026-05-15T11:00:00Z'), // different receivedAt — should NOT affect dedupKey
        );
        expect(a.dedupKey).toBe(b.dedupKey);
    });

    it('produces different dedupKeys for different occurredAt', () => {
        const a = EventNormalizer.fromManualEvent({ status: 'in_transit', occurredAt: T0 }, SHIP, T1);
        const b = EventNormalizer.fromManualEvent(
            { status: 'in_transit', occurredAt: new Date('2026-05-15T11:00:00Z') },
            SHIP,
            T1,
        );
        expect(a.dedupKey).not.toBe(b.dedupKey);
    });
});

describe('EventNormalizer.fromAdminEvent', () => {
    it('uses admin_ui source and embeds note in description', () => {
        const ev = EventNormalizer.fromAdminEvent(
            { status: 'delivered', occurredAt: T0, note: 'reverted by ops' },
            SHIP,
            T1,
        );
        expect(ev.source).toBe('admin_ui');
        expect(ev.description).toBe('reverted by ops');
        expect(ev.impliedStatus).toBe('delivered');
    });

    it('two admin events with different notes at same instant have different dedupKeys', () => {
        const a = EventNormalizer.fromAdminEvent(
            { status: 'delivered', occurredAt: T0, note: 'first reason' },
            SHIP,
            T1,
        );
        const b = EventNormalizer.fromAdminEvent(
            { status: 'delivered', occurredAt: T0, note: 'second reason' },
            SHIP,
            T1,
        );
        expect(a.dedupKey).not.toBe(b.dedupKey);
    });

    it('two admin events with same note at same instant produce the same dedupKey (double-click dedup)', () => {
        const a = EventNormalizer.fromAdminEvent(
            { status: 'delivered', occurredAt: T0, note: 'same' },
            SHIP,
            T1,
        );
        const b = EventNormalizer.fromAdminEvent(
            { status: 'delivered', occurredAt: T0, note: 'same' },
            SHIP,
            T1,
        );
        expect(a.dedupKey).toBe(b.dedupKey);
    });
});
