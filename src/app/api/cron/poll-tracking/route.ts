/**
 * POST /api/cron/poll-tracking
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule: every 5 minutes.
 * Vercel cron entry:
 *   { "path": "/api/cron/poll-tracking", "schedule": "*\/5 * * * *" }
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
import { buildPollingWorker } from '@/services/b2b/infra';

const log = getLogger('api.cron.poll-tracking');

export async function POST(req: NextRequest) {
    const ctx = buildRequestContext(req);
    if (!verifyCronAuth(req)) {
        return err(buildError('authentication_failed', 'Invalid cron auth'), 401, ctx);
    }
    try {
        const worker = buildPollingWorker(getFirestore(adminApp));
        const summary = await worker.runOnce({ batchSize: 200, concurrency: 10 });
        log.info('poll-tracking complete', { requestId: ctx.requestId, ...summary });
        return ok({ summary }, ctx);
    } catch (e) {
        log.error('poll-tracking failed', {
            requestId: ctx.requestId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Polling worker failed'), 500, ctx);
    }
}

// Vercel cron sends GET by default; alias to POST for parity. Both shapes
// use the same body-less invocation pattern.
export const GET = POST;
