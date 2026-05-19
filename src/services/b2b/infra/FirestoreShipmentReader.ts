import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import type { HybridConfig } from '@/types/b2b/hybrid';
import { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { ShipmentContext, ShipmentLookup, ShipmentReader } from '@/types/b2b/ports';
import {
    isFulfillmentMode,
    isShipmentStatus,
    isTrackingMode,
    type CourierCode,
    type FulfillmentMode,
    type ShipmentStatus,
    type TrackingMode,
} from '@/types/b2b/shipment';
import type { ShipmentSnapshot } from '@/types/b2b/state-machine';
import { COLLECTIONS } from './collections';

// Subset of fields this adapter reads from a shipment doc. The full doc
// has many more fields (origin, destination, parcel, pricing, courier...).
// Keeping the slice tight makes the adapter's contract explicit.
interface StoredShipmentSlice {
    partnerId?: string;
    status?: string;
    previousStatus?: string | null;
    fulfillmentMode?: string;
    trackingMode?: string;
    stateVersion?: number;
    hybridConfig?: {
        switchAfterStatus?: string;
        courierAuthorityUntilRank?: number;
        partnerAuthorityFromRank?: number;
    };
    tracking?: { lastEventAt?: Timestamp };
}

export class FirestoreShipmentReader implements ShipmentReader, ShipmentLookup {
    constructor(private readonly db: Firestore) {}

    // ─── ShipmentLookup ──────────────────────────────────────────────
    //
    // Used by carrier webhook handlers to map (courier, awb) → our
    // shipmentId + partnerId. Requires the composite index
    // `(courier.code ASC, courier.awb ASC)` — documented in collections.ts.
    //
    // If the index returns more than one match (data corruption), we
    // throw rather than silently picking one — explicit failure beats a
    // wrong tenant routing decision.
    async findByAwb(
        courier: CourierCode,
        awb: string,
    ): Promise<{ shipmentId: ShipmentId; partnerId: PartnerId } | null> {
        if (!awb) return null;
        const snap = await this.db
            .collection(COLLECTIONS.SHIPMENTS)
            .where('courier.code', '==', courier)
            .where('courier.awb', '==', awb)
            .limit(2)
            .get();
        if (snap.empty) return null;
        if (snap.size > 1) {
            throw new Error(
                `FirestoreShipmentReader.findByAwb: multiple shipments matched ` +
                `(courier=${courier}, awb=${awb}) — investigate index uniqueness`,
            );
        }
        const doc = snap.docs[0];
        const data = doc.data() as { partnerId?: string };
        if (!data.partnerId) {
            throw new Error(
                `FirestoreShipmentReader.findByAwb: shipment ${doc.id} has no partnerId`,
            );
        }
        return {
            shipmentId: ShipmentId(doc.id),
            partnerId: PartnerId(data.partnerId),
        };
    }

    // ─── ShipmentReader ──────────────────────────────────────────────

    async load(partnerId: PartnerId, shipmentId: ShipmentId): Promise<ShipmentContext | null> {
        const doc = await this.db
            .collection(COLLECTIONS.SHIPMENTS)
            .doc(shipmentId)
            .get();

        if (!doc.exists) return null;

        const data = doc.data() as StoredShipmentSlice | undefined;
        if (!data) return null;

        // Cross-tenant guard. Return null (not throw) so the existence of
        // another partner's shipment is not observable via timing or error.
        if (data.partnerId !== partnerId) return null;

        // Defensive enum checks. A corrupt doc here is a programmer bug, not
        // a partner action — surface loudly so it's caught in dev, not prod.
        const status = data.status;
        const fulfillmentMode = data.fulfillmentMode;
        const trackingMode = data.trackingMode;
        if (!status || !isShipmentStatus(status)) {
            throw new Error(`FirestoreShipmentReader: invalid status '${status}' on ${shipmentId}`);
        }
        if (!fulfillmentMode || !isFulfillmentMode(fulfillmentMode)) {
            throw new Error(`FirestoreShipmentReader: invalid fulfillmentMode '${fulfillmentMode}' on ${shipmentId}`);
        }
        if (!trackingMode || !isTrackingMode(trackingMode)) {
            throw new Error(`FirestoreShipmentReader: invalid trackingMode '${trackingMode}' on ${shipmentId}`);
        }

        const snapshot: ShipmentSnapshot = {
            status: status as ShipmentStatus,
            previousStatus:
                data.previousStatus && isShipmentStatus(data.previousStatus)
                    ? data.previousStatus
                    : null,
            fulfillmentMode: fulfillmentMode as FulfillmentMode,
            trackingMode: trackingMode as TrackingMode,
        };

        const hybridConfig: HybridConfig | null = parseHybridConfig(data.hybridConfig);

        return {
            snapshot,
            hybridConfig,
            lastEventAt: data.tracking?.lastEventAt?.toDate() ?? null,
            stateVersion: data.stateVersion ?? 0,
        };
    }
}

function parseHybridConfig(raw: StoredShipmentSlice['hybridConfig']): HybridConfig | null {
    if (!raw) return null;
    const { switchAfterStatus, courierAuthorityUntilRank, partnerAuthorityFromRank } = raw;
    if (
        !switchAfterStatus
        || !isShipmentStatus(switchAfterStatus)
        || typeof courierAuthorityUntilRank !== 'number'
        || typeof partnerAuthorityFromRank !== 'number'
    ) {
        return null;
    }
    return { switchAfterStatus, courierAuthorityUntilRank, partnerAuthorityFromRank };
}
