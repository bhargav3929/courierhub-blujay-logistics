import type { ShipmentStatus } from './shipment';

// Hybrid tracking: courier owns the projection up to `switchAfterStatus`,
// partner owns it from the next status onward. Stored per shipment so the
// rule is auditable per-shipment, not partner-wide.
//
// The two rank fields are denormalized from `switchAfterStatus` for fast
// gating in the EventIngestor. They are derived, not authored — callers
// should construct via `buildHybridConfig(switchAfterStatus)` in step 2.

export interface HybridConfig {
    readonly switchAfterStatus: ShipmentStatus;
    readonly courierAuthorityUntilRank: number;
    readonly partnerAuthorityFromRank: number;
}
