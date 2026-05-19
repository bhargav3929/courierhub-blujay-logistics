import type { NextRequest } from 'next/server';
import type { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { CourierCode } from '@/types/b2b/shipment';
import type { NormalizedEvent, RawTrackingEvent } from '@/types/b2b/tracking';

// Per-carrier webhook contract. Concrete impls land in Phase 2 step 5
// (carrier adapters). The HTTP webhook route looks up the handler by
// CourierCode and calls these methods in order:
//
//   1. verifySignature(req, rawBody)  — carrier-specific HMAC or token
//   2. parseEvents(parsedJson)        — one webhook payload → N events
//   3. resolveShipment(event)         — map (carrier, AWB) → our ids
//   4. normalize(event, shipmentId)   — to NormalizedEvent for the ingestor

export type SignatureCheck =
    | { ok: true }
    | { ok: false; reason: string };

export interface CourierWebhookHandler {
    readonly courier: CourierCode;

    // Verify the carrier's signature on the raw (unparsed) request body.
    // Implementations may also check IP allowlists, timestamp drift, etc.
    verifySignature(req: NextRequest, rawBody: string): Promise<SignatureCheck>;

    // Parse the carrier's JSON payload into one or more raw events.
    // Returning an empty array is valid (e.g. a heartbeat ping).
    parseEvents(body: unknown): readonly RawTrackingEvent[];

    // Look up our shipmentId + partnerId from carrier identifiers
    // (typically AWB). Returns null if the AWB doesn't map to a Blujay
    // shipment — the route will log + skip that event.
    resolveShipment(
        event: RawTrackingEvent,
    ): Promise<{ shipmentId: ShipmentId; partnerId: PartnerId } | null>;

    // Carrier-specific raw → normalized translation. Sets the canonical
    // TrackingEventType, derives impliedStatus/Reason, computes dedupKey.
    normalize(
        event: RawTrackingEvent,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent;
}
