/**
 * POST /api/v1/b2b/shipments/:id/cancel
 *
 * Cancels a shipment. Pre-pickup transitions immediately; post-pickup is
 * rejected (partner should initiate RTO via a separate endpoint).
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminApp } from '@/lib/firebaseAdmin';
import { authenticateB2BRequest } from '@/lib/b2bAuth';
import {
    buildError,
    buildRequestContext,
    err,
    getLogger,
    ok,
    zodErrorToApiError,
} from '@/services/b2b/http';
import { buildCancellationService } from '@/services/b2b/infra';
import { ShipmentId } from '@/types/b2b/ids';
import { ALL_CANCELLATION_REASONS } from '@/types/b2b/reasons';

const log = getLogger('api.v1.b2b.shipments.cancel');

const Body = z.object({
    reason: z.enum(ALL_CANCELLATION_REASONS),
});

export async function POST(
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

    let json: unknown;
    try { json = await req.json(); }
    catch { return err(buildError('invalid_request', 'Body must be valid JSON'), 400, ctx); }

    const parsed = Body.safeParse(json);
    if (!parsed.success) return err(zodErrorToApiError(parsed.error), 422, ctx);

    try {
        const service = buildCancellationService(getFirestore(adminApp));
        const result = await service.cancel({
            partnerId,
            shipmentId,
            reason: parsed.data.reason,
        });

        log.info('cancel result', {
            requestId: ctx.requestId, partnerId, shipmentId,
            outcome: result.kind,
        });

        switch (result.kind) {
            case 'cancelled':
                return ok({ shipmentId: result.shipmentId, status: 'cancelled' }, ctx);
            case 'not_found':
                return err(buildError('not_found', 'Shipment not found'), 404, ctx);
            case 'not_cancellable':
                return err(
                    buildError(
                        'state_transition_forbidden',
                        result.reason === 'post_pickup'
                            ? `Shipment is past pickup (status=${result.currentStatus}); use the RTO endpoint instead`
                            : `Shipment is in terminal status '${result.currentStatus}'`,
                    ),
                    409, ctx,
                );
            case 'carrier_rejected':
                return err(
                    buildError('courier_rejected', `Carrier refused cancel`, { detail: result.detail }),
                    422, ctx,
                );
            case 'transient_failure':
                return err(
                    buildError('courier_unavailable', `Carrier cancel failed transiently — retry later`, { detail: result.detail }),
                    503, ctx,
                );
            case 'projection_failed':
                return err(
                    buildError('internal_error', `Could not record cancellation`, { detail: result.detail }),
                    500, ctx,
                );
        }
    } catch (e) {
        log.error('cancel service threw', {
            requestId: ctx.requestId, partnerId, shipmentId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Cancellation failed unexpectedly'), 500, ctx);
    }
}
