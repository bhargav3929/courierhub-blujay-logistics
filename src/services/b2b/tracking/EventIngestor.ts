import type {
    IngestError,
    IngestInput,
    IngestResult,
} from '@/types/b2b/ingest';
import type {
    AppliedReason,
    Clock,
    EffectDispatcher,
    EventStore,
    ProjectionWriter,
    ShipmentReader,
} from '@/types/b2b/ports';
import { StaleVersionError } from '@/types/b2b/ports';
import type {
    StateInitiator,
    StateInitiatorType,
    TransitionContext,
} from '@/types/b2b/state-machine';
import type { EventSource, NormalizedEvent } from '@/types/b2b/tracking';
import { ShipmentStateMachine } from '../shipment/ShipmentStateMachine';
import { AuthorityGate } from './AuthorityGate';

// The single entry point for every tracking event in the system. Each
// upstream caller (carrier webhook receiver, polling worker, partner API
// endpoint, admin UI) is responsible for producing a NormalizedEvent and
// the matching StateInitiator. After that, treatment is uniform.

export interface EventIngestorDeps {
    readonly shipmentReader: ShipmentReader;
    readonly eventStore: EventStore;
    readonly projectionWriter: ProjectionWriter;
    readonly effectDispatcher: EffectDispatcher;
    readonly clock: Clock;
    // Allow injecting a tighter tolerance in tests. Default 5 minutes.
    readonly futureToleranceMs?: number;
}

const DEFAULT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export class EventIngestor {
    private readonly futureToleranceMs: number;

    constructor(private readonly deps: EventIngestorDeps) {
        this.futureToleranceMs = deps.futureToleranceMs ?? DEFAULT_FUTURE_TOLERANCE_MS;
    }

    async ingest(input: IngestInput): Promise<IngestResult> {
        const { event, initiator, shipmentId, partnerId } = input;

        // ─── Step 1: initiator-source consistency ────────────────────────
        const sourceCheck = validateInitiatorMatchesEventSource(initiator, event);
        if (!sourceCheck.ok) {
            return { outcome: 'rejected', error: sourceCheck.error };
        }

        // ─── Step 2: clock-skew guard (future events) ────────────────────
        const now = this.deps.clock.now();
        const skewMs = event.occurredAt.getTime() - now.getTime();
        if (skewMs > this.futureToleranceMs) {
            return {
                outcome: 'rejected',
                error: {
                    code: 'future_event',
                    detail: `occurredAt is ${skewMs}ms in the future (tolerance ${this.futureToleranceMs}ms)`,
                },
            };
        }

        // ─── Step 3: load shipment context ───────────────────────────────
        const ctx = await this.deps.shipmentReader.load(partnerId, shipmentId);
        if (!ctx) {
            return { outcome: 'rejected', error: { code: 'shipment_not_found' } };
        }

        // ─── Step 4: authority gate (tracking-mode authority) ────────────
        const authority = AuthorityGate.evaluate(ctx.snapshot, event, ctx.hybridConfig);
        if (!authority.allowProjection) {
            const appliedReason = mapAuthorityReason(authority.reason);
            const append = await this.deps.eventStore.appendOrFindDuplicate({
                shipmentId,
                partnerId,
                event,
                applied: false,
                appliedReason,
                statusTransition: null,
            });
            if (!append.stored) {
                return { outcome: 'duplicate', existingEventId: append.existingEventId };
            }
            return {
                outcome: 'authority_blocked',
                reason: authority.reason,
                recordedEventId: append.eventId,
            };
        }

        // ─── Step 5: state machine consultation ──────────────────────────
        const transitionCtx: TransitionContext = {
            initiator,
            occurredAt: event.occurredAt,
            receivedAt: event.receivedAt,
        };
        const sm = ShipmentStateMachine.applyEvent(ctx.snapshot, event, transitionCtx);

        // ─── Step 6: no_change outcomes (same_status / stale / informational)
        if (sm.kind === 'no_change') {
            const appliedReason: AppliedReason =
                sm.reason === 'same_status' ? 'same_status'
                : sm.reason === 'stale_by_rank' ? 'stale_by_rank'
                : 'no_status_implied';
            const append = await this.deps.eventStore.appendOrFindDuplicate({
                shipmentId,
                partnerId,
                event,
                applied: false,
                appliedReason,
                statusTransition: null,
            });
            if (!append.stored) {
                return { outcome: 'duplicate', existingEventId: append.existingEventId };
            }
            return {
                outcome: 'no_change',
                reason: sm.reason,
                recordedEventId: append.eventId,
            };
        }

        // ─── Step 7: rejected outcomes ───────────────────────────────────
        if (sm.kind === 'rejected') {
            const isCarrierDriven =
                initiator.type === 'courier_webhook' || initiator.type === 'courier_poll';

            if (isCarrierDriven) {
                // Carrier said this happened; record for audit even though
                // the transition is illegal. Operators can use correct_status
                // to reconcile manually.
                const append = await this.deps.eventStore.appendOrFindDuplicate({
                    shipmentId,
                    partnerId,
                    event,
                    applied: false,
                    appliedReason: 'transition_forbidden',
                    statusTransition: null,
                });
                if (!append.stored) {
                    return { outcome: 'duplicate', existingEventId: append.existingEventId };
                }
                return {
                    outcome: 'illegal_recorded',
                    recordedEventId: append.eventId,
                    transitionError: sm.error,
                };
            }
            // Partner / admin pushed something illegal — bad API call,
            // not a real-world event. Don't pollute the log.
            return {
                outcome: 'rejected',
                error: { code: 'state_transition_forbidden', transitionError: sm.error },
            };
        }

        // ─── Step 8: applied — store event, then advance projection ──────
        const append = await this.deps.eventStore.appendOrFindDuplicate({
            shipmentId,
            partnerId,
            event,
            applied: true,
            appliedReason: 'applied',
            statusTransition: { from: sm.from, to: sm.to },
        });
        if (!append.stored) {
            // Race or retry: another caller stored this exact event first.
            // Skip projection write to avoid double-advancing.
            return { outcome: 'duplicate', existingEventId: append.existingEventId };
        }

        try {
            await this.deps.projectionWriter.update({
                shipmentId,
                partnerId,
                expectedVersion: ctx.stateVersion,
                nextStatus: sm.to,
                previousStatus: sm.from,
                statusReason: sm.statusReason,
                lastEventAt: event.occurredAt,
            });
        } catch (err) {
            if (err instanceof StaleVersionError) {
                // Concurrent advance won the race. Our event is durably in
                // the log; the projection reflects the other event already.
                // The reconciler (or the next legit event) will catch up.
                return {
                    outcome: 'projection_conflict',
                    recordedEventId: append.eventId,
                    detail: err.message,
                };
            }
            throw err;
        }

        // ─── Step 9: dispatch effects (only after projection success) ────
        await this.deps.effectDispatcher.dispatch({
            shipmentId,
            partnerId,
            eventId: append.eventId,
            effects: sm.effects,
            from: sm.from,
            to: sm.to,
        });

        return {
            outcome: 'applied',
            eventId: append.eventId,
            from: sm.from,
            to: sm.to,
            effects: sm.effects,
        };
    }
}

// ─── helpers ────────────────────────────────────────────────────────────

const COURIER_SOURCES: ReadonlySet<EventSource> = new Set<EventSource>([
    'bluedart',
    'delhivery',
    'dtdc',
]);

type SourceCheck =
    | { ok: true }
    | { ok: false; error: IngestError };

function validateInitiatorMatchesEventSource(
    initiator: StateInitiator,
    event: NormalizedEvent,
): SourceCheck {
    const src = event.source;
    switch (initiator.type) {
        case 'partner_api':
            if (src !== 'partner_api') return mismatch(initiator.type, src);
            return { ok: true };
        case 'courier_webhook':
        case 'courier_poll':
            if (!COURIER_SOURCES.has(src) || src !== initiator.courier) {
                return mismatch(initiator.type, src);
            }
            return { ok: true };
        case 'admin_user':
            if (src !== 'admin_ui') return mismatch(initiator.type, src);
            return { ok: true };
        case 'system':
            if (src !== 'system') return mismatch(initiator.type, src);
            return { ok: true };
    }
}

function mismatch(
    initiator: StateInitiatorType,
    eventSource: EventSource,
): { ok: false; error: IngestError } {
    return {
        ok: false,
        error: { code: 'initiator_source_mismatch', initiator, eventSource },
    };
}

function mapAuthorityReason(reason: string): AppliedReason {
    switch (reason) {
        case 'beyond_courier_authority': return 'authority_blocked_courier';
        case 'below_partner_authority': return 'authority_blocked_partner';
        case 'partner_event_in_automatic_mode':
        case 'courier_event_in_manual_mode':
            return 'authority_blocked_wrong_source';
        default:
            // Safe fallback — should never hit if AuthorityBlockReason
            // is exhaustive.
            return 'authority_blocked_wrong_source';
    }
}
