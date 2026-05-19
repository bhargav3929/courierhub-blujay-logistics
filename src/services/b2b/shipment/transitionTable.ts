import type {
    InitiatorMatcher,
    TransitionCommandKind,
    TransitionEffect,
} from '@/types/b2b/state-machine';
import type { ShipmentStatus } from '@/types/b2b/shipment';

// The transition table is the authoritative legal-edge declaration.
//
// One rule per (from, to, command). Each rule lists `allow` — the set of
// InitiatorMatcher entries that permit this edge. Multiple matchers for the
// same initiator with different mode constraints = OR semantics.
//
// Special commands NOT in this table:
//   - release_hold:   target = shipment.previousStatus, handled in apply()
//   - correct_status: admin override targeting any status, handled in apply()
//
// To add a new edge: append one rule. To restrict an existing edge by mode:
// split its matcher into multiple entries with constraints. Never delete a
// rule without auditing all callers — partners and reports may depend on it.

export interface TransitionRule {
    readonly from: ShipmentStatus;
    readonly to: ShipmentStatus;
    readonly command: TransitionCommandKind;
    readonly allow: readonly InitiatorMatcher[];
    readonly effects: readonly TransitionEffect[];
}

// ─── effect bundles (named to keep rules readable) ───────────────────────

const W: readonly TransitionEffect[] = ['emit_partner_webhook'];
const W_ARCHIVE: readonly TransitionEffect[] = ['emit_partner_webhook', 'archive_label'];
const W_BILLING_DELIVERED: readonly TransitionEffect[] = ['emit_partner_webhook', 'settle_cod', 'finalize_billing'];
const W_BILLING_TERMINATE: readonly TransitionEffect[] = ['emit_partner_webhook', 'finalize_billing'];
const W_OPS_BILLING: readonly TransitionEffect[] = ['emit_partner_webhook', 'notify_ops', 'finalize_billing'];
const W_RTO: readonly TransitionEffect[] = ['emit_partner_webhook', 'schedule_rto_pickup'];
const HOLD: readonly TransitionEffect[] = ['notify_ops'];

// ─── matcher bundles (named for readability) ─────────────────────────────

// Partner can drive this edge when in self_shipment fulfillment mode.
const PARTNER_SELF: InitiatorMatcher = {
    initiator: 'partner_api',
    fulfillmentMode: ['self_shipment'],
};

// Partner can drive this edge when in self_shipment OR when tracking is hybrid.
// (Two matchers = OR. Cheaper to read than a synthetic "or" predicate.)
const PARTNER_SELF_OR_HYBRID: readonly InitiatorMatcher[] = [
    { initiator: 'partner_api', fulfillmentMode: ['self_shipment'] },
    { initiator: 'partner_api', trackingMode: ['hybrid'] },
];

// ─── the table ───────────────────────────────────────────────────────────

export const TRANSITION_TABLE: readonly TransitionRule[] = [
    // draft → booked / cancelled
    {
        from: 'draft', to: 'booked', command: 'book',
        allow: [
            { initiator: 'partner_api' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W,
    },
    {
        from: 'draft', to: 'cancelled', command: 'cancel',
        allow: [
            { initiator: 'partner_api' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W,
    },

    // booked → ready_for_pickup / picked_up / cancelled / on_hold
    {
        from: 'booked', to: 'ready_for_pickup', command: 'mark_ready_for_pickup',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            PARTNER_SELF,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        // Some carriers emit picked_up directly, skipping the ready_for_pickup scan.
        from: 'booked', to: 'picked_up', command: 'mark_picked_up',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            PARTNER_SELF,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        from: 'booked', to: 'cancelled', command: 'cancel',
        allow: [
            { initiator: 'partner_api' },
            { initiator: 'admin_user' },
        ],
        effects: W_ARCHIVE,
    },
    {
        from: 'booked', to: 'on_hold', command: 'put_on_hold',
        allow: [
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: HOLD,
    },

    // ready_for_pickup → picked_up / cancelled / on_hold
    {
        from: 'ready_for_pickup', to: 'picked_up', command: 'mark_picked_up',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            PARTNER_SELF,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        from: 'ready_for_pickup', to: 'cancelled', command: 'cancel',
        allow: [
            { initiator: 'partner_api' },
            { initiator: 'admin_user' },
        ],
        effects: W_ARCHIVE,
    },
    {
        from: 'ready_for_pickup', to: 'on_hold', command: 'put_on_hold',
        allow: [
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: HOLD,
    },

    // picked_up → in_transit / on_hold / lost / damaged
    {
        from: 'picked_up', to: 'in_transit', command: 'mark_in_transit',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            ...PARTNER_SELF_OR_HYBRID,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        from: 'picked_up', to: 'on_hold', command: 'put_on_hold',
        allow: [
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: HOLD,
    },
    {
        from: 'picked_up', to: 'lost', command: 'mark_lost',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },
    {
        from: 'picked_up', to: 'damaged', command: 'mark_damaged',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },

    // in_transit → out_for_delivery / undelivered / on_hold / lost / damaged
    {
        from: 'in_transit', to: 'out_for_delivery', command: 'mark_out_for_delivery',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            ...PARTNER_SELF_OR_HYBRID,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        // Rare but happens (delivery declined before OFD; address invalid at hub).
        from: 'in_transit', to: 'undelivered', command: 'mark_undelivered',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            ...PARTNER_SELF_OR_HYBRID,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        from: 'in_transit', to: 'on_hold', command: 'put_on_hold',
        allow: [
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: HOLD,
    },
    {
        from: 'in_transit', to: 'lost', command: 'mark_lost',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },
    {
        from: 'in_transit', to: 'damaged', command: 'mark_damaged',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },

    // out_for_delivery → delivered / undelivered / lost / damaged
    {
        from: 'out_for_delivery', to: 'delivered', command: 'mark_delivered',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            ...PARTNER_SELF_OR_HYBRID,
            { initiator: 'admin_user' },
        ],
        effects: W_BILLING_DELIVERED,
    },
    {
        from: 'out_for_delivery', to: 'undelivered', command: 'mark_undelivered',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            ...PARTNER_SELF_OR_HYBRID,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        from: 'out_for_delivery', to: 'lost', command: 'mark_lost',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },
    {
        from: 'out_for_delivery', to: 'damaged', command: 'mark_damaged',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },

    // undelivered → out_for_delivery (re-attempt) / rto_initiated / on_hold
    {
        from: 'undelivered', to: 'out_for_delivery', command: 'mark_out_for_delivery',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            ...PARTNER_SELF_OR_HYBRID,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },
    {
        from: 'undelivered', to: 'rto_initiated', command: 'initiate_rto',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'partner_api' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_RTO,
    },
    {
        from: 'undelivered', to: 'on_hold', command: 'put_on_hold',
        allow: [
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: HOLD,
    },

    // rto_initiated → rto_in_transit
    {
        from: 'rto_initiated', to: 'rto_in_transit', command: 'mark_rto_in_transit',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            PARTNER_SELF,
            { initiator: 'admin_user' },
        ],
        effects: W,
    },

    // rto_in_transit → rto_delivered / lost / damaged
    {
        from: 'rto_in_transit', to: 'rto_delivered', command: 'mark_rto_delivered',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'courier_poll' },
            PARTNER_SELF,
            { initiator: 'admin_user' },
        ],
        effects: W_BILLING_TERMINATE,
    },
    {
        from: 'rto_in_transit', to: 'lost', command: 'mark_lost',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },
    {
        from: 'rto_in_transit', to: 'damaged', command: 'mark_damaged',
        allow: [
            { initiator: 'courier_webhook' },
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_OPS_BILLING,
    },

    // on_hold → cancelled / rto_initiated (release_hold is special-cased)
    {
        from: 'on_hold', to: 'cancelled', command: 'cancel',
        allow: [
            { initiator: 'partner_api' },
            { initiator: 'admin_user' },
        ],
        effects: W_ARCHIVE,
    },
    {
        from: 'on_hold', to: 'rto_initiated', command: 'initiate_rto',
        allow: [
            { initiator: 'admin_user' },
            { initiator: 'system' },
        ],
        effects: W_RTO,
    },
];
