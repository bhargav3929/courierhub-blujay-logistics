/**
 * POST /api/razorpay/webhook
 *
 * Razorpay → Blujay webhook. Authoritative source of truth for payment status.
 *
 * Scope (revised — admin-driven shipments):
 *   This handler ONLY updates payment status on the order. It does NOT
 *   trigger shipment creation. An admin/user creates the shipment manually
 *   from the dashboard (which calls /api/orders/fulfill). Tracking + AWB
 *   generation remain automated *after* fulfilment is manually kicked off.
 *
 * Setup:
 *   Razorpay Dashboard → Webhooks → Add Webhook
 *     URL:    https://<domain>/api/razorpay/webhook
 *     Secret: any value of your choice → set as RAZORPAY_WEBHOOK_SECRET
 *     Events: payment.captured, payment.failed, order.paid
 *
 * Local dev: expose your local server with ngrok or cloudflared and register
 *            that public URL as a *test* webhook in Razorpay Test Mode.
 *
 * Response policy (Razorpay retries non-2xx for up to 24h):
 *   - signature mismatch  → 400  (do NOT retry)
 *   - missing signature   → 400
 *   - unknown event type  → 200  (log + ack — don't retry forever)
 *   - unmatched order     → 200  (log + ack — we don't own this Razorpay order)
 *   - downstream failure  → 500  (Razorpay retries; idempotent re-processing is safe)
 *
 * Idempotency:
 *   - Each event hit is recorded in webhook_events/{provider}:{eventId}.
 *   - markOrderPaid() is idempotent (no-op when already paid), so a duplicate
 *     event from a Razorpay retry won't double-charge or double-update.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import {
    getOrderById,
    markOrderPaid,
    markOrderPaymentFailed,
} from '@/services/server/orderAdminService';
import {
    recordWebhookHit,
    markWebhookProcessed,
    markWebhookFailed,
} from '@/lib/webhookEvents';

async function findOrderIdByRazorpayOrderId(
    razorpayOrderId: string
): Promise<string | null> {
    const snap = await getFirestore(adminApp)
        .collection('orders')
        .where('payment.providerOrderId', '==', razorpayOrderId)
        .limit(1)
        .get();
    return snap.empty ? null : snap.docs[0].id;
}

export async function POST(request: NextRequest) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        // Misconfiguration on our side — return 500 so Razorpay retries
        // (and so we notice via the failed-delivery dashboard).
        console.error('[razorpay/webhook] RAZORPAY_WEBHOOK_SECRET is not set');
        return NextResponse.json(
            { error: 'Webhook secret not configured' },
            { status: 500 }
        );
    }

    // CRITICAL: HMAC must be computed over the raw bytes Razorpay sent.
    // Calling request.json() and re-stringifying is NOT byte-equivalent.
    let rawBody: string;
    try {
        rawBody = await request.text();
    } catch {
        return NextResponse.json(
            { error: 'Could not read request body' },
            { status: 400 }
        );
    }

    const provided = request.headers.get('x-razorpay-signature') || '';
    if (!provided) {
        return NextResponse.json(
            { error: 'Missing x-razorpay-signature header' },
            { status: 400 }
        );
    }

    const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    const sigValid =
        expectedBuf.length === providedBuf.length &&
        crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!sigValid) {
        console.warn('[razorpay/webhook] signature mismatch — rejecting');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    let event: any;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventType: string = event?.event || 'unknown';

    // Razorpay does send a `x-razorpay-event-id` header for new accounts; for
    // older accounts it lives in the body as `event.id`. Fall back to a
    // deterministic fingerprint so we still get dedup even when both are missing.
    const paymentEntityId = event?.payload?.payment?.entity?.id;
    const orderEntityId = event?.payload?.order?.entity?.id;
    const eventId: string =
        request.headers.get('x-razorpay-event-id') ||
        event?.id ||
        `${eventType}:${paymentEntityId || orderEntityId || 'no-id'}:${event?.created_at || 'no-ts'}`;

    // Audit hit. We continue regardless of new/duplicate — the order state
    // machine is the real idempotency guarantee.
    let firstSight: 'new' | 'duplicate' = 'new';
    try {
        firstSight = await recordWebhookHit({
            provider: 'razorpay',
            eventId,
            event: eventType,
        });
    } catch (err: any) {
        console.warn(
            `[razorpay/webhook] failed to record hit (continuing): ${err?.message || err}`
        );
    }
    if (firstSight === 'duplicate') {
        console.log(
            `[razorpay/webhook] duplicate hit event=${eventType} id=${eventId}`
        );
    }

    try {
        const payment = event?.payload?.payment?.entity;
        const order = event?.payload?.order?.entity;
        const razorpayOrderId: string | undefined = payment?.order_id || order?.id;

        if (!razorpayOrderId) {
            console.warn(
                `[razorpay/webhook] event=${eventType} has no order_id — acknowledging`
            );
            await markWebhookProcessed('razorpay', eventId);
            return NextResponse.json({ ok: true, ignored: true });
        }

        const internalOrderId = await findOrderIdByRazorpayOrderId(razorpayOrderId);
        if (!internalOrderId) {
            console.warn(
                `[razorpay/webhook] no internal order matches rzp=${razorpayOrderId} — acknowledging`
            );
            await markWebhookProcessed('razorpay', eventId);
            return NextResponse.json({ ok: true, unmatched: true });
        }

        // Idempotency at the order level: skip work if state already terminal.
        const current = await getOrderById(internalOrderId);
        if (!current) {
            // Order existed when queried by index but not now — skip safely.
            await markWebhookProcessed('razorpay', eventId, internalOrderId);
            return NextResponse.json({ ok: true });
        }

        switch (eventType) {
            case 'payment.captured':
            case 'order.paid': {
                if (current.payment.status === 'paid') {
                    console.log(
                        `[razorpay/webhook] order=${internalOrderId} already paid — ack`
                    );
                    break;
                }
                const paymentId =
                    payment?.id || `${razorpayOrderId}:no-payment-id`;
                await markOrderPaid(internalOrderId, {
                    providerPaymentId: paymentId,
                    method: payment?.method,
                });
                console.log(
                    `[razorpay/webhook] paid order=${internalOrderId} via=${eventType} payment=${paymentId} — awaiting admin to create shipment`
                );
                // NOTE: shipment creation is admin-driven. The dashboard calls
                // /api/orders/fulfill when an operator decides to fulfil the
                // order. This webhook only updates payment state.
                break;
            }
            case 'payment.failed': {
                if (current.payment.status === 'paid') {
                    // payment.failed AFTER paid would be unusual — log and don't downgrade.
                    console.warn(
                        `[razorpay/webhook] payment.failed for already-paid order=${internalOrderId} — ignored`
                    );
                    break;
                }
                const reason =
                    payment?.error_description ||
                    payment?.error_reason ||
                    `Razorpay reported ${eventType}`;
                await markOrderPaymentFailed(internalOrderId, reason);
                console.log(
                    `[razorpay/webhook] failed order=${internalOrderId} reason="${reason}"`
                );
                break;
            }
            default: {
                console.log(
                    `[razorpay/webhook] unhandled event=${eventType} order=${internalOrderId} — ack`
                );
            }
        }

        await markWebhookProcessed('razorpay', eventId, internalOrderId);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        const message = err?.message || String(err);
        console.error(
            `[razorpay/webhook] processing error event=${eventType}:`,
            message
        );
        // Best-effort failure record — swallow secondary errors so we still 500.
        markWebhookFailed('razorpay', eventId, message).catch(() => {});
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
