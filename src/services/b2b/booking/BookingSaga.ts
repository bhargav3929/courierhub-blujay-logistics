import type {
    BookInput,
    CourierAdapter,
} from '@/types/b2b/courier-adapter';
import { ApiKeyId, ShipmentId, type PartnerId } from '@/types/b2b/ids';
import type {
    BookingSagaState,
} from '@/types/b2b/booking';
import type {
    Clock,
    IdempotencyStore,
    LabelStore,
    RateCardStore,
    ShipmentWriter,
} from '@/types/b2b/ports';
import type { SagaStep } from '@/types/b2b/saga';
import type { CourierCode } from '@/types/b2b/shipment';
import type { LabelArtifact } from '@/types/b2b/label';
import type { EventIngestor } from '@/services/b2b/tracking/EventIngestor';
import { EventNormalizer } from '@/services/b2b/tracking';
import { CarrierError } from '@/services/b2b/couriers/shared/carrierErrors';
import { getLogger } from '@/services/b2b/http/logger';
import { commitIdempotency } from '@/services/b2b/http';
import { SelfShipmentLabelGenerator } from '../label/SelfShipmentLabelGenerator';
import { buildPricingSnapshot } from './PricingSnapshot';

// Booking saga: nine ordered steps with compensations on the side-effect
// steps. Codified from Phase 1 Part B §8.
//
// "Must succeed" steps: 1-5. Failure of any one triggers compensation in
// reverse. Compensations are only meaningful for steps 2 and 4 (the others
// are pure or write-only-to-our-side).
//
// "Best effort" steps: 6-9. They internally swallow failures, log warnings,
// and return state unchanged. The booking succeeds even if a label upload
// fails — partners can re-request labels asynchronously.

const log = getLogger('b2b.booking.saga');

export interface BookingSagaDeps {
    readonly idempotencyStore: IdempotencyStore;
    readonly shipmentWriter: ShipmentWriter;
    readonly rateCardStore: RateCardStore;
    readonly getAdapter: (courier: CourierCode) => CourierAdapter | null;
    readonly eventIngestor: EventIngestor;
    readonly labelStore: LabelStore;
    readonly clock: Clock;
    readonly selfShipmentLabelGenerator: SelfShipmentLabelGenerator;
}

// Internal saga errors carry a stable code that BookingService maps to the
// public BookingFailureReason. Throwing a SagaError aborts forward
// progress and triggers compensation.
export class SagaError extends Error {
    constructor(
        public readonly stepName: string,
        public readonly reason: string,
        public readonly detail?: string,
        public readonly indeterminate = false,
    ) {
        super(`saga[${stepName}] ${reason}${detail ? `: ${detail}` : ''}`);
        this.name = 'SagaError';
    }
}

export function buildBookingSteps(deps: BookingSagaDeps): SagaStep<BookingSagaState>[] {
    // Idempotency reservation lives at the HTTP route layer (Phase 3 Step 3).
    // The route already reserved before invoking BookingService; the saga's
    // persist_draft step is itself atomic on (partnerId, idempotencyKey)
    // via the ShipmentWriter index. Defense in depth without redundancy.
    return [
        persistDraftStep(deps),
        resolvePricingStep(deps),
        bookCourierStep(deps),
        markBookedStep(deps),
        generateLabelStep(deps),
        commitPricingStep(deps),
        enqueueWebhookStep(deps),
        commitIdempotencyStep(deps),
    ];
}

// ─── Step 1: persist_draft (atomic create-or-find) ──────────────────────

function persistDraftStep(deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'persist_draft',
        async run(state) {
            const req = state.request;
            const fulfillmentMode = req.fulfillmentMode;
            const trackingMode = req.trackingMode
                ?? (fulfillmentMode === 'self_shipment' ? 'manual' : 'automatic');

            const result = await deps.shipmentWriter.createDraft({
                partnerId: state.partnerId,
                idempotencyKey: state.idempotencyKey,
                apiKeyId: ApiKeyId(state.apiKeyId),
                clientId: req.clientId,
                externalRef: req.externalRef,
                fulfillmentMode,
                trackingMode,
                origin: req.origin,
                destination: req.destination,
                parcel: req.parcel,
                metadata: req.metadata,
            });
            const shipmentId = result.created
                ? result.shipmentId
                : result.existingShipmentId;
            return { ...state, shipmentId, draftCreated: result.created };
        },
        async compensate(state) {
            // The draft is harmless: it sits at status='draft' with no
            // events, no carrier binding. It will be GC'd by a sweep job
            // OR re-used if the partner retries with the same key.
            // We deliberately do NOT delete it — that would lose the
            // audit trail of "this booking was attempted and failed".
            log.debug('persist_draft compensation: draft retained for audit', {
                shipmentId: state.shipmentId,
            });
        },
    };
}

// ─── Step 3: resolve_pricing ────────────────────────────────────────────

function resolvePricingStep(deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'resolve_pricing',
        async run(state) {
            const req = state.request;

            // Self-shipment: no carrier, no carrier quote. Use a zeroed
            // snapshot — partners price their own self-shipments off-book.
            if (req.fulfillmentMode === 'self_shipment') {
                return {
                    ...state,
                    selectedCourier: null,
                    selectedServiceCode: 'self',
                    pricing: {
                        courier: null,
                        serviceCode: 'self',
                        baseFreightPaise: 0,
                        fuelSurchargePaise: 0,
                        codHandlingPaise: 0,
                        otherChargesPaise: 0,
                        gstPaise: 0,
                        markupPaise: 0,
                        totalPaise: 0,
                        currency: 'INR',
                        rateCardId: null,
                        rateCardVersion: null,
                        quotedAt: deps.clock.now(),
                        quoteToken: null,
                        appliedRules: [],
                    },
                };
            }

            const courier = pickCourier(req.preferredCourier);
            const adapter = deps.getAdapter(courier);
            if (!adapter) {
                throw new SagaError('resolve_pricing', 'no_carrier_eligible', `no adapter for '${courier}'`);
            }

            const carrierQuote = await adapter.quote({
                partnerId: state.partnerId,
                shipmentId: state.shipmentId ?? ShipmentId('pending'),
                origin: req.origin,
                destination: req.destination,
                parcel: req.parcel,
                serviceCode: req.preferredServiceCode,
            }).catch((err) => {
                if (err instanceof CarrierError && err.category === 'permanent') {
                    throw new SagaError('resolve_pricing', 'carrier_rejected', err.rawMessage);
                }
                throw new SagaError('resolve_pricing', 'carrier_unavailable', String(err));
            });

            const rateCard = await deps.rateCardStore.findActive(
                state.partnerId,
                req.clientId ?? null,
                deps.clock.now(),
            );

            const built = buildPricingSnapshot({
                partnerId: state.partnerId,
                courier,
                carrierQuote,
                rateCard,
                parcel: req.parcel,
                quoteToken: req.quoteToken,
                requestHashInputs: {
                    originPincode: req.origin.pincode,
                    destinationPincode: req.destination.pincode,
                    weightGrams: req.parcel.weightGrams,
                    isCod: req.parcel.isCod,
                    codAmountPaise: req.parcel.codAmountPaise,
                },
            });

            switch (built.kind) {
                case 'ok':
                    return {
                        ...state,
                        selectedCourier: courier,
                        selectedServiceCode: built.snapshot.serviceCode,
                        pricing: built.snapshot,
                    };
                case 'token_mismatch':
                    throw new SagaError(
                        'resolve_pricing',
                        'quote_token_mismatch',
                        `locked=${built.tokenPaise}p fresh=${built.freshPaise}p`,
                    );
                case 'token_invalid':
                    throw new SagaError(
                        'resolve_pricing',
                        built.reason === 'expired' ? 'quote_token_expired' : 'quote_token_invalid',
                        built.reason,
                    );
            }
        },
    };
}

// ─── Step 4: book_courier ──────────────────────────────────────────────

function bookCourierStep(deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'book_courier',
        async run(state) {
            if (state.selectedCourier === null) {
                // self_shipment — no carrier booking. Synthesize a Blujay-issued
                // tracking number; AWB stays null.
                return state;
            }
            const adapter = deps.getAdapter(state.selectedCourier);
            if (!adapter) {
                throw new SagaError('book_courier', 'no_carrier_eligible', `no adapter for '${state.selectedCourier}'`);
            }
            if (!state.shipmentId) {
                throw new SagaError('book_courier', 'invalid_state', 'shipmentId is null at book step');
            }

            const bookInput: BookInput = {
                partnerId: state.partnerId,
                shipmentId: state.shipmentId,
                origin: state.request.origin,
                destination: state.request.destination,
                parcel: state.request.parcel,
                serviceCode: state.selectedServiceCode ?? undefined,
                referenceNumber: state.shipmentId,
                cod: state.request.parcel.isCod
                    ? { amountPaise: state.request.parcel.codAmountPaise }
                    : undefined,
            };

            try {
                const result = await adapter.book(bookInput);
                return {
                    ...state,
                    awb: result.awb,
                    rawBookResult: result.raw as Record<string, unknown>,
                };
            } catch (err) {
                if (err instanceof CarrierError) {
                    if (err.category === 'permanent') {
                        throw new SagaError('book_courier', 'carrier_rejected', err.rawMessage);
                    }
                    // Transient or unknown: try to recover via lookupByReference.
                    // The carrier may have accepted the booking despite the
                    // timeout. Find existing AWB → adopt; not found → mark
                    // indeterminate for the reconciler.
                    try {
                        const existing = await adapter.lookupByReference(
                            state.shipmentId,
                            state.partnerId,
                        );
                        if (existing) {
                            log.info('book recovered via lookupByReference', {
                                shipmentId: state.shipmentId,
                                awb: existing.awb,
                            });
                            return { ...state, awb: existing.awb, rawBookResult: null };
                        }
                    } catch (lookupErr) {
                        log.warn('lookupByReference failed during book recovery', {
                            shipmentId: state.shipmentId,
                            error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
                        });
                    }
                    throw new SagaError(
                        'book_courier',
                        'booking_failed_indeterminate',
                        err.rawMessage,
                        true,
                    );
                }
                throw new SagaError('book_courier', 'carrier_unavailable', String(err));
            }
        },
        async compensate(state) {
            // We created a booking at the carrier. Cancel it.
            if (!state.awb || !state.selectedCourier) return;
            const adapter = deps.getAdapter(state.selectedCourier);
            if (!adapter) return;
            try {
                await adapter.cancel(state.awb, state.partnerId);
                log.info('book_courier compensation: AWB cancelled', {
                    courier: state.selectedCourier,
                    awb: state.awb,
                });
            } catch (err) {
                log.error('book_courier compensation FAILED — manual cancel required', {
                    courier: state.selectedCourier,
                    awb: state.awb,
                    error: err instanceof Error ? err.message : String(err),
                });
                // Re-throw so the SagaRunner surfaces compensation_failed.
                throw err;
            }
        },
    };
}

// ─── Step 5: mark_booked (attach carrier + transition via ingestor) ─────

function markBookedStep(deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'mark_booked',
        async run(state) {
            if (!state.shipmentId) {
                throw new SagaError('mark_booked', 'invalid_state', 'shipmentId is null');
            }

            // Attach carrier first (non-event field write).
            if (state.selectedCourier && state.awb) {
                await deps.shipmentWriter.attachCarrier({
                    partnerId: state.partnerId,
                    shipmentId: state.shipmentId,
                    courier: state.selectedCourier,
                    awb: state.awb,
                    serviceCode: state.selectedServiceCode ?? '',
                    bookedAt: deps.clock.now(),
                });
            }

            // Now apply the draft → booked transition via the ingestor.
            // System-driven event; same funnel as everything else.
            const event = EventNormalizer.fromAdminEvent(
                {
                    status: 'booked',
                    occurredAt: deps.clock.now(),
                    note: `system:booking_saga:${state.idempotencyKey}`,
                },
                state.shipmentId,
                deps.clock.now(),
            );
            // Adjust source to 'system' since this is internal, not admin UI.
            const systemEvent = { ...event, source: 'system' as const };
            const result = await deps.eventIngestor.ingest({
                event: systemEvent,
                initiator: { type: 'system', job: 'reconcile' },
                shipmentId: state.shipmentId,
                partnerId: state.partnerId,
            });
            if (result.outcome === 'rejected') {
                throw new SagaError('mark_booked', 'projection_failed', JSON.stringify(result.error));
            }
            return { ...state, shipmentMarkedBooked: true };
        },
        // No compensation here — book_courier's compensation already cancels
        // the AWB. The shipment doc remains at status='booked' but a
        // reconciler will catch the orphan (booked AWB with no carrier
        // record) and force cancel via correct_status.
    };
}

// ─── Step 6: generate_label (best-effort) ───────────────────────────────

function generateLabelStep(deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'generate_label',
        async run(state) {
            if (!state.shipmentId) return state;

            // ─── self-shipment: generate locally, synchronously ────
            // No external API, no retry loop — if the local generator
            // fails we go straight to `failed` (no point retrying a
            // deterministic function with the same inputs).
            if (!state.selectedCourier || !state.awb) {
                try {
                    const carrierLabel = await deps.selfShipmentLabelGenerator.generate({
                        shipmentId: state.shipmentId,
                        origin: state.request.origin,
                        destination: state.request.destination,
                        parcel: state.request.parcel,
                    });
                    const put = await deps.labelStore.put({
                        partnerId: state.partnerId,
                        shipmentId: state.shipmentId,
                        bytes: carrierLabel.bytes,
                        format: carrierLabel.format,
                    });
                    const artifact: LabelArtifact = {
                        status: 'available',
                        format: carrierLabel.format,
                        labelRef: put.labelRef,
                        retrievedAt: deps.clock.now(),
                        lastError: null,
                        attempts: 1,
                    };
                    return { ...state, labelArtifact: artifact };
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    log.error('self-shipment label generation failed', {
                        shipmentId: state.shipmentId,
                        error: message,
                    });
                    const artifact: LabelArtifact = {
                        status: 'failed',
                        format: null,
                        labelRef: null,
                        retrievedAt: null,
                        lastError: message,
                        attempts: 1,
                    };
                    return { ...state, labelArtifact: artifact };
                }
            }

            const adapter = deps.getAdapter(state.selectedCourier);
            if (!adapter) return state;

            try {
                const carrierLabel = await adapter.generateLabel(state.awb, state.partnerId);
                const put = await deps.labelStore.put({
                    partnerId: state.partnerId,
                    shipmentId: state.shipmentId,
                    bytes: carrierLabel.bytes,
                    format: carrierLabel.format,
                });
                const artifact: LabelArtifact = {
                    status: 'available',
                    format: carrierLabel.format,
                    labelRef: put.labelRef,
                    retrievedAt: deps.clock.now(),
                    lastError: null,
                    attempts: 1,
                };
                return { ...state, labelArtifact: artifact };
            } catch (err) {
                // Best-effort: log and continue. LabelRetrievalJob retries later.
                const message = err instanceof Error ? err.message : String(err);
                log.warn('generate_label failed — partner can re-request later', {
                    shipmentId: state.shipmentId,
                    error: message,
                });
                const artifact: LabelArtifact = {
                    status: 'pending',
                    format: null,
                    labelRef: null,
                    retrievedAt: null,
                    lastError: message,
                    attempts: 1,
                };
                return { ...state, labelArtifact: artifact };
            }
        },
        async compensate(state) {
            // If a label was uploaded, remove it. The doc-level reference is
            // not yet attached (commit_pricing/label step runs later), so a
            // dangling stored object would otherwise leak.
            if (state.labelArtifact?.status === 'available' && state.labelArtifact.labelRef) {
                try {
                    await deps.labelStore.delete(state.labelArtifact.labelRef);
                } catch (err) {
                    log.warn('label store delete failed during compensation', {
                        labelRef: state.labelArtifact.labelRef,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }
        },
    };
}

// ─── Step 7: commit_pricing_snapshot (best-effort) ─────────────────────

function commitPricingStep(deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'commit_pricing',
        async run(state) {
            if (!state.shipmentId || !state.pricing) return state;
            try {
                await deps.shipmentWriter.attachPricing({
                    partnerId: state.partnerId,
                    shipmentId: state.shipmentId,
                    pricing: state.pricing,
                });
                if (state.labelArtifact) {
                    await deps.shipmentWriter.attachLabel({
                        partnerId: state.partnerId,
                        shipmentId: state.shipmentId,
                        artifact: state.labelArtifact,
                    });
                }
            } catch (err) {
                log.warn('commit_pricing failed — reconciler will retry', {
                    shipmentId: state.shipmentId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            return state;
        },
    };
}

// ─── Step 8: enqueue_partner_webhook (best-effort, no-op for now) ──────

function enqueueWebhookStep(_deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'enqueue_partner_webhook',
        async run(state) {
            // The state machine's `mark_booked` already emitted an event
            // through EventIngestor in step 5, which dispatches
            // `emit_partner_webhook` via the QueuedEffectDispatcher.
            // This step is a placeholder for any additional booking-specific
            // notifications partners subscribe to (e.g. shipment.booked.label).
            return { ...state, outboundWebhookEnqueued: true };
        },
    };
}

// ─── Step 9: commit_idempotency (best-effort) ───────────────────────────

function commitIdempotencyStep(deps: BookingSagaDeps): SagaStep<BookingSagaState> {
    return {
        name: 'commit_idempotency',
        async run(state) {
            // Body is committed by BookingService.book() after the saga
            // returns. We just flag that the saga reached this point.
            return { ...state, idempotencyCommitted: true };
        },
    };
}

// ─── helpers ────────────────────────────────────────────────────────────

function pickCourier(preferred: CourierCode | undefined): CourierCode {
    return preferred ?? 'bluedart';     // fallback default; BookingService should set explicitly
}

// Re-exported for BookingService to call.
export { commitIdempotency };

// Re-export the partner-id type for symmetry — keeps imports tidy in the
// service file.
export type { PartnerId };
