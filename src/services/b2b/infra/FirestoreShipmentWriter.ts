import { randomBytes } from 'node:crypto';
import {
    FieldValue,
    Timestamp,
    type Firestore,
} from 'firebase-admin/firestore';
import { ShipmentId } from '@/types/b2b/ids';
import type {
    AttachCarrierInput,
    AttachLabelInput,
    AttachPricingInput,
    ClearReconciliationInput,
    CreateDraftInput,
    CreateDraftResult,
    MarkAwaitingReconciliationInput,
    ShipmentWriter,
} from '@/types/b2b/ports';
import { COLLECTIONS } from './collections';

// Firestore-backed ShipmentWriter.
//
// createDraft is the atomic-or-find primitive. Uses a separate index doc
// at b2b_shipment_idempotency_index/{partnerId}__{key} that maps to the
// shipmentId. Both docs are written in one transaction; two parallel
// writers collide on the index — only one tx commits, the other re-reads
// and returns the existing shipmentId.
//
// The other methods are simple dot-notation updates: small, atomic,
// preserve sibling fields under `tracking.*`, `artifacts.*`, etc.

function generateShipmentId(): string {
    // ship_<16 hex chars> — opaque, no partner info embedded.
    return `ship_${randomBytes(8).toString('hex')}`;
}

function idempotencyIndexId(partnerId: string, key: string): string {
    return `${partnerId}__${key}`;
}

export class FirestoreShipmentWriter implements ShipmentWriter {
    constructor(private readonly db: Firestore) {}

    async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
        const indexRef = this.db
            .collection(COLLECTIONS.B2B_SHIPMENT_IDEMPOTENCY_INDEX)
            .doc(idempotencyIndexId(input.partnerId, input.idempotencyKey));

        return this.db.runTransaction(async (tx) => {
            const existing = await tx.get(indexRef);
            if (existing.exists) {
                const data = existing.data() as { shipmentId: string };
                return {
                    created: false,
                    existingShipmentId: ShipmentId(data.shipmentId),
                };
            }

            const shipmentId = generateShipmentId();
            const shipmentRef = this.db
                .collection(COLLECTIONS.SHIPMENTS)
                .doc(shipmentId);

            const now = Timestamp.now();
            tx.create(shipmentRef, {
                schemaVersion: 1,
                shipmentId,
                partnerId: input.partnerId,
                clientId: input.clientId ?? null,
                externalRef: input.externalRef ?? null,
                idempotencyKey: input.idempotencyKey,
                createdByApiKeyId: input.apiKeyId,

                shipmentSource: 'b2b_api' as const,
                fulfillmentMode: input.fulfillmentMode,
                trackingMode: input.trackingMode,

                status: 'draft' as const,
                previousStatus: null,
                statusReason: null,
                stateVersion: 0,

                origin: input.origin,
                destination: input.destination,
                parcel: input.parcel,

                courier: null,
                pricing: null,
                artifacts: { label: null },
                tracking: { lastEventAt: null },

                awaitingCarrierReconciliation: false,
                reconcileAttempts: 0,
                reconcileNextAttemptAt: null,
                reconcileLastError: null,

                metadata: input.metadata ?? {},

                createdAt: now,
                updatedAt: now,
            });

            tx.create(indexRef, {
                partnerId: input.partnerId,
                idempotencyKey: input.idempotencyKey,
                shipmentId,
                createdAt: now,
            });

            return { created: true, shipmentId: ShipmentId(shipmentId) };
        });
    }

    async attachCarrier(input: AttachCarrierInput): Promise<void> {
        await this.shipmentRef(input.shipmentId).update({
            'courier.code': input.courier,
            'courier.awb': input.awb,
            'courier.serviceCode': input.serviceCode,
            'courier.bookedAt': Timestamp.fromDate(input.bookedAt),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }

    async attachPricing(input: AttachPricingInput): Promise<void> {
        const p = input.pricing;
        await this.shipmentRef(input.shipmentId).update({
            pricing: {
                courier: p.courier,
                serviceCode: p.serviceCode,
                baseFreightPaise: p.baseFreightPaise,
                fuelSurchargePaise: p.fuelSurchargePaise,
                codHandlingPaise: p.codHandlingPaise,
                otherChargesPaise: p.otherChargesPaise,
                gstPaise: p.gstPaise,
                markupPaise: p.markupPaise,
                totalPaise: p.totalPaise,
                currency: p.currency,
                rateCardId: p.rateCardId,
                rateCardVersion: p.rateCardVersion,
                quotedAt: Timestamp.fromDate(p.quotedAt),
                quoteToken: p.quoteToken,
                appliedRules: p.appliedRules,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });
    }

    async attachLabel(input: AttachLabelInput): Promise<void> {
        const a = input.artifact;
        await this.shipmentRef(input.shipmentId).update({
            'artifacts.label': {
                status: a.status,
                format: a.format,
                labelRef: a.labelRef,
                retrievedAt: a.retrievedAt ? Timestamp.fromDate(a.retrievedAt) : null,
                lastError: a.lastError,
                attempts: a.attempts,
            },
            updatedAt: FieldValue.serverTimestamp(),
        });
    }

    async markAwaitingReconciliation(
        input: MarkAwaitingReconciliationInput,
    ): Promise<void> {
        await this.shipmentRef(input.shipmentId).update({
            awaitingCarrierReconciliation: true,
            reconcileAttempts: input.attempts,
            reconcileNextAttemptAt: Timestamp.fromDate(input.nextAttemptAt),
            reconcileLastError: input.lastError,
            reconcileCourier: input.courier,
            reconcileReferenceNumber: input.referenceNumber,
            updatedAt: FieldValue.serverTimestamp(),
        });
    }

    async clearReconciliation(input: ClearReconciliationInput): Promise<void> {
        await this.shipmentRef(input.shipmentId).update({
            awaitingCarrierReconciliation: false,
            reconcileNextAttemptAt: null,
            reconcileResolvedWithAwb: input.resolvedWithAwb,
            reconcileResolvedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }

    private shipmentRef(shipmentId: string) {
        return this.db.collection(COLLECTIONS.SHIPMENTS).doc(shipmentId);
    }
}
