/**
 * POST /api/v1/b2b/webhooks/courier/:courier
 *
 * Courier webhook receiver. Generic handler — the carrier-specific bits
 * (signature verification, payload parsing, AWB → shipment resolution,
 * normalization) live in a CourierWebhookHandler registered for `:courier`.
 *
 * The route ALWAYS returns 2xx after the signature check passes. Carriers
 * retry on non-2xx; per-event failures are logged and recovered via the
 * polling reconciler — we never re-fire a whole batch over one bad event.
 *
 * Registration: see src/services/b2b/couriers/index.ts. Concrete handlers
 * for BlueDart / Delhivery / DTDC land in Phase 2 step 5.
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { isCourierCode } from '@/types/b2b/shipment';
import {
    buildError,
    buildRequestContext,
    err,
    getLogger,
    ok,
} from '@/services/b2b/http';
import { getCourierWebhookHandler } from '@/services/b2b/couriers';
import { buildFirestoreEventIngestor } from '@/services/b2b/infra';

const log = getLogger('api.v1.b2b.webhooks.courier');

interface PerEventResult {
    skipped: boolean;
    reason?: 'shipment_not_found';
    outcome?: string;
    rawCode?: string;
}

export async function POST(
    req: NextRequest,
    ctxParam: { params: Promise<{ courier: string }> },
) {
    const ctx = buildRequestContext(req);
    const { courier: courierRaw } = await ctxParam.params;

    if (!isCourierCode(courierRaw)) {
        return err(
            buildError('invalid_request', `Unknown courier '${courierRaw}'`),
            400,
            ctx,
        );
    }
    const courier = courierRaw;

    const handler = getCourierWebhookHandler(courier);
    if (!handler) {
        log.warn('no webhook handler registered', {
            requestId: ctx.requestId,
            courier,
        });
        return err(
            buildError('service_unavailable', `No webhook handler registered for '${courier}'`),
            503,
            ctx,
        );
    }

    // Read raw body BEFORE parsing — signature is over the byte sequence,
    // not the parsed JSON, so any normalization after this would invalidate
    // the check.
    const rawBody = await req.text();

    const sigCheck = await handler.verifySignature(req, rawBody);
    if (!sigCheck.ok) {
        log.warn('signature check failed', {
            requestId: ctx.requestId,
            courier,
            reason: sigCheck.reason,
        });
        return err(
            buildError('authentication_failed', 'Webhook signature verification failed'),
            401,
            ctx,
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawBody);
    } catch {
        return err(buildError('invalid_request', 'Webhook body is not valid JSON'), 400, ctx);
    }

    const rawEvents = handler.parseEvents(parsed);
    const receivedAt = new Date();

    const db = getFirestore(adminApp);
    const ingestor = buildFirestoreEventIngestor(db);

    const perEvent = await Promise.allSettled(
        rawEvents.map(async (raw): Promise<PerEventResult> => {
            const resolved = await handler.resolveShipment(raw);
            if (!resolved) {
                log.warn('shipment lookup failed for webhook event', {
                    requestId: ctx.requestId,
                    courier,
                    rawCode: raw.rawCode,
                });
                return { skipped: true, reason: 'shipment_not_found', rawCode: raw.rawCode };
            }
            const normalized = handler.normalize(raw, resolved.shipmentId, receivedAt);
            const result = await ingestor.ingest({
                event: normalized,
                initiator: { type: 'courier_webhook', courier },
                shipmentId: resolved.shipmentId,
                partnerId: resolved.partnerId,
            });
            return { skipped: false, outcome: result.outcome, rawCode: raw.rawCode };
        }),
    );

    let applied = 0;
    let skipped = 0;
    let failed = 0;
    let otherOutcomes = 0;
    for (const r of perEvent) {
        if (r.status === 'rejected') {
            failed += 1;
            log.error('event ingest threw', {
                requestId: ctx.requestId,
                courier,
                error: r.reason instanceof Error ? r.reason.message : String(r.reason),
            });
            continue;
        }
        if (r.value.skipped) {
            skipped += 1;
            continue;
        }
        if (r.value.outcome === 'applied') {
            applied += 1;
        } else {
            otherOutcomes += 1;
        }
    }

    log.info('webhook batch ingested', {
        requestId: ctx.requestId,
        courier,
        processed: rawEvents.length,
        applied,
        skipped,
        failed,
        otherOutcomes,
    });

    return ok(
        {
            courier,
            processed: rawEvents.length,
            applied,
            skipped,
            failed,
            otherOutcomes,
        },
        ctx,
    );
}
