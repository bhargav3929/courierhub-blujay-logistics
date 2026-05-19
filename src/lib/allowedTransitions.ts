// Pure helper that wraps canTransition() to produce a list of next
// status / command pairs an operator may legally drive from a given
// current status + fulfillment mode + tracking mode.
//
// Used by UI buttons. No new domain logic — the underlying authority is
// the transition table from Phase 2 Step 1.

import { canTransition } from '@/services/b2b/shipment/canTransition';
import type {
    FulfillmentMode,
    ShipmentStatus,
    TrackingMode,
} from '@/types/b2b/shipment';
import type {
    StateInitiatorType,
    TransitionCommandKind,
} from '@/types/b2b/state-machine';

export interface AllowedTransition {
    readonly command: TransitionCommandKind;
    readonly to: ShipmentStatus;
    // Human-readable verb for the UI button. Kept here (not in the
    // domain) because it's UI presentation, not business vocabulary.
    readonly label: string;
    // Whether this is a "normal progression" (fast click) or a
    // "correction" (operator should be slowed down with confirm + note).
    readonly kind: 'progression' | 'correction' | 'terminal';
}

// Mapping from the transition command kind to a button-friendly label.
// `correct_status` and `release_hold` are admin-only and not shown in the
// self-shipment operator UI.
const LABEL: Partial<Record<TransitionCommandKind, string>> = {
    mark_ready_for_pickup: 'Ready for pickup',
    mark_picked_up: 'Picked up',
    mark_in_transit: 'In transit',
    mark_out_for_delivery: 'Out for delivery',
    mark_delivered: 'Delivered',
    mark_undelivered: 'Undelivered',
    initiate_rto: 'Initiate RTO',
    mark_rto_in_transit: 'RTO in transit',
    mark_rto_delivered: 'RTO delivered',
    mark_lost: 'Mark lost',
    mark_damaged: 'Mark damaged',
    cancel: 'Cancel shipment',
};

// Every command an operator might drive. Permission gates (initiator,
// mode) filter further. Ordered roughly by happy-path likelihood so the
// UI renders the most likely action first.
const COMMANDS: TransitionCommandKind[] = [
    'mark_ready_for_pickup',
    'mark_picked_up',
    'mark_in_transit',
    'mark_out_for_delivery',
    'mark_delivered',
    'mark_undelivered',
    'initiate_rto',
    'mark_rto_in_transit',
    'mark_rto_delivered',
    'mark_lost',
    'mark_damaged',
    'cancel',
];

const TERMINAL_COMMANDS: ReadonlySet<TransitionCommandKind> = new Set([
    'mark_delivered',
    'mark_rto_delivered',
    'mark_lost',
    'mark_damaged',
    'cancel',
]);

const CORRECTION_COMMANDS: ReadonlySet<TransitionCommandKind> = new Set([
    'mark_lost',
    'mark_damaged',
    'mark_undelivered',
]);

export interface ListInput {
    readonly from: ShipmentStatus;
    readonly fulfillmentMode: FulfillmentMode;
    readonly trackingMode: TrackingMode;
    // For self-shipment operator UI, the initiator is partner_api or
    // admin_user (the admin UI uses admin_user; a partner-facing version
    // would use partner_api). Both are honored by the transition table
    // where mode gates permit.
    readonly initiator: StateInitiatorType;
}

export function listAllowedTransitions(input: ListInput): readonly AllowedTransition[] {
    const out: AllowedTransition[] = [];
    for (const command of COMMANDS) {
        const decision = canTransition({
            from: input.from,
            command,
            initiator: input.initiator,
            fulfillmentMode: input.fulfillmentMode,
            trackingMode: input.trackingMode,
        });
        if (!decision.ok) continue;
        const label = LABEL[command];
        if (!label) continue;
        out.push({
            command,
            to: decision.to,
            label,
            kind: TERMINAL_COMMANDS.has(command)
                ? 'terminal'
                : CORRECTION_COMMANDS.has(command)
                    ? 'correction'
                    : 'progression',
        });
    }
    return out;
}
