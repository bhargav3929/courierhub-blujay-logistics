import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { PartnerId, ShipmentId } from '@/types/b2b/ids';
import { isCourierCode, ALL_SHIPMENT_STATUSES, type ShipmentStatus } from '@/types/b2b/shipment';
import type { DueShipment, PollingDueQuery } from '../tracking/PollingWorker';
import { POLLING_PLANS } from '../tracking/PollingPlan';
import { COLLECTIONS } from './collections';

// Firestore-backed PollingDueQuery.
//
// Strategy: fan out one query per pollable status (each has its own
// cadence threshold) in parallel, merge results, cap at `limit`.
//
// Required composite indexes:
//   shipments: (status ASC, fulfillmentMode ASC, tracking.lastEventAt ASC)

export class FirestorePollingDueQuery implements PollingDueQuery {
    constructor(private readonly db: Firestore) {}

    async findDue(input: { limit: number; now: Date }): Promise<readonly DueShipment[]> {
        const queries: Promise<DueShipment[]>[] = [];
        for (const status of ALL_SHIPMENT_STATUSES) {
            const plan = POLLING_PLANS[status];
            if (!plan) continue;
            const cutoff = new Date(input.now.getTime() - plan.pollEveryMinutes * 60_000);
            queries.push(this.queryStatusBatch(status, cutoff, input.limit));
        }
        const results = await Promise.all(queries);
        const all = results.flat();
        // Oldest events first — ensures stale shipments get priority.
        all.sort((a, b) => {
            const aMs = a.lastEventAt?.getTime() ?? 0;
            const bMs = b.lastEventAt?.getTime() ?? 0;
            return aMs - bMs;
        });
        return all.slice(0, input.limit);
    }

    private async queryStatusBatch(
        status: ShipmentStatus,
        cutoff: Date,
        limit: number,
    ): Promise<DueShipment[]> {
        const snap = await this.db
            .collection(COLLECTIONS.SHIPMENTS)
            .where('status', '==', status)
            .where('fulfillmentMode', '==', 'courier')
            .where('tracking.lastEventAt', '<=', Timestamp.fromDate(cutoff))
            .orderBy('tracking.lastEventAt', 'asc')
            .limit(limit)
            .get();

        const out: DueShipment[] = [];
        for (const doc of snap.docs) {
            const data = doc.data() as {
                partnerId?: string;
                courier?: { code?: string; awb?: string };
                tracking?: { lastEventAt?: Timestamp };
            };
            const code = data.courier?.code;
            const awb = data.courier?.awb;
            if (!code || !awb || !isCourierCode(code)) continue;
            if (!data.partnerId) continue;
            out.push({
                shipmentId: ShipmentId(doc.id),
                partnerId: PartnerId(data.partnerId),
                courier: code,
                awb,
                status,
                lastEventAt: data.tracking?.lastEventAt?.toDate() ?? null,
            });
        }
        return out;
    }
}
