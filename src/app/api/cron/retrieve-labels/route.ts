/**
 * POST /api/cron/retrieve-labels
 *
 * Schedule: every 10 minutes.
 * Retries pending labels for courier-fulfilled shipments. Self-shipment
 * labels are generated synchronously during booking and are not handled here.
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
import { buildLabelRetrievalJob } from '@/services/b2b/infra';

const log = getLogger('api.cron.retrieve-labels');

export async function POST(req: NextRequest) {
    const ctx = buildRequestContext(req);
    if (!verifyCronAuth(req)) {
        return err(buildError('authentication_failed', 'Invalid cron auth'), 401, ctx);
    }
    try {
        const job = buildLabelRetrievalJob(getFirestore(adminApp));
        const summary = await job.runOnce({ batchSize: 100, concurrency: 5 });
        log.info('retrieve-labels complete', { requestId: ctx.requestId, ...summary });
        return ok({ summary }, ctx);
    } catch (e) {
        log.error('retrieve-labels failed', {
            requestId: ctx.requestId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Label retrieval job failed'), 500, ctx);
    }
}

export const GET = POST;
