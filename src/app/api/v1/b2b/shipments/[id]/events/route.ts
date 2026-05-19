/**
 * POST /api/v1/b2b/shipments/:id/events
 *
 * Partner manual tracking update. Used by partners in self_shipment,
 * manual, or hybrid tracking modes to push a status change.
 *
 * Auth:    Bearer bj_<key>  OR  X-Blujay-Api-Key: bj_<key>  (scope=b2b_partner)
 * Header:  Idempotency-Key: <uuid>     (required)
 * Body:    { status, occurredAt, location?, description?, reasonCode? }
 *
 * The route is thin: authenticate → validate → idempotency-reserve →
 * normalize → ingestor.ingest() → map result → commit idempotency.
 * No business logic. All decisions live in the EventIngestor.
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminApp } from '@/lib/firebaseAdmin';
import { authenticateB2BRequest } from '@/lib/b2bAuth';
import { ShipmentId } from '@/types/b2b/ids';
import {
    buildError,
    buildRequestContext,
    commitIdempotency,
    computeRequestHash,
    errBody,
    err,
    getLogger,
    jsonResponse,
    mapIngestResult,
    okBody,
    reserveIdempotency,
    validateIdempotencyKey,
    zodErrorToApiError,
} from '@/services/b2b/http';
import {
    buildFirestoreEventIngestor,
    FirestoreIdempotencyStore,
} from '@/services/b2b/infra';
import { EventNormalizer } from '@/services/b2b/tracking';

// Partners can push only post-booking statuses via this endpoint. `book`
// and `cancel` go through dedicated endpoints (later phases). Status that
// only the system can set (e.g. `draft`, `on_hold`) is also excluded.
const ManualStatusEnum = z.enum([
    'ready_for_pickup',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'undelivered',
    'rto_initiated',
    'rto_in_transit',
    'rto_delivered',
    'lost',
    'damaged',
]);

const Body = z.object({
    status: ManualStatusEnum,
    occurredAt: z.string().datetime({ offset: true }),
    location: z
        .object({
            city: z.string().min(1).max(100).optional(),
            pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(),
            raw: z.string().min(1).max(200).optional(),
        })
        .optional(),
    description: z.string().max(500).optional(),
    reasonCode: z.string().min(1).max(64).optional(),
});

const log = getLogger('api.v1.b2b.shipments.events');

export async function POST(
    req: NextRequest,
    ctxParam: { params: Promise<{ id: string }> },
) {
    const ctx = buildRequestContext(req);
    const { id: shipmentIdRaw } = await ctxParam.params;
    const shipmentId = ShipmentId(shipmentIdRaw);

    // ─── 1. Authenticate ────────────────────────────────────────────
    const auth = await authenticateB2BRequest(req);
    if (!auth.ok) {
        const status =
            auth.failure.kind === 'unauthorized' ? 401
            : auth.failure.kind === 'forbidden' ? 403
            : 500;
        const code =
            auth.failure.kind === 'unauthorized' ? 'authentication_failed' as const
            : auth.failure.kind === 'forbidden' ? 'permission_denied' as const
            : 'internal_error' as const;
        return err(buildError(code, auth.failure.reason), status, ctx);
    }
    const { partnerId, apiKeyId } = auth.partner;

    // ─── 2. Idempotency-Key header ──────────────────────────────────
    const idempotencyKey =
        req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
    if (!idempotencyKey || !validateIdempotencyKey(idempotencyKey)) {
        return err(
            buildError(
                'idempotency_required',
                'A valid Idempotency-Key header is required for this endpoint',
            ),
            400,
            ctx,
        );
    }

    // ─── 3. Parse and validate body ─────────────────────────────────
    let json: unknown;
    try {
        json = await req.json();
    } catch {
        return err(buildError('invalid_request', 'Request body must be valid JSON'), 400, ctx);
    }
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
        return err(zodErrorToApiError(parsed.error), 422, ctx);
    }
    const body = parsed.data;

    // ─── 4. Reserve idempotency ─────────────────────────────────────
    const db = getFirestore(adminApp);
    const idStore = new FirestoreIdempotencyStore(db);
    const requestHash = computeRequestHash('POST', req.nextUrl.pathname, body);

    let reservation;
    try {
        reservation = await reserveIdempotency(idStore, partnerId, idempotencyKey, requestHash);
    } catch (e) {
        log.error('idempotency reserve failed', {
            requestId: ctx.requestId,
            partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Failed to reserve idempotency key'), 500, ctx);
    }

    if (reservation.kind === 'replay') {
        log.info('idempotency replay', { requestId: ctx.requestId, partnerId, shipmentId });
        return jsonResponse(
            reservation.response.body as never,
            reservation.response.httpStatus,
            ctx.requestId,
            { 'Idempotency-Replay': 'true' },
        );
    }
    if (reservation.kind === 'in_progress') {
        return err(
            buildError(
                'idempotency_in_progress',
                'A request with this Idempotency-Key is already in progress; retry shortly',
            ),
            409,
            ctx,
        );
    }
    if (reservation.kind === 'mismatch') {
        return err(
            buildError(
                'idempotency_replay_mismatch',
                'Idempotency-Key was reused with a different request body',
            ),
            409,
            ctx,
        );
    }

    // ─── 5. Build the normalized event ──────────────────────────────
    const event = EventNormalizer.fromManualEvent(
        {
            status: body.status,
            occurredAt: new Date(body.occurredAt),
            location: body.location
                ? {
                    city: body.location.city,
                    pincode: body.location.pincode,
                    raw: body.location.raw,
                }
                : undefined,
            description: body.description,
            reasonCode: body.reasonCode,
        },
        shipmentId,
        new Date(),
    );

    // ─── 6. Ingest ──────────────────────────────────────────────────
    const ingestor = buildFirestoreEventIngestor(db);
    let result;
    try {
        result = await ingestor.ingest({
            event,
            initiator: { type: 'partner_api', partnerId, apiKeyId },
            shipmentId,
            partnerId,
        });
    } catch (e) {
        log.error('ingestor.ingest threw', {
            requestId: ctx.requestId,
            partnerId,
            shipmentId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Failed to process event'), 500, ctx);
    }

    log.info('manual event ingest', {
        requestId: ctx.requestId,
        partnerId,
        shipmentId,
        outcome: result.outcome,
    });

    // ─── 7. Map result to API outcome ───────────────────────────────
    const mapped = mapIngestResult(result);
    const body200 = mapped.ok
        ? okBody(mapped.data, ctx)
        : errBody(mapped.error, ctx);

    // ─── 8. Commit idempotency record ───────────────────────────────
    try {
        await commitIdempotency(idStore, partnerId, idempotencyKey, mapped.status, body200);
    } catch (e) {
        // Non-fatal: response was already computed correctly. A retry with
        // the same key will hit `in_progress` and the partner can retry.
        log.warn('idempotency commit failed', {
            requestId: ctx.requestId,
            partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
    }

    return jsonResponse(body200, mapped.status, ctx.requestId);
}
