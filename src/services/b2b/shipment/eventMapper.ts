import type { ShipmentStatus } from '@/types/b2b/shipment';
import type { TransitionCommandKind } from '@/types/b2b/state-machine';
import type { TrackingEventType } from '@/types/b2b/tracking';

// Canonical mapping: TrackingEventType → ShipmentStatus.
// `null` means "this event type does not imply a status change" (e.g.
// label_generated, arrived_at_hub — informational, no projection update).
//
// Per-carrier adapters (Phase 2 step 2) translate carrier-specific codes
// to TrackingEventType. This file is courier-agnostic.
export const EVENT_TYPE_TO_STATUS: Readonly<Record<TrackingEventType, ShipmentStatus | null>> = {
    'shipment.created': 'draft',
    'shipment.booked': 'booked',
    'shipment.label_generated': null,
    'shipment.manifested': null,
    'shipment.picked_up': 'picked_up',
    'shipment.in_transit': 'in_transit',
    'shipment.arrived_at_hub': null,
    'shipment.departed_hub': null,
    'shipment.out_for_delivery': 'out_for_delivery',
    'shipment.delivery_attempted': null,
    'shipment.delivered': 'delivered',
    'shipment.undelivered': 'undelivered',
    'shipment.rto_initiated': 'rto_initiated',
    'shipment.rto_in_transit': 'rto_in_transit',
    'shipment.rto_delivered': 'rto_delivered',
    'shipment.cancelled': 'cancelled',
    'shipment.lost': 'lost',
    'shipment.damaged': 'damaged',
    'shipment.on_hold': 'on_hold',
    'shipment.exception': null,
};

export function mapEventToStatus(type: TrackingEventType): ShipmentStatus | null {
    return EVENT_TYPE_TO_STATUS[type];
}

// Canonical mapping: ShipmentStatus → TrackingEventType.
// Used by EventNormalizer when partners or admins push a status update; we
// pick the canonical event type for that status so the event log uses one
// vocabulary across all sources.
export const STATUS_TO_EVENT_TYPE: Readonly<Record<ShipmentStatus, TrackingEventType>> = {
    draft: 'shipment.created',
    booked: 'shipment.booked',
    ready_for_pickup: 'shipment.manifested',
    picked_up: 'shipment.picked_up',
    in_transit: 'shipment.in_transit',
    out_for_delivery: 'shipment.out_for_delivery',
    delivered: 'shipment.delivered',
    undelivered: 'shipment.undelivered',
    rto_initiated: 'shipment.rto_initiated',
    rto_in_transit: 'shipment.rto_in_transit',
    rto_delivered: 'shipment.rto_delivered',
    cancelled: 'shipment.cancelled',
    lost: 'shipment.lost',
    damaged: 'shipment.damaged',
    on_hold: 'shipment.on_hold',
};

export function statusToEventType(status: ShipmentStatus): TrackingEventType {
    return STATUS_TO_EVENT_TYPE[status];
}

// Canonical mapping: ShipmentStatus → TransitionCommandKind.
// Used by ShipmentStateMachine.applyEvent to synthesize a command from an
// event's impliedStatus. `null` means "this status is not reachable via a
// command" (e.g. draft is the initial state, not a target).
export const STATUS_TO_COMMAND: Readonly<Record<ShipmentStatus, TransitionCommandKind | null>> = {
    draft: null,
    booked: 'book',
    ready_for_pickup: 'mark_ready_for_pickup',
    picked_up: 'mark_picked_up',
    in_transit: 'mark_in_transit',
    out_for_delivery: 'mark_out_for_delivery',
    delivered: 'mark_delivered',
    undelivered: 'mark_undelivered',
    rto_initiated: 'initiate_rto',
    rto_in_transit: 'mark_rto_in_transit',
    rto_delivered: 'mark_rto_delivered',
    cancelled: 'cancel',
    lost: 'mark_lost',
    damaged: 'mark_damaged',
    on_hold: 'put_on_hold',
};
