// Server-side order operations using firebase-admin Firestore.
// Used by /api/orders/* and /api/razorpay/* routes — bypasses client-SDK rules.
//
// Reads from the client portal continue to go through firebase/firestore
// directly (orderService.ts), governed by Firestore rules.
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import type {
    CreateOrderInput,
    Order,
    OrderAutomationStage,
    OrderShipmentRef,
} from '@/types/order';

const COLLECTION = 'orders';
const db = () => getFirestore(adminApp);

export async function createOrder(
    clientId: string,
    input: CreateOrderInput
): Promise<{ id: string; order: Order }> {
    // Idempotency: same (clientId, externalOrderId) returns the existing order.
    if (input.externalOrderId) {
        const existing = await db()
            .collection(COLLECTION)
            .where('clientId', '==', clientId)
            .where('externalOrderId', '==', input.externalOrderId)
            .limit(1)
            .get();
        if (!existing.empty) {
            const d = existing.docs[0];
            return { id: d.id, order: { id: d.id, ...(d.data() as any) } as Order };
        }
    }

    const now = Timestamp.now();
    const initialStage: OrderAutomationStage =
        input.payment.provider === 'cod' ? 'shipment_pending' : 'awaiting_payment';

    const data = {
        clientId,
        externalOrderId: input.externalOrderId ?? null,
        customer: input.customer,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress ?? input.shippingAddress,
        items: input.items,
        amounts: {
            subtotal: input.amounts.subtotal,
            shipping: input.amounts.shipping ?? 0,
            tax: input.amounts.tax ?? 0,
            discount: input.amounts.discount ?? 0,
            total: input.amounts.total,
            codCollect: input.amounts.codCollect ?? 0,
        },
        payment: {
            provider: input.payment.provider,
            status: 'pending' as const,
            amount: input.amounts.total,
            currency: input.payment.currency || 'INR',
            attempts: 0,
        },
        automation: {
            stage: initialStage,
            attempts: 0,
            history: [
                { stage: 'order_created' as OrderAutomationStage, at: now },
                { stage: initialStage, at: now },
            ],
        },
        metadata: input.metadata ?? {},
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
    };

    const ref = await db().collection(COLLECTION).add(data);
    return { id: ref.id, order: { id: ref.id, ...data } as unknown as Order };
}

export async function getOrderById(orderId: string): Promise<Order | null> {
    const snap = await db().collection(COLLECTION).doc(orderId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as any) } as Order;
}

export async function attachRazorpayOrder(
    orderId: string,
    providerOrderId: string
): Promise<void> {
    await db().collection(COLLECTION).doc(orderId).update({
        'payment.providerOrderId': providerOrderId,
        'payment.attempts': FieldValue.increment(1),
        updatedAt: Timestamp.now(),
    });
}

export async function markOrderPaid(
    orderId: string,
    details: { providerPaymentId: string; method?: string }
): Promise<void> {
    const now = Timestamp.now();
    await db()
        .collection(COLLECTION)
        .doc(orderId)
        .update({
            'payment.status': 'paid',
            'payment.providerPaymentId': details.providerPaymentId,
            'payment.method': details.method ?? null,
            'payment.paidAt': now,
            'automation.stage': 'shipment_pending' satisfies OrderAutomationStage,
            'automation.history': FieldValue.arrayUnion({
                stage: 'payment_received' satisfies OrderAutomationStage,
                at: now,
            }),
            updatedAt: now,
        });
}

export async function markOrderPaymentFailed(
    orderId: string,
    reason: string
): Promise<void> {
    const now = Timestamp.now();
    await db().collection(COLLECTION).doc(orderId).update({
        'payment.status': 'failed',
        'payment.failureReason': reason,
        'automation.stage': 'failed' satisfies OrderAutomationStage,
        'automation.lastError': reason,
        updatedAt: now,
    });
}

// =============================================================
//  Shipment-side helpers (Phase 4 — Shiprocket integration)
// =============================================================

/**
 * Merge a partial OrderShipmentRef into the order's `shipment` field.
 * Used after each Shiprocket call (create-order, assign-awb, generate-label,
 * track) to incrementally fill in what we know.
 */
export async function attachShipmentRef(
    orderId: string,
    partial: Partial<OrderShipmentRef>
): Promise<void> {
    const updates: Record<string, unknown> = {
        updatedAt: Timestamp.now(),
    };
    for (const [k, v] of Object.entries(partial)) {
        if (v === undefined) continue;
        updates[`shipment.${k}`] = v;
    }
    await db().collection(COLLECTION).doc(orderId).update(updates);
}

/**
 * Move the order automation pipeline to a new stage and append a history entry.
 * If `error` is given, also persists it as the last error (use this for
 * stage='failed' transitions).
 */
export async function setAutomationStage(
    orderId: string,
    stage: OrderAutomationStage,
    opts: { note?: string; error?: string } = {}
): Promise<void> {
    const now = Timestamp.now();
    const update: Record<string, unknown> = {
        'automation.stage': stage,
        'automation.history': FieldValue.arrayUnion({
            stage,
            at: now,
            ...(opts.note ? { note: opts.note } : {}),
        }),
        updatedAt: now,
    };
    if (opts.error) {
        update['automation.lastError'] = opts.error;
    }
    await db().collection(COLLECTION).doc(orderId).update(update);
}

export async function incrementAutomationAttempts(
    orderId: string
): Promise<void> {
    await db().collection(COLLECTION).doc(orderId).update({
        'automation.attempts': FieldValue.increment(1),
        updatedAt: Timestamp.now(),
    });
}

/**
 * Record a transient failure and schedule a future retry. Phase 7's cron
 * job will pick up orders where `automation.nextRetryAt < now` and re-run
 * the orchestrator. Until that ships, retries are manually triggered via
 * /api/orders/fulfill.
 */
export async function scheduleRetry(
    orderId: string,
    delayMinutes: number,
    error: string
): Promise<void> {
    const nextRetryAt = Timestamp.fromMillis(
        Date.now() + delayMinutes * 60 * 1000
    );
    await db().collection(COLLECTION).doc(orderId).update({
        'automation.nextRetryAt': nextRetryAt,
        'automation.lastError': error,
        updatedAt: Timestamp.now(),
    });
}

export async function clearScheduledRetry(orderId: string): Promise<void> {
    await db().collection(COLLECTION).doc(orderId).update({
        'automation.nextRetryAt': FieldValue.delete(),
        updatedAt: Timestamp.now(),
    });
}

// =============================================================
//  Fulfilment lock — prevents concurrent orchestrator runs on the
//  same order (e.g. webhook fires while a manual retry is in flight).
//
//  Lock is a single timestamp field. We treat any lock older than
//  FULFILLMENT_LOCK_TIMEOUT_MS as stale and reclaimable — covers the
//  case where a previous run crashed without releasing.
// =============================================================
const FULFILLMENT_LOCK_TIMEOUT_MS = 2 * 60 * 1000;   // 2 minutes

export interface FulfillmentLockResult {
    acquired: boolean;
    reason?: string;
}

export async function tryAcquireFulfillmentLock(
    orderId: string
): Promise<FulfillmentLockResult> {
    return db().runTransaction(async (tx) => {
        const ref = db().collection(COLLECTION).doc(orderId);
        const snap = await tx.get(ref);
        if (!snap.exists) {
            return { acquired: false, reason: 'Order not found' };
        }
        const data = snap.data() as any;
        const lockedAt = data?.automation?.fulfillmentLockedAt;
        if (lockedAt && typeof lockedAt.toMillis === 'function') {
            const ageMs = Date.now() - lockedAt.toMillis();
            if (ageMs < FULFILLMENT_LOCK_TIMEOUT_MS) {
                return {
                    acquired: false,
                    reason: `Fulfilment already in progress (locked ${Math.round(ageMs / 1000)}s ago)`,
                };
            }
            // Stale lock — fall through and reclaim.
        }
        tx.update(ref, {
            'automation.fulfillmentLockedAt': Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        return { acquired: true };
    });
}

export async function releaseFulfillmentLock(orderId: string): Promise<void> {
    await db().collection(COLLECTION).doc(orderId).update({
        'automation.fulfillmentLockedAt': FieldValue.delete(),
        updatedAt: Timestamp.now(),
    });
}
