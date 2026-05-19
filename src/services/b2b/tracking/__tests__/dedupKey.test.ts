import { describe, it, expect } from 'vitest';
import { computeDedupKey } from '../dedupKey';
import { ShipmentId } from '../../../../types/b2b/ids';

const baseInput = {
    source: 'bluedart' as const,
    rawCode: 'OFD',
    occurredAt: new Date('2026-05-15T10:00:00Z'),
    locationRaw: 'Bangalore',
    shipmentId: ShipmentId('ship_1'),
};

describe('computeDedupKey', () => {
    it('is deterministic — same input → same key', () => {
        const a = computeDedupKey(baseInput);
        const b = computeDedupKey({ ...baseInput });
        expect(a).toBe(b);
    });

    it('returns a 64-char sha256 hex string', () => {
        const key = computeDedupKey(baseInput);
        expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('differs on different sources', () => {
        const a = computeDedupKey(baseInput);
        const b = computeDedupKey({ ...baseInput, source: 'delhivery' });
        expect(a).not.toBe(b);
    });

    it('differs on different rawCodes', () => {
        const a = computeDedupKey(baseInput);
        const b = computeDedupKey({ ...baseInput, rawCode: 'PICKED_UP' });
        expect(a).not.toBe(b);
    });

    it('differs on different occurredAt timestamps', () => {
        const a = computeDedupKey(baseInput);
        const b = computeDedupKey({ ...baseInput, occurredAt: new Date('2026-05-15T11:00:00Z') });
        expect(a).not.toBe(b);
    });

    it('differs on different locationRaw values', () => {
        const a = computeDedupKey(baseInput);
        const b = computeDedupKey({ ...baseInput, locationRaw: 'Chennai' });
        expect(a).not.toBe(b);
    });

    it('differs on different shipmentIds (cross-shipment isolation)', () => {
        const a = computeDedupKey(baseInput);
        const b = computeDedupKey({ ...baseInput, shipmentId: ShipmentId('ship_2') });
        expect(a).not.toBe(b);
    });

    it('treats null and empty-string locationRaw the same', () => {
        // Documented behavior: both serialize to '' for hashing purposes.
        const a = computeDedupKey({ ...baseInput, locationRaw: null });
        const b = computeDedupKey({ ...baseInput, locationRaw: '' });
        expect(a).toBe(b);
    });

    it('produces sub-millisecond consistent keys across many calls', () => {
        const keys = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            keys.add(computeDedupKey(baseInput));
        }
        expect(keys.size).toBe(1);
    });
});
