import type {
    ApplyEventOutcome,
    ShipmentSnapshot,
    TransitionCommand,
    TransitionCommandKind,
    TransitionContext,
    TransitionResult,
} from '@/types/b2b/state-machine';
import type { ShipmentStatus } from '@/types/b2b/shipment';
import { TERMINAL_STATUSES } from '@/types/b2b/shipment';
import type { NormalizedEvent } from '@/types/b2b/tracking';
import {
    ALL_CANCELLATION_REASONS,
    ALL_HOLD_REASONS,
    ALL_RTO_REASONS,
    ALL_UNDELIVERED_REASONS,
    safeReason,
} from '@/types/b2b/reasons';
import { canTransition } from './canTransition';
import { STATUS_TO_COMMAND } from './eventMapper';
import { rankOf, STATUS_RANK } from './statusRank';

// Pure domain layer. No Firestore, no HTTP, no I/O.
//
// Two entry points:
//   apply(snapshot, command, ctx)        — strict, command-driven
//   applyEvent(snapshot, event, ctx)     — lenient, event-driven (used by
//                                          EventIngestor; distinguishes
//                                          dupes/stale from real errors)
//
// Both go through the same legality check (canTransition + special-case
// handlers). Effects and statusReason are derived consistently.

function deriveStatusReason(command: TransitionCommand): string | null {
    switch (command.kind) {
        case 'cancel':
        case 'mark_undelivered':
        case 'initiate_rto':
        case 'put_on_hold':
            return command.reason;
        case 'correct_status':
            return `manual_correction:${command.note}`;
        case 'book':
        case 'mark_ready_for_pickup':
        case 'mark_picked_up':
        case 'mark_in_transit':
        case 'mark_out_for_delivery':
        case 'mark_delivered':
        case 'mark_rto_in_transit':
        case 'mark_rto_delivered':
        case 'mark_lost':
        case 'mark_damaged':
        case 'release_hold':
            return null;
    }
}

function synthesizeCommand(
    kind: TransitionCommandKind,
    event: NormalizedEvent,
): TransitionCommand {
    switch (kind) {
        case 'book': return { kind: 'book' };
        case 'cancel':
            return {
                kind: 'cancel',
                reason: safeReason(event.impliedReason, ALL_CANCELLATION_REASONS, 'partner_requested'),
            };
        case 'mark_ready_for_pickup': return { kind: 'mark_ready_for_pickup' };
        case 'mark_picked_up': return { kind: 'mark_picked_up' };
        case 'mark_in_transit':
            return {
                kind: 'mark_in_transit',
                location: event.location.raw
                    ? {
                        raw: event.location.raw,
                        city: event.location.city ?? undefined,
                        pincode: event.location.pincode ?? undefined,
                    }
                    : undefined,
            };
        case 'mark_out_for_delivery': return { kind: 'mark_out_for_delivery' };
        case 'mark_delivered': return { kind: 'mark_delivered' };
        case 'mark_undelivered':
            return {
                kind: 'mark_undelivered',
                reason: safeReason(event.impliedReason, ALL_UNDELIVERED_REASONS, 'other'),
            };
        case 'initiate_rto':
            return {
                kind: 'initiate_rto',
                reason: safeReason(event.impliedReason, ALL_RTO_REASONS, 'partner_requested'),
            };
        case 'mark_rto_in_transit': return { kind: 'mark_rto_in_transit' };
        case 'mark_rto_delivered': return { kind: 'mark_rto_delivered' };
        case 'mark_lost': return { kind: 'mark_lost' };
        case 'mark_damaged': return { kind: 'mark_damaged' };
        case 'put_on_hold':
            return {
                kind: 'put_on_hold',
                reason: safeReason(event.impliedReason, ALL_HOLD_REASONS, 'manual_review'),
            };
        case 'release_hold': return { kind: 'release_hold' };
        case 'correct_status':
            // correct_status carries a target status and free-text note that an
            // automated event cannot supply. It is admin-only and never synthesized.
            throw new Error('synthesizeCommand: correct_status is not derivable from events');
    }
}

export const ShipmentStateMachine = {
    apply(
        snapshot: ShipmentSnapshot,
        command: TransitionCommand,
        ctx: TransitionContext,
    ): TransitionResult {
        const { status: from, previousStatus, fulfillmentMode, trackingMode } = snapshot;

        // ─── Special: release_hold (target = previousStatus) ─────────────
        if (command.kind === 'release_hold') {
            if (ctx.initiator.type !== 'admin_user') {
                return { ok: false, error: { code: 'forbidden_for_initiator', initiator: ctx.initiator.type } };
            }
            if (from !== 'on_hold') {
                return { ok: false, error: { code: 'forbidden_transition', from, command: 'release_hold' } };
            }
            if (!previousStatus) {
                return { ok: false, error: { code: 'precondition_failed', reason: 'cannot release_hold: previousStatus is null' } };
            }
            if (TERMINAL_STATUSES.has(previousStatus)) {
                return {
                    ok: false,
                    error: { code: 'precondition_failed', reason: `cannot release_hold to terminal status '${previousStatus}'` },
                };
            }
            return {
                ok: true,
                from,
                to: previousStatus,
                effects: ['emit_partner_webhook'],
                statusReason: null,
            };
        }

        // ─── Special: correct_status (admin override, any → any) ─────────
        if (command.kind === 'correct_status') {
            if (ctx.initiator.type !== 'admin_user') {
                return { ok: false, error: { code: 'forbidden_for_initiator', initiator: ctx.initiator.type } };
            }
            if (command.to === from) {
                return { ok: false, error: { code: 'precondition_failed', reason: 'correct_status target equals current status' } };
            }
            return {
                ok: true,
                from,
                to: command.to,
                effects: ['emit_partner_webhook', 'notify_ops'],
                statusReason: `manual_correction:${command.note}`,
            };
        }

        // ─── Terminal states absorb everything else ──────────────────────
        if (TERMINAL_STATUSES.has(from)) {
            return { ok: false, error: { code: 'forbidden_from_terminal', current: from } };
        }

        // ─── Table-driven path ───────────────────────────────────────────
        const decision = canTransition({
            from,
            command: command.kind,
            initiator: ctx.initiator.type,
            fulfillmentMode,
            trackingMode,
        });

        if (!decision.ok) {
            return { ok: false, error: decision.error };
        }

        return {
            ok: true,
            from,
            to: decision.to,
            effects: decision.effects,
            statusReason: deriveStatusReason(command),
        };
    },

    applyEvent(
        snapshot: ShipmentSnapshot,
        event: NormalizedEvent,
        ctx: TransitionContext,
    ): ApplyEventOutcome {
        // Event implies no status change (e.g. shipment.arrived_at_hub).
        if (!event.impliedStatus) {
            return { kind: 'no_change', reason: 'no_status_implied' };
        }

        // Idempotency: event implies a status we're already in.
        // This is the common case for retried courier webhooks.
        if (event.impliedStatus === snapshot.status) {
            return { kind: 'no_change', reason: 'same_status' };
        }

        const commandKind = STATUS_TO_COMMAND[event.impliedStatus];
        if (!commandKind) {
            return {
                kind: 'rejected',
                error: { code: 'invalid_command', reason: `no command exists to reach status '${event.impliedStatus}'` },
            };
        }

        const command = synthesizeCommand(commandKind, event);
        const result = this.apply(snapshot, command, ctx);

        if (result.ok) {
            return {
                kind: 'applied',
                from: result.from,
                to: result.to,
                effects: result.effects,
                statusReason: result.statusReason,
            };
        }

        // Stale event detection: if the transition is forbidden AND the event's
        // implied status has lower rank than the current status, this is almost
        // certainly an out-of-order delivery of an old scan. Don't surface as an
        // error — the ingestor will log it and move on.
        const targetRank = rankOf(event.impliedStatus);
        const currentRank = STATUS_RANK[snapshot.status];
        if (targetRank < currentRank) {
            return { kind: 'no_change', reason: 'stale_by_rank' };
        }

        return { kind: 'rejected', error: result.error };
    },

    isTerminal(status: ShipmentStatus): boolean {
        return TERMINAL_STATUSES.has(status);
    },

    rankOf(status: ShipmentStatus): number {
        return STATUS_RANK[status];
    },
} as const;
