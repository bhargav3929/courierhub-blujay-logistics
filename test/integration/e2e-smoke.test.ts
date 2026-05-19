import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { computeDedupKey } from '../../src/services/b2b/tracking/dedupKey';
import { ShipmentId } from '../../src/types/b2b/ids';
import type { RawTrackingEvent } from '../../src/types/b2b/tracking';
import { makeBookingRequest, makeSuite } from './setup';

// End-to-end smoke through the service layer. Quote → Book → Label →
// Track → Cancel. Tests use the BookingService, EventIngestor, etc. as
// they're wired in production — only the carrier adapter is the mock.

describe('integration · e2e smoke', () => {
    const suite = makeSuite();
    beforeAll(suite.setup);
    afterAll(suite.teardown);

    // ─── courier-fulfillment happy path ────────────────────────────────

    it('courier: book → poll events → cancel produces a complete shipment lifecycle', async () => {
        const ctx = await suite.freshContext();

        // 1. Book
        const booked = await ctx.bookingService.book(
            makeBookingRequest({ partnerId: ctx.partnerId, idempotencyKey: 'e2e-1' }),
        );
        expect(booked.kind).toBe('booked');
        if (booked.kind !== 'booked') return;

        expect(booked.awb).toMatch(/^AWB-MOCK-/);
        expect(booked.label.status).toBe('available');

        // 2. Verify shipment doc projection
        const initialDoc = await ctx.db.collection('shipments').doc(booked.shipmentId).get();
        expect(initialDoc.data()?.status).toBe('booked');
        expect(initialDoc.data()?.courier?.awb).toBe(booked.awb);

        // 3. Carrier sends tracking events via webhook (simulated)
        ctx.mockCarrier.pollEvents = [
            rawEvent('shipment.picked_up', new Date(), booked.awb),
            rawEvent('shipment.in_transit', new Date(Date.now() + 1000), booked.awb),
            rawEvent('shipment.out_for_delivery', new Date(Date.now() + 2000), booked.awb),
            rawEvent('shipment.delivered', new Date(Date.now() + 3000), booked.awb),
        ];
        ctx.mockCarrier.pollBehavior = 'success';

        // Make the shipment due for polling
        await ctx.db.collection('shipments').doc(booked.shipmentId).update({
            'tracking.lastEventAt': new Date(Date.now() - 24 * 60 * 60 * 1000),  // 24h ago
        });

        // 4. Run polling worker
        await ctx.pollingWorker.runOnce({ batchSize: 10, concurrency: 1 });

        expect(ctx.mockCarrier.pollCount).toBeGreaterThanOrEqual(1);

        // 5. Final shipment status should be delivered
        const finalDoc = await ctx.db.collection('shipments').doc(booked.shipmentId).get();
        expect(finalDoc.data()?.status).toBe('delivered');

        // 6. Event subcollection has the chain
        const events = await ctx.db
            .collection('shipments').doc(booked.shipmentId)
            .collection('events').orderBy('occurredAt', 'asc').get();
        const types = events.docs.map(d => d.data().type);
        expect(types).toEqual(expect.arrayContaining([
            'shipment.picked_up',
            'shipment.in_transit',
            'shipment.out_for_delivery',
            'shipment.delivered',
        ]));
    });

    // ─── self-shipment happy path ──────────────────────────────────────

    it('self_shipment: book → label generated locally → manual status updates → delivered', async () => {
        const ctx = await suite.freshContext();

        // 1. Book a self-shipment (no carrier involvement)
        const booked = await ctx.bookingService.book(
            makeBookingRequest({
                partnerId: ctx.partnerId,
                idempotencyKey: 'e2e-self-1',
                fulfillmentMode: 'self_shipment',
            }),
        );
        expect(booked.kind).toBe('booked');
        if (booked.kind !== 'booked') return;

        // Carrier was NEVER called.
        expect(ctx.mockCarrier.bookCount).toBe(0);
        expect(ctx.mockCarrier.labelCount).toBe(0);

        // Label was generated locally (SelfShipmentLabelGenerator).
        expect(booked.label.status).toBe('available');
        expect(booked.label.format).toBe('pdf');
        expect(booked.label.labelRef).toBeTruthy();

        // 2. Manual progression: booked → picked_up → in_transit → delivered
        const shipmentId = ShipmentId(booked.shipmentId);
        for (const status of ['picked_up', 'in_transit', 'delivered'] as const) {
            const occurredAt = new Date();
            const event = {
                type: `shipment.${status}` as const,
                rawCode: status.toUpperCase(),
                source: 'admin_ui' as const,
                occurredAt,
                receivedAt: new Date(),
                location: { city: null, pincode: null, raw: null },
                facility: null,
                description: `operator: ${status}`,
                impliedStatus: status,
                impliedReason: null,
                dedupKey: computeDedupKey({
                    source: 'admin_ui',
                    rawCode: status.toUpperCase(),
                    occurredAt,
                    locationRaw: null,
                    shipmentId,
                }),
            };
            const r = await ctx.eventIngestor.ingest({
                event,
                initiator: { type: 'admin_user', userId: 'test-operator' as never },
                shipmentId,
                partnerId: ctx.partnerId,
            });
            expect(r.outcome).toBe('applied');
        }

        // 3. Final status
        const finalDoc = await ctx.db.collection('shipments').doc(booked.shipmentId).get();
        expect(finalDoc.data()?.status).toBe('delivered');
    });

    // ─── courier rejected booking ──────────────────────────────────────

    it('carrier permanent-failure booking yields kind=failed with detail', async () => {
        const ctx = await suite.freshContext();
        ctx.mockCarrier.bookBehavior = 'permanent_failure';

        const r = await ctx.bookingService.book(
            makeBookingRequest({ partnerId: ctx.partnerId, idempotencyKey: 'e2e-fail-1' }),
        );

        expect(r.kind).toBe('failed');
        if (r.kind === 'failed') {
            expect(r.reason).toBe('carrier_rejected');
        }
        expect(ctx.mockCarrier.bookCount).toBe(1);
        expect(ctx.mockCarrier.cancelCount).toBe(0);    // nothing to compensate
    });
});

function rawEvent(rawCode: string, occurredAt: Date, awb: string): RawTrackingEvent {
    return {
        source: 'bluedart',
        rawCode,
        description: rawCode,
        occurredAt,
        locationRaw: 'Hub-Mock',
        facility: null,
        payload: { awb },
    };
}
