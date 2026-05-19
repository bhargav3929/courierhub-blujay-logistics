/**
 * POST /api/cron/reconcile-bookings
 *
 * Schedule: every 15 minutes.
 * Recovers indeterminate carrier bookings via lookupByReference + cancel.
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { verifyCronAuth } from '@/lib/cronAuth';
import {
    buildError,
    buildRequestContext,
    err,
    getLogger,
    ok,
} from '@/services/b2b/http';
import { buildBookingReconciler } from '@/services/b2b/infra';

const log = getLogger('api.cron.reconcile-bookings');

export async function POST(req: NextRequest) {
    const ctx = buildRequestContext(req);
    if (!verifyCronAuth(req)) {
        return err(buildError('authentication_failed', 'Invalid cron auth'), 401, ctx);
    }
    try {
        const worker = buildBookingReconciler(getFirestore(adminApp));
        const summary = await worker.runOnce({ batchSize: 50, concurrency: 5 });
        log.info('reconcile-bookings complete', { requestId: ctx.requestId, ...summary });
        return ok({ summary }, ctx);
    } catch (e) {
        log.error('reconcile-bookings failed', {
            requestId: ctx.requestId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Reconciler failed'), 500, ctx);
    }
}

export const GET = POST;
