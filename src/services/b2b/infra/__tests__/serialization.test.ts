import { describe, it, expect } from 'vitest';
import {
    CURRENT_EVENT_VERSION,
    deserializeEvent,
    serializeEvent,
} from '../serialization';
import { PartnerId } from '../../../../types/b2b/ids';
import type { NormalizedEvent } from '../../../../types/b2b/tracking';

const event: NormalizedEvent = {
    type: 'shipment.in_transit',
    rawCode: 'TEST_CODE',
    source: 'bluedart',
    occurredAt: new Date('2026-05-15T10:00:00Z'),
    receivedAt: new Date('2026-05-15T10:00:05Z'),
    location: { city: 'Bengaluru', pincode: null, raw: 'BLR-HUB' },
    facility: 'BLR-WHN-01',
    description: 'In transit at Bengaluru hub',
    impliedStatus: 'in_transit',
    impliedReason: null,
    dedupKey: 'a'.repeat(64),
};

const partnerId = PartnerId('p_1');

function defaultOpts() {
    return {
        partnerId,
        applied: true,
        appliedReason: 'applied' as const,
        statusTransition: { from: 'picked_up' as const, to: 'in_transit' as const },
        recordedAt: new Date('2026-05-15T10:00:06Z'),
    };
}

describe('serialization — round-trip', () => {
    it('preserves event content through serialize → deserialize', () => {
        const stored = serializeEvent(event, defaultOpts());
        const back = deserializeEvent(stored);
        expect(back.type).toBe(event.type);
        expect(back.rawCode).toBe(event.rawCode);
        expect(back.source).toBe(event.source);
        expect(back.occurredAt.toISOString()).toBe(event.occurredAt.toISOString());
        expect(back.receivedAt.toISOString()).toBe(event.receivedAt.toISOString());
        expect(back.location).toEqual(event.location);
        expect(back.facility).toBe(event.facility);
        expect(back.description).toBe(event.description);
        expect(back.impliedStatus).toBe(event.impliedStatus);
        expect(back.impliedReason).toBe(event.impliedReason);
        expect(back.dedupKey).toBe(event.dedupKey);
    });

    it('Date → Timestamp conversion preserves millisecond precision', () => {
        const oddMillis = new Date(1747300000123);
        const stored = serializeEvent({ ...event, occurredAt: oddMillis }, defaultOpts());
        expect(stored.occurredAt.toMillis()).toBe(oddMillis.getTime());
    });

    it('writes the current event version', () => {
        const stored = serializeEvent(event, defaultOpts());
        expect(stored.eventVersion).toBe(CURRENT_EVENT_VERSION);
    });

    it('carries opts fields (partnerId, applied, appliedReason, statusTransition)', () => {
        const opts = defaultOpts();
        const stored = serializeEvent(event, opts);
        expect(stored.partnerId).toBe(opts.partnerId);
        expect(stored.applied).toBe(opts.applied);
        expect(stored.appliedReason).toBe(opts.appliedReason);
        expect(stored.statusTransition).toEqual(opts.statusTransition);
    });

    it('handles null impliedStatus (informational events)', () => {
        const stored = serializeEvent(
            { ...event, impliedStatus: null, type: 'shipment.arrived_at_hub' },
            defaultOpts(),
        );
        const back = deserializeEvent(stored);
        expect(back.impliedStatus).toBeNull();
    });
});

describe('serialization — defensive deserialization', () => {
    it('throws on unknown event type (schema drift defense)', () => {
        const stored = serializeEvent(event, defaultOpts());
        (stored as { type: string }).type = 'shipment.from_the_future';
        expect(() => deserializeEvent(stored)).toThrow(/unknown event type/);
    });

    it('throws on unknown impliedStatus (corruption defense)', () => {
        const stored = serializeEvent(event, defaultOpts());
        (stored as { impliedStatus: string }).impliedStatus = 'BOGUS_STATUS';
        expect(() => deserializeEvent(stored)).toThrow(/unknown impliedStatus/);
    });
});
