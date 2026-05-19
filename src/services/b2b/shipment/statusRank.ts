import type { ShipmentStatus } from '@/types/b2b/shipment';

// STATUS_RANK orders statuses by "progress toward terminal."
// Used by:
//   - EventIngestor / ShipmentStateMachine.applyEvent: to decide whether a
//     forbidden-transition event is a stale regression (target rank < current
//     rank → silently ignore) or a real illegal attempt (return error).
//   - AuthorityGate (hybrid mode): to compare event's implied status against
//     the configured switchover rank.
//
// NOT used for deciding whether a transition is legal — that is the sole
// responsibility of the transition table. Rank is a tiebreaker for ordering
// concerns, never a gate.
//
// Note the deliberate ordering:
//   - undelivered (45) is below out_for_delivery (50) because OFD→undelivered
//     is a legit forward edge (delivery attempt failed); undelivered→OFD is
//     a re-attempt. Both are in the transition table.
//   - All terminal statuses share rank 100 — they're equally "done" and
//     none can transition to another (without correct_status).
export const STATUS_RANK: Readonly<Record<ShipmentStatus, number>> = {
    draft: 0,
    booked: 10,
    ready_for_pickup: 20,
    picked_up: 30,
    in_transit: 40,
    undelivered: 45,
    out_for_delivery: 50,
    on_hold: 60,
    rto_initiated: 70,
    rto_in_transit: 80,
    delivered: 100,
    rto_delivered: 100,
    cancelled: 100,
    lost: 100,
    damaged: 100,
};

export function rankOf(status: ShipmentStatus): number {
    return STATUS_RANK[status];
}
