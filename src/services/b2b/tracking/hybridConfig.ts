import type { HybridConfig } from '@/types/b2b/hybrid';
import { ALL_SHIPMENT_STATUSES, type ShipmentStatus } from '@/types/b2b/shipment';
import { STATUS_RANK, rankOf } from '../shipment/statusRank';

// Build a HybridConfig from the chosen switchover status.
//
// partnerAuthorityFromRank is the SMALLEST rank strictly greater than
// switchRank — i.e., the next milestone the partner takes ownership of.
// We compute it rather than hardcoding switchRank+1 because rank values
// are not necessarily contiguous (undelivered=45, OFD=50, on_hold=60).

export function buildHybridConfig(switchAfterStatus: ShipmentStatus): HybridConfig {
    const switchRank = rankOf(switchAfterStatus);
    let partnerFromRank = Number.POSITIVE_INFINITY;
    for (const s of ALL_SHIPMENT_STATUSES) {
        const r = STATUS_RANK[s];
        if (r > switchRank && r < partnerFromRank) {
            partnerFromRank = r;
        }
    }
    if (!Number.isFinite(partnerFromRank)) {
        // Switch status is already at the top — no partner authority window.
        // Pin to switchRank + 1 so the gate functions remain well-defined.
        partnerFromRank = switchRank + 1;
    }
    return {
        switchAfterStatus,
        courierAuthorityUntilRank: switchRank,
        partnerAuthorityFromRank: partnerFromRank,
    };
}

// Default switchover at in_transit: courier owns booking → middle-mile,
// partner owns OFD → delivered. Sensible default for most hybrid partners.
export const DEFAULT_HYBRID_CONFIG: HybridConfig = buildHybridConfig('in_transit');
