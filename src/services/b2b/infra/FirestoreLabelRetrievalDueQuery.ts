import type { Firestore } from 'firebase-admin/firestore';
import { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { DueLabelRetrieval, LabelRetrievalDueQuery } from '@/types/b2b/ports';
import { isCourierCode } from '@/types/b2b/shipment';
import { COLLECTIONS } from './collections';

// Firestore-backed LabelRetrievalDueQuery.
//
// Only courier-fulfilled shipments are returned. Self-shipment labels
// generate locally in the booking saga; failed self-shipment labels are
// regenerated on-demand via LabelService.getLabel, not by this job.
//
// Required composite index:
//   shipments: (fulfillmentMode ASC, artifacts.label.status ASC, artifacts.label.attempts ASC)

export class FirestoreLabelRetrievalDueQuery implements LabelRetrievalDueQuery {
    constructor(private readonly db: Firestore) {}

    async findDue(input: { limit: number; maxAttempts: number }): Promise<readonly DueLabelRetrieval[]> {
        const snap = await this.db
            .collection(COLLECTIONS.SHIPMENTS)
            .where('fulfillmentMode', '==', 'courier')
            .where('artifacts.label.status', '==', 'pending')
            .where('artifacts.label.attempts', '<', input.maxAttempts)
            .limit(input.limit)
            .get();

        const out: DueLabelRetrieval[] = [];
        for (const doc of snap.docs) {
            const data = doc.data() as {
                partnerId?: string;
                courier?: { code?: string; awb?: string };
                artifacts?: { label?: { attempts?: number; lastError?: string | null } };
            };
            const code = data.courier?.code;
            const awb = data.courier?.awb;
            if (!data.partnerId || !code || !awb || !isCourierCode(code)) continue;
            out.push({
                shipmentId: ShipmentId(doc.id),
                partnerId: PartnerId(data.partnerId),
                courier: code,
                awb,
                attempts: data.artifacts?.label?.attempts ?? 0,
                lastError: data.artifacts?.label?.lastError ?? null,
            });
        }
        return out;
    }
}
