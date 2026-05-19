import type { ShipmentStatus } from '@/types/b2b/shipment';

// Adaptive polling cadence per status. Codified from Phase 1 Part B §5.
//
// The cron-driven worker queries shipments whose `tracking.lastEventAt`
// is older than (now - pollEveryMinutes), bucketed by current status.
// `null` plan = do not poll (terminal states, on_hold).
//
// `staleAfterDays` is the cutoff after which the worker logs an alert
// (a shipment that hasn't moved for this long is probably forgotten and
// needs ops attention) and stops polling.

export interface PollingPlan {
    readonly pollEveryMinutes: number;
    readonly staleAfterDays: number;
}

export const POLLING_PLANS: Readonly<Record<ShipmentStatus, PollingPlan | null>> = {
    draft:            null,
    booked:           { pollEveryMinutes: 240, staleAfterDays: 7 },
    ready_for_pickup: { pollEveryMinutes: 240, staleAfterDays: 7 },
    picked_up:        { pollEveryMinutes: 360, staleAfterDays: 14 },
    in_transit:       { pollEveryMinutes: 360, staleAfterDays: 14 },
    out_for_delivery: { pollEveryMinutes: 30,  staleAfterDays: 3 },
    undelivered:      { pollEveryMinutes: 120, staleAfterDays: 7 },
    rto_initiated:    { pollEveryMinutes: 360, staleAfterDays: 14 },
    rto_in_transit:   { pollEveryMinutes: 360, staleAfterDays: 14 },
    // Terminal — never poll. Background reconciliation handles anomalies.
    delivered:        null,
    rto_delivered:    null,
    cancelled:        null,
    lost:             null,
    damaged:          null,
    // Held — ops will release; polling against the carrier is wasted.
    on_hold:          null,
};

export function shouldPoll(status: ShipmentStatus): boolean {
    return POLLING_PLANS[status] !== null;
}

export function planFor(status: ShipmentStatus): PollingPlan | null {
    return POLLING_PLANS[status];
}
