import type { Address, ParcelInput } from './address';
import type { PartnerId, ShipmentId } from './ids';
import type { CourierCode } from './shipment';
import type { NormalizedEvent, RawTrackingEvent } from './tracking';

// ─── Credentials ────────────────────────────────────────────────────────

// Carrier-specific shape, opaque to the rest of the platform. Each carrier
// adapter knows the keys it expects (apiToken / loginId / customerCode …).
export interface CourierCredentials {
    readonly [key: string]: string | boolean | undefined;
}

// Resolves `(partnerId, courier)` to the credentials to use. Production
// implementation reads from `partners/{id}/courierIntegrations.{courier}`.
// Returns null when the partner has not connected the carrier.
export interface CredentialsResolver {
    resolve(
        partnerId: PartnerId,
        courier: CourierCode,
    ): Promise<CourierCredentials | null>;
}

// ─── Booking-side DTOs ──────────────────────────────────────────────────

export interface QuoteInput {
    readonly partnerId: PartnerId;
    readonly shipmentId: ShipmentId;
    readonly origin: Address;
    readonly destination: Address;
    readonly parcel: ParcelInput;
    readonly serviceCode?: string;       // carrier-specific service tier hint
}

// Raw quote returned by a CourierAdapter — pre-markup, pre-token. The
// public Quote (in types/b2b/quote.ts) is built by QuoteEngine from this
// plus markup rules from the partner's rate card.
export interface CarrierQuote {
    readonly courier: CourierCode;
    readonly serviceCode: string;
    readonly totalPaise: number;
    readonly breakdown: Readonly<Record<string, number>>;
    readonly currency: 'INR';
    readonly etaDays: number | null;
}

export interface BookInput extends QuoteInput {
    // The carrier-native idempotency key. Adapters that support it pass
    // this as `reference_number` (Delhivery, DTDC). For carriers that
    // don't, the saga uses lookupByReference() as a recovery path.
    readonly referenceNumber: string;
    readonly cod?: { amountPaise: number };
}

export interface BookResult {
    readonly awb: string;
    readonly courier: CourierCode;
    readonly serviceCode: string;
    readonly bookedAt: Date;
    readonly costPaise: number;
    readonly etaDays: number | null;
    readonly raw: Readonly<Record<string, unknown>>;
}

// Raw label bytes returned by a CourierAdapter. The LabelStore (port)
// uploads these and produces a LabelArtifact (in types/b2b/label.ts) with
// lifecycle status — that's what's stored on the shipment doc.
export interface CarrierLabel {
    readonly format: 'pdf' | 'png' | 'zpl';
    readonly bytes: Uint8Array;
    readonly filename: string;
}

// ─── Event-side contract (re-export-stable) ─────────────────────────────

export interface CourierEventAdapter {
    readonly courier: CourierCode;
    parseWebhook(payload: unknown): readonly RawTrackingEvent[];
    parsePollResponse(payload: unknown): readonly RawTrackingEvent[];
    normalize(
        raw: RawTrackingEvent,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent;
}

// ─── Booking-side adapter ───────────────────────────────────────────────
//
// Implementations also implement CourierEventAdapter (a single class
// covers both surfaces — parsing carrier payloads is the same code on
// both the webhook intake and the polling intake path).

export interface CourierAdapter extends CourierEventAdapter {
    quote(input: QuoteInput): Promise<CarrierQuote>;

    // Books with carrier-native idempotency where possible
    // (reference_number echoed by Delhivery / DTDC; BlueDart does not).
    book(input: BookInput): Promise<BookResult>;

    // For carriers without native idempotency, the booking saga calls this
    // before a retry: if the carrier already has a booking under our
    // referenceNumber, adopt the existing AWB instead of double-booking.
    // Adapters that DO have native idempotency may return null (saga skips
    // the lookup path).
    lookupByReference(
        referenceNumber: string,
        partnerId: PartnerId,
    ): Promise<{ awb: string } | null>;

    cancel(awb: string, partnerId: PartnerId): Promise<void>;

    generateLabel(awb: string, partnerId: PartnerId): Promise<CarrierLabel>;

    // Returns the carrier's full event history for the AWB. The polling
    // worker normalizes each into a NormalizedEvent and feeds it through
    // EventIngestor.ingest() — dedup handles duplicates with webhook intake.
    pollStatus(
        awb: string,
        partnerId: PartnerId,
    ): Promise<readonly RawTrackingEvent[]>;
}
