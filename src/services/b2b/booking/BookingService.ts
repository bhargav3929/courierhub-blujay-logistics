import type {
    BookingRequest,
    BookingResult,
    BookingFailureReason,
    BookingSagaState,
} from '@/types/b2b/booking';
import { emptyBookingSagaState } from '@/types/b2b/booking';
import type { SagaCheckpointStore } from '@/types/b2b/saga';
import { SagaRunner } from '../saga/SagaRunner';
import { getLogger } from '@/services/b2b/http/logger';
import { commitIdempotency } from '@/services/b2b/http';
import {
    buildBookingSteps,
    type BookingSagaDeps,
    SagaError,
} from './BookingSaga';
import type { LabelArtifact } from '@/types/b2b/label';

// Thin façade over the booking saga.
//
//   const service = new BookingService({ saga deps + checkpoint store });
//   const result = await service.book(request);
//
// The route handler (Phase 3 Step 2 or later) just translates HTTP →
// BookingRequest → result → HTTP response.

const log = getLogger('b2b.booking.service');

export interface BookingServiceDeps extends BookingSagaDeps {
    readonly checkpointStore: SagaCheckpointStore<BookingSagaState>;
}

export class BookingService {
    private readonly runner: SagaRunner<BookingSagaState>;
    private readonly steps;

    constructor(private readonly deps: BookingServiceDeps) {
        this.runner = new SagaRunner<BookingSagaState>(deps.checkpointStore);
        this.steps = buildBookingSteps(deps);
    }

    async book(request: BookingRequest, requestId?: string): Promise<BookingResult> {
        const initialState = emptyBookingSagaState(request);
        const sagaId = `book::${request.partnerId}::${request.idempotencyKey}`;

        const outcome = await this.runner.run({
            sagaId,
            initialState,
            steps: this.steps,
            requestId,
        });

        switch (outcome.kind) {
            case 'completed':
                return this.toBookedResult(outcome.finalState, /* replay */ false);
            case 'compensated':
                return this.toFailedResult(outcome.lastState, outcome.failedStep, outcome.error);
            case 'compensation_failed':
                log.error('booking saga compensation failed — manual ops review required', {
                    requestId,
                    sagaId,
                    failedStep: outcome.failedStep,
                    error: outcome.compensationError.message,
                });
                return this.toFailedResult(
                    outcome.lastState,
                    outcome.failedStep,
                    outcome.compensationError,
                );
        }
    }

    // ─── Post-saga: cache the response in idempotency store ─────────────
    //
    // The HTTP route layer calls this after `book()` returns, using the
    // built BookingResult as the cached body. Sequencing this in
    // BookingService rather than the route keeps idempotency one concern.
    async cacheResponse(
        partnerId: BookingRequest['partnerId'],
        idempotencyKey: string,
        httpStatus: number,
        body: unknown,
    ): Promise<void> {
        try {
            await commitIdempotency(
                this.deps.idempotencyStore,
                partnerId,
                idempotencyKey,
                httpStatus,
                body,
            );
        } catch (err) {
            log.warn('idempotency commit failed in BookingService', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    // ─── result builders ────────────────────────────────────────────────

    private toBookedResult(state: BookingSagaState, replay: boolean): BookingResult {
        if (!state.shipmentId || !state.pricing) {
            return {
                kind: 'failed',
                reason: 'internal_error',
                detail: 'saga completed but shipment or pricing was null',
            };
        }
        const label: LabelArtifact = state.labelArtifact ?? {
            status: 'pending',
            format: null,
            labelRef: null,
            retrievedAt: null,
            lastError: null,
            attempts: 0,
        };
        return {
            kind: 'booked',
            shipmentId: state.shipmentId,
            courier: state.selectedCourier,
            awb: state.awb,
            pricing: state.pricing,
            label,
            replay,
        };
    }

    private toFailedResult(
        state: BookingSagaState,
        failedStep: string,
        error: Error,
    ): BookingResult {
        const reason = mapSagaErrorToFailureReason(failedStep, error);
        // If we got past book_courier and the failure is indeterminate, surface
        // as the special "carrier may or may not have accepted" result so the
        // partner / route handler can render it correctly. Reconciliation job
        // will probe and update later.
        if (reason === 'booking_failed_indeterminate' && state.shipmentId) {
            return {
                kind: 'cancelled_during_booking',
                shipmentId: state.shipmentId,
                reason,
                detail: error.message,
            };
        }
        return {
            kind: 'failed',
            reason,
            detail: error.message,
            shipmentId: state.shipmentId ?? undefined,
        };
    }
}

// ─── error → reason mapping ─────────────────────────────────────────────

function mapSagaErrorToFailureReason(
    failedStep: string,
    error: Error,
): BookingFailureReason {
    if (error instanceof SagaError) {
        switch (error.reason) {
            case 'idempotency_mismatch':       return 'idempotency_mismatch';
            case 'idempotency_in_progress':    return 'idempotency_in_progress';
            case 'no_carrier_eligible':        return 'no_carrier_eligible';
            case 'carrier_rejected':           return 'carrier_rejected';
            case 'carrier_unavailable':        return 'carrier_unavailable';
            case 'booking_failed_indeterminate': return 'booking_failed_indeterminate';
            case 'projection_failed':          return 'projection_failed';
            case 'quote_token_invalid':        return 'quote_token_invalid';
            case 'quote_token_expired':        return 'quote_token_expired';
            case 'quote_token_mismatch':       return 'quote_token_mismatch';
            default:                            break;
        }
    }
    // Unknown saga failure — map by step for partner-readable error.
    if (failedStep === 'resolve_pricing')  return 'carrier_unavailable';
    if (failedStep === 'book_courier')     return 'carrier_unavailable';
    return 'internal_error';
}
