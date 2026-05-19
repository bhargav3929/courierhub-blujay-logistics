import type { AddressInput, ParcelInput } from './address';
import type { ClientId, PartnerId, ShipmentId } from './ids';
import type { LabelArtifact } from './label';
import type { PricingSnapshot } from './pricing';
import type {
    CourierCode,
    FulfillmentMode,
    TrackingMode,
} from './shipment';

// ─── BookingRequest (public API input) ─────────────────────────────────

export interface BookingRequest {
    readonly partnerId: PartnerId;
    readonly idempotencyKey: string;
    readonly apiKeyId: string;
    readonly externalRef?: string;
    readonly clientId?: ClientId;
    readonly fulfillmentMode: FulfillmentMode;
    readonly trackingMode?: TrackingMode;
    readonly origin: AddressInput;
    readonly destination: AddressInput;
    readonly parcel: ParcelInput;

    // Pricing: either pass back a quote token (price-locked) OR a
    // preferred courier (re-quote at book time).
    readonly quoteToken?: string;
    readonly preferredCourier?: CourierCode;
    readonly preferredServiceCode?: string;

    readonly metadata?: Readonly<Record<string, unknown>>;
}

// ─── BookingResult (terminal saga outcome) ─────────────────────────────

export type BookingResult =
    | {
        kind: 'booked';
        shipmentId: ShipmentId;
        courier: CourierCode | null;            // null for self_shipment
        awb: string | null;                      // null for self_shipment
        pricing: PricingSnapshot;
        label: LabelArtifact;
        replay: boolean;                          // true if returned from idempotency cache
    }
    | {
        kind: 'cancelled_during_booking';
        shipmentId: ShipmentId;
        reason: BookingFailureReason;
        detail?: string;
    }
    | {
        kind: 'failed';
        reason: BookingFailureReason;
        detail?: string;
        shipmentId?: ShipmentId;                 // present if a draft was created
    };

export type BookingFailureReason =
    | 'validation_failed'
    | 'serviceability_failed'
    | 'no_carrier_eligible'
    | 'quote_token_invalid'
    | 'quote_token_expired'
    | 'quote_token_mismatch'
    | 'rate_card_excludes'
    | 'carrier_rejected'
    | 'carrier_unavailable'
    | 'booking_failed_indeterminate'             // carrier timed out; reconciler will probe
    | 'projection_failed'
    | 'idempotency_mismatch'
    | 'idempotency_in_progress'
    | 'internal_error';

// ─── BookingSagaState — the saga's working set ────────────────────────
//
// Each step reads/writes this. Optional fields are written by their owner
// step and read by later steps. After the saga commits, this state is the
// authoritative record of "what happened during this booking" — preserved
// in the SagaCheckpointStore for audit.

export interface BookingSagaState {
    // Provided by the request envelope (immutable through saga lifetime)
    readonly partnerId: PartnerId;
    readonly idempotencyKey: string;
    readonly apiKeyId: string;
    readonly request: BookingRequest;

    // Populated by saga steps
    shipmentId: ShipmentId | null;
    draftCreated: boolean;
    pricing: PricingSnapshot | null;
    selectedCourier: CourierCode | null;
    selectedServiceCode: string | null;
    awb: string | null;
    rawBookResult: Record<string, unknown> | null;
    shipmentMarkedBooked: boolean;
    labelArtifact: LabelArtifact | null;
    outboundWebhookEnqueued: boolean;
    idempotencyCommitted: boolean;

    // Indeterminate-failure flag — true if the book step couldn't tell
    // whether the carrier accepted. The reconciler reads this.
    awaitingCarrierReconciliation: boolean;

    // Step-by-step error history (for audit / debugging)
    errors: Array<{ step: string; error: string; at: string }>;
}

export function emptyBookingSagaState(
    request: BookingRequest,
): BookingSagaState {
    return {
        partnerId: request.partnerId,
        idempotencyKey: request.idempotencyKey,
        apiKeyId: request.apiKeyId,
        request,
        shipmentId: null,
        draftCreated: false,
        pricing: null,
        selectedCourier: null,
        selectedServiceCode: null,
        awb: null,
        rawBookResult: null,
        shipmentMarkedBooked: false,
        labelArtifact: null,
        outboundWebhookEnqueued: false,
        idempotencyCommitted: false,
        awaitingCarrierReconciliation: false,
        errors: [],
    };
}
