/**
 * GET /api/v1/b2b/shipments/:id/tracking
 *
 * Returns the normalized event history for a shipment.
 *
 * Query params:
 *   limit:      1..200 (default 50)
 *   cursor:     opaque pagination cursor (from previous response's nextCursor)
 *   direction:  'asc' (default) | 'desc'
 *
 * Tenant safety: the FirestoreShipmentReader.load() call returns null when
 * the shipment is not owned by the authenticated partner. We surface that
 * as 404 (same as "not found") to avoid leaking cross-tenant existence.
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { authenticateB2BRequest } from '@/lib/b2bAuth';
import { ShipmentId } from '@/types/b2b/ids';
import {
    buildError,
    buildRequestContext,
    err,
    getLogger,
    ok,
} from '@/services/b2b/http';
import {
    FirestoreEventReader,
    FirestoreShipmentReader,
} from '@/services/b2b/infra';

const log = getLogger('api.v1.b2b.shipments.tracking');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(
    req: NextRequest,
    ctxParam: { params: Promise<{ id: string }> },
) {
    const ctx = buildRequestContext(req);
    const { id: shipmentIdRaw } = await ctxParam.params;
    const shipmentId = ShipmentId(shipmentIdRaw);

    // ─── Authenticate ────────────────────────────────────────────────
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
    const { partnerId } = auth.partner;

    // ─── Parse query params ──────────────────────────────────────────
    const url = req.nextUrl;
    const limitRaw = url.searchParams.get('limit');
    const limit = clampLimit(parseInt(limitRaw ?? '', 10));
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const direction = url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc';

    const db = getFirestore(adminApp);

    // ─── Cross-tenant guard via reader ───────────────────────────────
    const reader = new FirestoreShipmentReader(db);
    const shipmentCtx = await reader.load(partnerId, shipmentId);
    if (!shipmentCtx) {
        return err(buildError('not_found', 'Shipment not found'), 404, ctx);
    }

    // ─── Read events ─────────────────────────────────────────────────
    const eventReader = new FirestoreEventReader(db);
    let result;
    try {
        result = await eventReader.listEvents({
            partnerId,
            shipmentId,
            limit,
            cursor,
            direction,
        });
    } catch (e) {
        log.error('event read failed', {
            requestId: ctx.requestId,
            partnerId,
            shipmentId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Failed to read tracking history'), 500, ctx);
    }

    const data = {
        shipmentId,
        currentStatus: shipmentCtx.snapshot.status,
        events: result.events.map((view) => ({
            eventId: view.eventId,
            type: view.event.type,
            source: view.event.source,
            occurredAt: view.event.occurredAt.toISOString(),
            location: view.event.location,
            facility: view.event.facility,
            description: view.event.description,
            impliedStatus: view.event.impliedStatus,
            impliedReason: view.event.impliedReason,
            applied: view.applied,
            appliedReason: view.appliedReason,
            statusTransition: view.statusTransition,
            recordedAt: view.recordedAt.toISOString(),
        })),
        nextCursor: result.nextCursor,
    };

    return ok(data, ctx);
}

function clampLimit(raw: number): number {
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
    if (raw > MAX_LIMIT) return MAX_LIMIT;
    return Math.floor(raw);
}
