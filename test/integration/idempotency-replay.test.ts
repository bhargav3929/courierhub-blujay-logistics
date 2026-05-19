import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { computeDedupKey } from '../../src/services/b2b/tracking/dedupKey';
import { ShipmentId } from '../../src/types/b2b/ids';
import { makeBookingRequest, makeSuite } from './setup';

// Idempotency + replay safety. Critical property: doing the same thing
// twice has the same result, never duplicates, never advances state on
// stale or duplicate input.

describe('integration · idempotency + replay', () => {
    const suite = makeSuite();
    beforeAll(suite.setup);
    afterAll(suite.teardown);

    // ─── booking idempotency ──────────────────────────────────────────

    it('same idempotency key resolves to the same shipmentId', async () => {
        const ctx = await suite.freshContext();
        const req = makeBookingRequest({
            partnerId: ctx.partnerId,
            idempotencyKey: 'idem-fixed-001',
        });

        const first = await ctx.bookingService.book(req);
        const second = await ctx.bookingService.book(req);

        expect(first.kind).toBe('booked');
        expect(second.kind).toBe('booked');
        if (first.kind === 'booked' && second.kind === 'booked') {
            expect(second.shipmentId).toBe(first.shipmentId);
            expect(second.awb).toBe(first.awb);
        }
        // Carrier was called only once.
        expect(ctx.mockCarrier.bookCount).toBe(1);
    });

    it('different idempotency keys produce different shipments', async () => {
        const ctx = await suite.freshContext();
        const r1 = await ctx.bookingService.book(
            makeBookingRequest({ partnerId: ctx.partnerId, idempotencyKey: 'idem-A' }),
        );
        const r2 = await ctx.bookingService.book(
            makeBookingRequest({ partnerId: ctx.partnerId, idempotencyKey: 'idem-B' }),
        );
        expect(r1.kind).toBe('booked');
        expect(r2.kind).toBe('booked');
        if (r1.kind === 'booked' && r2.kind === 'booked') {
            expect(r1.shipmentId).not.toBe(r2.shipmentId);
        }
        expect(ctx.mockCarrier.bookCount).toBe(2);
    });

    // ─── event ingestion idempotency ─────────────────────────────────

    it('duplicate event (same dedupKey) is recognized as duplicate', async () => {
        const ctx = await suite.freshContext();
        const book = await ctx.bookingService.book(
            makeBookingRequest({ partnerId: ctx.partnerId, idempotencyKey: 'idem-evt-dup' }),
        );
        if (book.kind !== 'booked') throw new Error(`expected booked, got ${book.kind}`);
        const shipmentId = ShipmentId(book.shipmentId);

        const occurredAt = new Date();
        const event = {
            type: 'shipment.in_transit' as const,
            rawCode: 'shipment.in_transit',
            source: 'bluedart' as const,
            occurredAt,
            receivedAt: new Date(),
            location: { city: null, pincode: null, raw: 'Hub-1' },
            facility: null,
            description: 'in transit',
            impliedStatus: 'in_transit' as const,
            impliedReason: null,
            dedupKey: computeDedupKey({
                source: 'bluedart',
                rawCode: 'shipment.in_transit',
                occurredAt,
                locationRaw: 'Hub-1',
                shipmentId,
            }),
        };
        const initiator = { type: 'courier_webhook' as const, courier: 'bluedart' as const };

        const first = await ctx.eventIngestor.ingest({
            event, initiator, shipmentId, partnerId: ctx.partnerId,
        });
        const second = await ctx.eventIngestor.ingest({
            event, initiator, shipmentId, partnerId: ctx.partnerId,
        });

        expect(first.outcome).toBe('applied');
        expect(second.outcome).toBe('duplicate');
    });

    it('stale-by-rank event is recorded but does not regress the projection', async () => {
        const ctx = await suite.freshContext();
        const book = await ctx.bookingService.book(
            makeBookingRequest({ partnerId: ctx.partnerId, idempotencyKey: 'idem-stale' }),
        );
        if (book.kind !== 'booked') throw new Error('booking failed');
        const shipmentId = ShipmentId(book.shipmentId);
        const initiator = { type: 'courier_webhook' as const, courier: 'bluedart' as const };

        // Advance to in_transit
        const t1 = new Date();
        await ctx.eventIngestor.ingest({
            event: makeEvt('shipment.in_transit', 'in_transit', t1, shipmentId),
            initiator, shipmentId, partnerId: ctx.partnerId,
        });

        // Then advance to out_for_delivery
        const t2 = new Date(t1.getTime() + 1000);
        await ctx.eventIngestor.ingest({
            event: makeEvt('shipment.out_for_delivery', 'out_for_delivery', t2, shipmentId),
            initiator, shipmentId, partnerId: ctx.partnerId,
        });

        // Now arrive a stale picked_up event (lower rank than out_for_delivery)
        const stale = new Date(t2.getTime() - 60_000);
        const result = await ctx.eventIngestor.ingest({
            event: makeEvt('shipment.picked_up', 'picked_up', stale, shipmentId),
            initiator, shipmentId, partnerId: ctx.partnerId,
        });
        expect(result.outcome).toBe('no_change');
        if (result.outcome === 'no_change') {
            expect(result.reason).toBe('stale_by_rank');
        }

        // Verify projection still at out_for_delivery
        const shipDoc = await ctx.db.collection('shipments').doc(shipmentId).get();
        expect(shipDoc.data()?.status).toBe('out_for_delivery');
    });

    it('event implying the current status is no_change/same_status', async () => {
        const ctx = await suite.freshContext();
        const book = await ctx.bookingService.book(
            makeBookingRequest({ partnerId: ctx.partnerId, idempotencyKey: 'idem-same' }),
        );
        if (book.kind !== 'booked') throw new Error('booking failed');
        const shipmentId = ShipmentId(book.shipmentId);
        const initiator = { type: 'courier_webhook' as const, courier: 'bluedart' as const };

        await ctx.eventIngestor.ingest({
            event: makeEvt('shipment.in_transit', 'in_transit', new Date(), shipmentId),
            initiator, shipmentId, partnerId: ctx.partnerId,
        });

        // Same status again with a different timestamp + raw code so dedup
        // doesn't catch it — the state-machine `same_status` branch should.
        const dup = makeEvt('shipment.in_transit', 'in_transit', new Date(Date.now() + 1000), shipmentId);
        // Force a different dedupKey by mutating rawCode slightly.
        const sameStatusEvent = { ...dup, rawCode: 'in_transit_again', dedupKey: dup.dedupKey + 'X' };
        const r = await ctx.eventIngestor.ingest({
            event: sameStatusEvent, initiator, shipmentId, partnerId: ctx.partnerId,
        });
        expect(r.outcome).toBe('no_change');
        if (r.outcome === 'no_change') expect(r.reason).toBe('same_status');
    });
});

// ─── helper to build NormalizedEvent inline ────────────────────────────

function makeEvt(
    type: 'shipment.picked_up' | 'shipment.in_transit' | 'shipment.out_for_delivery' | 'shipment.delivered',
    impliedStatus: 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered',
    occurredAt: Date,
    shipmentId: ReturnType<typeof ShipmentId>,
) {
    return {
        type,
        rawCode: type,
        source: 'bluedart' as const,
        occurredAt,
        receivedAt: new Date(),
        location: { city: null, pincode: null, raw: 'Hub-X' },
        facility: null,
        description: type,
        impliedStatus,
        impliedReason: null,
        dedupKey: computeDedupKey({
            source: 'bluedart',
            rawCode: type,
            occurredAt,
            locationRaw: 'Hub-X',
            shipmentId,
        }),
    };
}
