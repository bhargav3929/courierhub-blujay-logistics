// Inbound-webhook audit + idempotency tracking.
//
// One document per (provider, event_id). The doc is the *audit trail*
// — the actual idempotency guarantee comes from the order's payment
// state machine being write-once (markOrderPaid is a no-op when the
// order is already paid). This file captures every webhook hit so we
// have a record for diagnosis and so retries from the provider don't
// pollute logs as new events.
import {
    getFirestore,
    Timestamp,
    FieldValue,
} from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';

const COLLECTION = 'webhook_events';
const db = () => getFirestore(adminApp);

export type WebhookProvider = 'razorpay' | 'shiprocket';

export interface RecordWebhookOptions {
    provider: WebhookProvider;
    eventId: string;
    event: string;
    orderId?: string;
}

/**
 * Atomically record a webhook hit and report whether it's the first time
 * we've seen this event id.
 *
 * Returns:
 *   - 'new'        : never seen before; caller should process.
 *   - 'duplicate'  : already recorded; caller should still re-run handlers
 *                    because handlers are idempotent — but a warning log
 *                    is appropriate.
 */
export async function recordWebhookHit(
    opts: RecordWebhookOptions
): Promise<'new' | 'duplicate'> {
    const docId = `${opts.provider}:${opts.eventId}`;
    const ref = db().collection(COLLECTION).doc(docId);
    try {
        await ref.create({
            id: docId,
            provider: opts.provider,
            event: opts.event,
            orderId: opts.orderId ?? null,
            firstSeenAt: Timestamp.now(),
            lastSeenAt: Timestamp.now(),
            hits: 1,
            status: 'received',
        });
        return 'new';
    } catch (err: any) {
        // ALREADY_EXISTS code = 6 (firebase-admin).
        const isAlreadyExists =
            err?.code === 6 ||
            /ALREADY_EXISTS|already exists/i.test(err?.message || '');
        if (!isAlreadyExists) throw err;

        await ref.update({
            lastSeenAt: Timestamp.now(),
            hits: FieldValue.increment(1),
        });
        return 'duplicate';
    }
}

export async function markWebhookProcessed(
    provider: WebhookProvider,
    eventId: string,
    orderId?: string
): Promise<void> {
    await db().collection(COLLECTION).doc(`${provider}:${eventId}`).set(
        {
            status: 'processed',
            processedAt: Timestamp.now(),
            ...(orderId ? { orderId } : {}),
        },
        { merge: true }
    );
}

export async function markWebhookFailed(
    provider: WebhookProvider,
    eventId: string,
    error: string
): Promise<void> {
    await db().collection(COLLECTION).doc(`${provider}:${eventId}`).set(
        {
            status: 'failed',
            error,
            failedAt: Timestamp.now(),
        },
        { merge: true }
    );
}
