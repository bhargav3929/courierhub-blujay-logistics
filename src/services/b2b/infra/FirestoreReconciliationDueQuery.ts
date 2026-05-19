import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { DueReconciliation, ReconciliationDueQuery } from '@/types/b2b/ports';
import { isCourierCode } from '@/types/b2b/shipment';
import { COLLECTIONS } from './collections';

// Firestore-backed ReconciliationDueQuery.
//
// Required composite index:
//   shipments: (awaitingCarrierReconciliation ASC, reconcileNextAttemptAt ASC)

export class FirestoreReconciliationDueQuery implements ReconciliationDueQuery {
    constructor(private readonly db: Firestore) {}

    async findDue(input: { limit: number; now: Date }): Promise<readonly DueReconciliation[]> {
        const snap = await this.db
            .collection(COLLECTIONS.SHIPMENTS)
            .where('awaitingCarrierReconciliation', '==', true)
            .where('reconcileNextAttemptAt', '<=', Timestamp.fromDate(input.now))
            .orderBy('reconcileNextAttemptAt', 'asc')
            .limit(input.limit)
            .get();

        const out: DueReconciliation[] = [];
        for (const doc of snap.docs) {
            const data = doc.data() as {
                partnerId?: string;
                reconcileCourier?: string;
                reconcileReferenceNumber?: string;
                reconcileAttempts?: number;
            };
            if (!data.partnerId || !data.reconcileCourier || !data.reconcileReferenceNumber) continue;
            if (!isCourierCode(data.reconcileCourier)) continue;
            out.push({
                shipmentId: ShipmentId(doc.id),
                partnerId: PartnerId(data.partnerId),
                courier: data.reconcileCourier,
                referenceNumber: data.reconcileReferenceNumber,
                attempts: data.reconcileAttempts ?? 0,
            });
        }
        return out;
    }
}
