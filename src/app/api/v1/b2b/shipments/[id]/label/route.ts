/**
 * GET /api/v1/b2b/shipments/:id/label
 *
 * Returns a fresh signed URL for the shipment's label. Re-callable: each
 * call mints a new 24h-TTL URL backed by the same stored artifact.
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { authenticateB2BRequest } from '@/lib/b2bAuth';
import {
    buildError,
    buildRequestContext,
    err,
    getLogger,
    ok,
} from '@/services/b2b/http';
import { buildLabelService, FirestoreShipmentReader } from '@/services/b2b/infra';
import { ShipmentId } from '@/types/b2b/ids';
import { COLLECTIONS } from '@/services/b2b/infra';
import type { LabelArtifact } from '@/types/b2b/label';
import { Timestamp } from 'firebase-admin/firestore';

const log = getLogger('api.v1.b2b.shipments.label');

export async function GET(
    req: NextRequest,
    ctxParam: { params: Promise<{ id: string }> },
) {
    const ctx = buildRequestContext(req);
    const { id: shipmentIdRaw } = await ctxParam.params;
    const shipmentId = ShipmentId(shipmentIdRaw);

    const auth = await authenticateB2BRequest(req);
    if (!auth.ok) {
        const status = auth.failure.kind === 'unauthorized' ? 401 : 500;
        const code = status === 401 ? 'authentication_failed' as const : 'internal_error' as const;
        return err(buildError(code, auth.failure.reason), status, ctx);
    }
    const { partnerId } = auth.partner;

    const db = getFirestore(adminApp);
    const reader = new FirestoreShipmentReader(db);
    const shipmentCtx = await reader.load(partnerId, shipmentId);
    if (!shipmentCtx) {
        return err(buildError('not_found', 'Shipment not found'), 404, ctx);
    }

    // Read the label artifact directly from the doc; the reader's
    // ShipmentContext doesn't surface it. One extra read; tolerable for a
    // labels endpoint that's not on the hot path.
    let artifact: LabelArtifact | null = null;
    try {
        const doc = await db.collection(COLLECTIONS.SHIPMENTS).doc(shipmentId).get();
        const data = doc.data() as { artifacts?: { label?: unknown } };
        const raw = data?.artifacts?.label as
            | (Omit<LabelArtifact, 'retrievedAt'> & { retrievedAt: Timestamp | null })
            | null
            | undefined;
        if (raw) {
            artifact = {
                ...raw,
                retrievedAt: raw.retrievedAt instanceof Timestamp ? raw.retrievedAt.toDate() : null,
            };
        }
    } catch (e) {
        log.error('label artifact read failed', {
            requestId: ctx.requestId, partnerId, shipmentId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Failed to read label artifact'), 500, ctx);
    }

    try {
        const service = buildLabelService(db);
        const result = await service.getLabel(partnerId, shipmentId, artifact);

        switch (result.kind) {
            case 'available':
                return ok({
                    shipmentId,
                    status: 'available' as const,
                    format: result.format,
                    signedUrl: result.signedUrl,
                    expiresAt: result.expiresAt.toISOString(),
                }, ctx);
            case 'pending':
                return ok({
                    shipmentId,
                    status: 'pending' as const,
                    attempts: result.attempts,
                    lastError: result.lastError,
                }, ctx);
            case 'failed':
                return ok({
                    shipmentId,
                    status: 'failed' as const,
                    attempts: result.attempts,
                    lastError: result.lastError,
                }, ctx);
            case 'not_found':
                return err(buildError('not_found', 'Label not found for this shipment'), 404, ctx);
        }
    } catch (e) {
        log.error('label service threw', {
            requestId: ctx.requestId, partnerId, shipmentId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Failed to fetch label'), 500, ctx);
    }
}
