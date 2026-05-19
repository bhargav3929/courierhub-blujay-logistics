import type { HybridConfig } from '@/types/b2b/hybrid';
import type { AuthorityBlockReason } from '@/types/b2b/ingest';
import type { ShipmentSnapshot } from '@/types/b2b/state-machine';
import type { EventSource, NormalizedEvent } from '@/types/b2b/tracking';
import { rankOf } from '../shipment/statusRank';
import { DEFAULT_HYBRID_CONFIG } from './hybridConfig';

const COURIER_SOURCES: ReadonlySet<EventSource> = new Set<EventSource>([
    'bluedart',
    'delhivery',
    'dtdc',
]);

export type AuthorityDecision =
    | { allowProjection: true }
    | { allowProjection: false; reason: AuthorityBlockReason };

// Pure decision function. Runs BEFORE the state machine so events that the
// state machine WOULD apply can still be blocked from advancing the
// projection (recorded in the event log for audit, but invisible to
// downstream effects). The function never raises; admin and system events
// always pass; events without an impliedStatus always pass (the downstream
// pipeline treats them as informational and records them anyway).

export const AuthorityGate = {
    evaluate(
        snapshot: ShipmentSnapshot,
        event: NormalizedEvent,
        hybridConfig: HybridConfig | null,
    ): AuthorityDecision {
        // Admin and system events override the gate — they are trusted
        // sources by construction.
        if (event.source === 'admin_ui' || event.source === 'system') {
            return { allowProjection: true };
        }

        // No implied status → projection wouldn't move anyway. Let it through
        // so the downstream layer can record it with reason='no_status_implied'.
        if (!event.impliedStatus) {
            return { allowProjection: true };
        }

        const isCourier = COURIER_SOURCES.has(event.source);
        const isPartner = event.source === 'partner_api';

        switch (snapshot.trackingMode) {
            case 'automatic':
                if (isPartner) {
                    return { allowProjection: false, reason: 'partner_event_in_automatic_mode' };
                }
                return { allowProjection: true };

            case 'manual':
                if (isCourier) {
                    return { allowProjection: false, reason: 'courier_event_in_manual_mode' };
                }
                return { allowProjection: true };

            case 'hybrid': {
                const cfg = hybridConfig ?? DEFAULT_HYBRID_CONFIG;
                const impliedRank = rankOf(event.impliedStatus);
                if (isCourier && impliedRank > cfg.courierAuthorityUntilRank) {
                    return { allowProjection: false, reason: 'beyond_courier_authority' };
                }
                if (isPartner && impliedRank < cfg.partnerAuthorityFromRank) {
                    return { allowProjection: false, reason: 'below_partner_authority' };
                }
                return { allowProjection: true };
            }
        }
    },
};
