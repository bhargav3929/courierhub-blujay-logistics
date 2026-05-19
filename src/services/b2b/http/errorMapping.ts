import type { ZodError } from 'zod';
import type {
    ApiError,
    FieldError,
} from '@/types/b2b/http';
import type {
    IngestError,
    IngestResult,
} from '@/types/b2b/ingest';
import type {
    ShipmentStatus,
} from '@/types/b2b/shipment';
import type {
    TransitionEffect,
    TransitionError,
} from '@/types/b2b/state-machine';
import { buildError } from './envelope';

// ─── zod → ApiError ─────────────────────────────────────────────────────

export function zodErrorToApiError(zerr: ZodError): ApiError {
    const fieldErrors: FieldError[] = zerr.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        code: issue.code,
        message: issue.message,
    }));
    return buildError('invalid_request', 'Request validation failed', { fieldErrors });
}

// ─── IngestError → ApiError + HTTP status ───────────────────────────────

export function ingestErrorToApiError(
    error: IngestError,
): { httpStatus: number; apiError: ApiError } {
    switch (error.code) {
        case 'shipment_not_found':
            return {
                httpStatus: 404,
                apiError: buildError('not_found', 'Shipment not found'),
            };
        case 'initiator_source_mismatch':
            return {
                httpStatus: 400,
                apiError: buildError(
                    'invalid_request',
                    `Initiator '${error.initiator}' cannot drive events from source '${error.eventSource}'`,
                ),
            };
        case 'future_event':
            return {
                httpStatus: 400,
                apiError: buildError('invalid_request', 'occurredAt is in the future', {
                    detail: error.detail,
                }),
            };
        case 'state_transition_forbidden':
            return {
                httpStatus: 409,
                apiError: buildError(
                    'state_transition_forbidden',
                    transitionErrorMessage(error.transitionError),
                ),
            };
    }
}

function transitionErrorMessage(error: TransitionError): string {
    switch (error.code) {
        case 'forbidden_from_terminal':
            return `Shipment is in terminal status '${error.current}'; transition not allowed`;
        case 'forbidden_for_mode':
            return `Transition not allowed in fulfillmentMode=${error.fulfillmentMode}, trackingMode=${error.trackingMode}: ${error.reason}`;
        case 'forbidden_for_initiator':
            return `Initiator '${error.initiator}' is not allowed to drive this transition`;
        case 'forbidden_transition':
            return `Command '${error.command}' is not a valid transition from '${error.from}'`;
        case 'precondition_failed':
            return error.reason;
        case 'invalid_command':
            return error.reason;
    }
}

// ─── IngestResult → unified API outcome ─────────────────────────────────
//
// Recorded outcomes (applied / duplicate / no_change / authority_blocked /
// illegal_recorded / projection_conflict) are returned as 200 with a body
// that tells the caller exactly what happened. Only the `rejected` outcome
// maps to a 4xx — those are bad requests.

export interface IngestApiData {
    readonly eventId: string;
    readonly applied: boolean;
    readonly outcome:
        | 'applied'
        | 'duplicate'
        | 'same_status'
        | 'stale_by_rank'
        | 'no_status_implied'
        | 'authority_blocked'
        | 'illegal_recorded'
        | 'projection_conflict';
    readonly fromStatus?: ShipmentStatus;
    readonly toStatus?: ShipmentStatus;
    readonly effects?: readonly TransitionEffect[];
    readonly authorityReason?: string;
    readonly transitionErrorCode?: string;
}

export type IngestApiOutcome =
    | { ok: true; status: number; data: IngestApiData }
    | { ok: false; status: number; error: ApiError };

export function mapIngestResult(result: IngestResult): IngestApiOutcome {
    switch (result.outcome) {
        case 'applied':
            return {
                ok: true,
                status: 200,
                data: {
                    eventId: result.eventId,
                    applied: true,
                    outcome: 'applied',
                    fromStatus: result.from,
                    toStatus: result.to,
                    effects: result.effects,
                },
            };
        case 'duplicate':
            return {
                ok: true,
                status: 200,
                data: {
                    eventId: result.existingEventId,
                    applied: false,
                    outcome: 'duplicate',
                },
            };
        case 'no_change':
            return {
                ok: true,
                status: 200,
                data: {
                    eventId: result.recordedEventId,
                    applied: false,
                    outcome: result.reason,
                },
            };
        case 'authority_blocked':
            return {
                ok: true,
                status: 200,
                data: {
                    eventId: result.recordedEventId,
                    applied: false,
                    outcome: 'authority_blocked',
                    authorityReason: result.reason,
                },
            };
        case 'illegal_recorded':
            return {
                ok: true,
                status: 200,
                data: {
                    eventId: result.recordedEventId,
                    applied: false,
                    outcome: 'illegal_recorded',
                    transitionErrorCode: result.transitionError.code,
                },
            };
        case 'projection_conflict':
            return {
                ok: true,
                status: 200,
                data: {
                    eventId: result.recordedEventId,
                    applied: false,
                    outcome: 'projection_conflict',
                },
            };
        case 'rejected': {
            const { httpStatus, apiError } = ingestErrorToApiError(result.error);
            return { ok: false, status: httpStatus, error: apiError };
        }
    }
}
