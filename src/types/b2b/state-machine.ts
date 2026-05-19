import type { ApiKeyId, PartnerId, UserId } from './ids';
import type {
    CourierCode,
    FulfillmentMode,
    ShipmentStatus,
    TrackingMode,
} from './shipment';
import type { RawTrackingEvent } from './tracking';
import type {
    CancellationReason,
    HoldReason,
    RtoReason,
    UndeliveredReason,
} from './reasons';

// ─── who is driving the transition ───────────────────────────────────────

export const ALL_SYSTEM_JOBS = [
    'auto_rto',
    'reconcile',
    'cleanup',
    'expire_hold',
] as const;
export type SystemJob = typeof ALL_SYSTEM_JOBS[number];

export type StateInitiator =
    | { type: 'partner_api'; partnerId: PartnerId; apiKeyId: ApiKeyId }
    | { type: 'courier_webhook'; courier: CourierCode }
    | { type: 'courier_poll'; courier: CourierCode }
    | { type: 'admin_user'; userId: UserId }
    | { type: 'system'; job: SystemJob };

export type StateInitiatorType = StateInitiator['type'];

export const ALL_INITIATOR_TYPES = [
    'partner_api',
    'courier_webhook',
    'courier_poll',
    'admin_user',
    'system',
] as const satisfies readonly StateInitiatorType[];

// ─── command payloads ────────────────────────────────────────────────────

export interface DeliveryProof {
    signatureUrl?: string;
    photoUrl?: string;
    receivedBy?: string;
    otp?: string;
}

export interface LocationHint {
    city?: string;
    pincode?: string;
    raw?: string;
}

export type TransitionCommand =
    | { kind: 'book' }
    | { kind: 'cancel'; reason: CancellationReason }
    | { kind: 'mark_ready_for_pickup' }
    | { kind: 'mark_picked_up' }
    | { kind: 'mark_in_transit'; location?: LocationHint }
    | { kind: 'mark_out_for_delivery' }
    | { kind: 'mark_delivered'; proof?: DeliveryProof }
    | { kind: 'mark_undelivered'; reason: UndeliveredReason }
    | { kind: 'initiate_rto'; reason: RtoReason }
    | { kind: 'mark_rto_in_transit' }
    | { kind: 'mark_rto_delivered' }
    | { kind: 'mark_lost' }
    | { kind: 'mark_damaged' }
    | { kind: 'put_on_hold'; reason: HoldReason }
    | { kind: 'release_hold' }
    | { kind: 'correct_status'; to: ShipmentStatus; note: string };

export type TransitionCommandKind = TransitionCommand['kind'];

// ─── context surrounding a transition ────────────────────────────────────

export interface TransitionContext {
    initiator: StateInitiator;
    occurredAt: Date;       // when the real-world event happened
    receivedAt: Date;       // when we ingested it
    raw?: RawTrackingEvent; // present for event-driven transitions
}

// Minimal slice of a Shipment that the pure state machine needs. The
// repository (step 3) will project a full Shipment doc down to this shape
// when calling apply()/applyEvent().
export interface ShipmentSnapshot {
    status: ShipmentStatus;
    previousStatus: ShipmentStatus | null;
    fulfillmentMode: FulfillmentMode;
    trackingMode: TrackingMode;
}

// ─── transition effects (declarative side-effects) ───────────────────────

export const ALL_TRANSITION_EFFECTS = [
    'emit_partner_webhook',
    'release_inventory',
    'settle_cod',
    'finalize_billing',
    'archive_label',
    'schedule_rto_pickup',
    'notify_ops',
] as const;
export type TransitionEffect = typeof ALL_TRANSITION_EFFECTS[number];

// ─── results & errors ────────────────────────────────────────────────────

export type TransitionError =
    | { code: 'forbidden_from_terminal'; current: ShipmentStatus }
    | { code: 'forbidden_for_mode'; fulfillmentMode: FulfillmentMode; trackingMode: TrackingMode; reason: string }
    | { code: 'forbidden_for_initiator'; initiator: StateInitiatorType }
    | { code: 'forbidden_transition'; from: ShipmentStatus; command: TransitionCommandKind }
    | { code: 'precondition_failed'; reason: string }
    | { code: 'invalid_command'; reason: string };

// `apply()` returns this — strict, for explicit commands.
export type TransitionResult =
    | {
        ok: true;
        from: ShipmentStatus;
        to: ShipmentStatus;
        effects: readonly TransitionEffect[];
        statusReason: string | null;
    }
    | { ok: false; error: TransitionError };

// `applyEvent()` returns this — lenient, distinguishes ignored from rejected.
export type ApplyEventOutcome =
    | {
        kind: 'applied';
        from: ShipmentStatus;
        to: ShipmentStatus;
        effects: readonly TransitionEffect[];
        statusReason: string | null;
    }
    | {
        kind: 'no_change';
        reason: 'same_status' | 'stale_by_rank' | 'no_status_implied';
    }
    | { kind: 'rejected'; error: TransitionError };

// ─── matcher used by the transition table (re-exported for table) ───────

export interface InitiatorMatcher {
    readonly initiator: StateInitiatorType;
    readonly fulfillmentMode?: readonly FulfillmentMode[];
    readonly trackingMode?: readonly TrackingMode[];
}
