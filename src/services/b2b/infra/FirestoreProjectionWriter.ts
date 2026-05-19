import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
    StaleVersionError,
    type ProjectionUpdate,
    type ProjectionWriter,
} from '@/types/b2b/ports';
import type { ShipmentStatus } from '@/types/b2b/shipment';
import { COLLECTIONS } from './collections';

// Atomic projection update.
//
// Inside the transaction we:
//   1. Re-read the shipment document
//   2. Verify partnerId match (defense in depth — ShipmentReader filtered,
//      but the read inside the tx is the only durable check)
//   3. Verify stateVersion === expectedVersion (optimistic lock)
//   4. Apply the update with stateVersion += 1
//
// Firestore retries ABORTED transactions automatically (concurrent write
// conflicts). Our StaleVersionError is a regular Error — it propagates out
// of the user function without triggering retry, which is what we want:
// the caller should see "another writer won, your version is stale".
//
// Tracking fields are partial-updated via dot-notation so sibling fields
// (e.g. tracking.expectedDeliveryAt, set elsewhere) are preserved.

export class FirestoreProjectionWriter implements ProjectionWriter {
    constructor(private readonly db: Firestore) {}

    async update(input: ProjectionUpdate): Promise<void> {
        const ref = this.db.collection(COLLECTIONS.SHIPMENTS).doc(input.shipmentId);

        await this.db.runTransaction(async (tx) => {
            const doc = await tx.get(ref);
            if (!doc.exists) {
                throw new Error(`FirestoreProjectionWriter: shipment ${input.shipmentId} not found`);
            }
            const data = doc.data() as { partnerId?: string; stateVersion?: number } | undefined;
            if (!data) {
                throw new Error(`FirestoreProjectionWriter: shipment ${input.shipmentId} has no data`);
            }
            if (data.partnerId !== input.partnerId) {
                throw new Error(
                    `FirestoreProjectionWriter: partnerId mismatch on ${input.shipmentId} ` +
                    `(expected=${input.partnerId}, found=${data.partnerId})`,
                );
            }

            const currentVersion = data.stateVersion ?? 0;
            if (currentVersion !== input.expectedVersion) {
                throw new StaleVersionError(currentVersion, input.expectedVersion);
            }

            const trackingPatch: Record<string, unknown> = {
                'tracking.lastEventAt': Timestamp.fromDate(input.lastEventAt),
                ...deriveStatusSpecificTrackingFields(input.nextStatus, input.lastEventAt),
            };

            tx.update(ref, {
                status: input.nextStatus,
                previousStatus: input.previousStatus,
                statusReason: input.statusReason,
                stateVersion: currentVersion + 1,
                updatedAt: FieldValue.serverTimestamp(),
                ...trackingPatch,
            });
        });
    }
}

// Status-specific projection fields. Adding a new status with a dedicated
// timestamp field is a one-line edit here.
function deriveStatusSpecificTrackingFields(
    next: ShipmentStatus,
    when: Date,
): Record<string, unknown> {
    const ts = Timestamp.fromDate(when);
    switch (next) {
        case 'picked_up':       return { 'tracking.pickedUpAt': ts };
        case 'delivered':       return { 'tracking.deliveredAt': ts };
        case 'rto_initiated':   return { 'tracking.rtoStartedAt': ts };
        case 'rto_delivered':   return { 'tracking.rtoDeliveredAt': ts };
        case 'cancelled':       return { 'tracking.cancelledAt': ts };
        case 'lost':            return { 'tracking.lostAt': ts };
        case 'damaged':         return { 'tracking.damagedAt': ts };
        default:                return {};
    }
}
