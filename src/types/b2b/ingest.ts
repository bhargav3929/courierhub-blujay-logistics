import type { EventId, PartnerId, ShipmentId } from './ids';
import type { ShipmentStatus } from './shipment';
import type { EventSource, NormalizedEvent } from './tracking';
import type {
    StateInitiator,
    StateInitiatorType,
    TransitionEffect,
    TransitionError,
} from './state-machine';

// ─── input ───────────────────────────────────────────────────────────────

export interface IngestInput {
    readonly event: NormalizedEvent;
    readonly initiator: StateInitiator;
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
}

// ─── authority block reasons (also exported for AuthorityGate) ──────────

export const ALL_AUTHORITY_BLOCK_REASONS = [
    'beyond_courier_authority',
    'below_partner_authority',
    'partner_event_in_automatic_mode',
    'courier_event_in_manual_mode',
] as const;
export type AuthorityBlockReason = typeof ALL_AUTHORITY_BLOCK_REASONS[number];

// ─── outcomes ────────────────────────────────────────────────────────────

export type IngestResult =
    | {
        outcome: 'applied';
        eventId: EventId;
        from: ShipmentStatus;
        to: ShipmentStatus;
        effects: readonly TransitionEffect[];
    }
    | {
        outcome: 'duplicate';
        existingEventId: EventId;
    }
    | {
        outcome: 'no_change';
        reason: 'same_status' | 'stale_by_rank' | 'no_status_implied';
        recordedEventId: EventId;
    }
    | {
        outcome: 'authority_blocked';
        reason: AuthorityBlockReason;
        recordedEventId: EventId;
    }
    | {
        outcome: 'illegal_recorded';
        recordedEventId: EventId;
        transitionError: TransitionError;
    }
    | {
        outcome: 'projection_conflict';
        recordedEventId: EventId;
        detail: string;
    }
    | {
        outcome: 'rejected';
        error: IngestError;
    };

// ─── errors (only for `rejected` outcome) ────────────────────────────────

export type IngestError =
    | { code: 'shipment_not_found' }
    | { code: 'initiator_source_mismatch'; initiator: StateInitiatorType; eventSource: EventSource }
    | { code: 'future_event'; detail: string }
    | { code: 'state_transition_forbidden'; transitionError: TransitionError };
