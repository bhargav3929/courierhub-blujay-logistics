/**
 * POST /api/shiprocket/webhook
 *
 * Shiprocket → Blujay inbound tracking webhook. Authoritative source of
 * tracking status updates between order creation and delivery.
 *
 * Setup:
 *   Shiprocket Dashboard → Settings → API → Webhooks → Configure
 *     URL:   https://<domain>/api/shiprocket/webhook
 *     Token: any value of your choice → mirror in SHIPROCKET_WEBHOOK_TOKEN
 *
 * Verification:
 *   Shiprocket signs the raw body with HMAC-SHA256 using your token,
 *   surfacing the result in the `x-api-hmac-sha256` header. We verify
 *   timing-safe before doing any DB work.
 *
 * Response policy:
 *   - signature mismatch / missing  → 400 (don't retry — config error)
 *   - unmatched AWB                 → 200 (we don't own this shipment)
 *   - duplicate event               → 200 (idempotent)
 *   - downstream error              → 500 (Shiprocket retries)
 *
 * Idempotency: each event is recorded in webhook_events/shiprocket:<id>.
 * Order state machine is the second-line guarantee — same status update
 * applied twice is a harmless no-op.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import {
    attachShipmentRef,
    setAutomationStage,
} from '@/services/server/orderAdminService';
import {
    recordWebhookHit,
    markWebhookProcessed,
    markWebhookFailed,
} from '@/lib/webhookEvents';
import type { OrderAutomationStage } from '@/types/order';

// Shiprocket numeric status codes → our automation stages.
//   6   In Transit
//   7   Delivered
//   8/9/10 RTO / Cancelled / Lost (failure-ish)
//   17/18/19  Out for Delivery / OFD variants
function mapStatusToStage(code: number | undefined): OrderAutomationStage | null {
    if (code === undefined || code === null) return null;
    if (code === 7) return 'delivered';
    if ([6, 17, 18, 19].includes(code)) return 'in_transit';
    if ([8, 9, 10].includes(code)) return 'failed';
    return null;
}

async function findOrderIdByAwb(awb: string): Promise<string | null> {
    const snap = await getFirestore(adminApp)
        .collection('orders')
        .where('shipment.awb', '==', awb)
        .limit(1)
        .get();
    return snap.empty ? null : snap.docs[0].id;
}

export async function POST(request: NextRequest) {
    const token = process.env.SHIPROCKET_WEBHOOK_TOKEN;
    if (!token) {
        console.error('[shiprocket/webhook] SHIPROCKET_WEBHOOK_TOKEN is not set');
        return NextResponse.json(
            { error: 'Webhook token not configured' },
            { status: 500 }
        );
    }

    // Read raw body — HMAC must run on the exact bytes Shiprocket sent.
    let rawBody: string;
    try {
        rawBody = await request.text();
    } catch {
        return NextResponse.json(
            { error: 'Could not read body' },
            { status: 400 }
        );
    }

    const provided =
        request.headers.get('x-api-hmac-sha256') ||
        request.headers.get('x-shiprocket-hmac-sha256') ||
        '';
    if (!provided) {
        return NextResponse.json(
            { error: 'Missing HMAC header (x-api-hmac-sha256)' },
            { status: 400 }
        );
    }

    const expected = crypto
        .createHmac('sha256', token)
        .update(rawBody)
        .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    const sigValid =
        a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!sigValid) {
        console.warn('[shiprocket/webhook] signature mismatch — rejecting');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    let event: any;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Shiprocket payload shape varies — handle both flat and nested formats.
    const awb: string | undefined =
        event?.awb ||
        event?.awb_code ||
        event?.tracking_data?.shipment_track?.[0]?.awb_code;
    const statusText: string | undefined =
        event?.current_status ||
        event?.tracking_data?.shipment_track?.[0]?.current_status;
    const rawStatusCode =
        event?.current_status_id ??
        event?.shipment_status ??
        event?.tracking_data?.shipment_track?.[0]?.current_status_id ??
        event?.tracking_data?.shipment_status;
    const statusCode: number | undefined =
        rawStatusCode != null ? Number(rawStatusCode) : undefined;
    const trackUrl: string | undefined =
        event?.track_url || event?.tracking_data?.track_url;

    // Build a deterministic event id for idempotency.
    const eventId =
        request.headers.get('x-event-id') ||
        event?.event_id ||
        `${awb || 'no-awb'}:${statusCode ?? 'no-code'}:${event?.scans?.[0]?.date ?? event?.tracking_data?.shipment_track?.[0]?.updated_time_stamp ?? Date.now()}`;

    let firstSight: 'new' | 'duplicate' = 'new';
    try {
        firstSight = await recordWebhookHit({
            provider: 'shiprocket',
            eventId,
            event: `tracking-update:${statusCode ?? 'unknown'}`,
        });
    } catch (err: any) {
        console.warn(
            `[shiprocket/webhook] failed to record hit (continuing): ${err?.message || err}`
        );
    }

    if (!awb) {
        console.warn('[shiprocket/webhook] payload has no AWB — acknowledging');
        await markWebhookProcessed('shiprocket', eventId);
        return NextResponse.json({ ok: true, ignored: true });
    }

    try {
        const orderId = await findOrderIdByAwb(awb);
        if (!orderId) {
            console.warn(
                `[shiprocket/webhook] no order matches awb=${awb} — ack`
            );
            await markWebhookProcessed('shiprocket', eventId);
            return NextResponse.json({ ok: true, unmatched: true });
        }

        // Always sync the latest status to the order, even on duplicate hits —
        // the status field is overwritable and Shiprocket's dedup window is
        // imperfect. attachShipmentRef merges; cheap.
        await attachShipmentRef(orderId, {
            ...(statusText ? { status: statusText } : {}),
            ...(statusCode !== undefined ? { statusCode } : {}),
            ...(trackUrl ? { trackingUrl: trackUrl } : {}),
            lastSyncedAt: Timestamp.now() as any,
        });

        // Advance the automation stage if the new status implies a transition,
        // and only if it's a *different* state — re-applying same stage just
        // creates noise in the history log.
        const nextStage = mapStatusToStage(statusCode);
        if (nextStage) {
            const fresh = await getFirestore(adminApp)
                .collection('orders')
                .doc(orderId)
                .get();
            const currentStage = fresh.data()?.automation?.stage as
                | OrderAutomationStage
                | undefined;
            if (
                currentStage &&
                currentStage !== nextStage &&
                currentStage !== 'cancelled'
            ) {
                await setAutomationStage(orderId, nextStage, {
                    note: `tracking webhook: ${statusText ?? `status-${statusCode}`}`,
                });
                console.log(
                    `[shiprocket/webhook] order=${orderId} ${currentStage} → ${nextStage} (awb=${awb})`
                );
            }
        }

        await markWebhookProcessed('shiprocket', eventId, orderId);
        return NextResponse.json({
            ok: true,
            ...(firstSight === 'duplicate' ? { duplicate: true } : {}),
        });
    } catch (err: any) {
        const message = err?.message || String(err);
        console.error(
            `[shiprocket/webhook] processing error awb=${awb}:`,
            message
        );
        markWebhookFailed('shiprocket', eventId, message).catch(() => {});
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
