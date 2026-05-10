/**
 * GET /api/cron/retry-fulfillment
 *
 * Vercel cron handler — re-runs fulfillOrder() for orders where
 * automation.nextRetryAt <= now. Idempotency in shiprocketOps + the
 * fulfilment lock in the orchestrator make this safe to call any time.
 *
 * Authenticated by `Authorization: Bearer ${CRON_SECRET}`. Vercel injects
 * this header automatically when invoking scheduled cron paths.
 *
 * Schedule: configured in vercel.json — every 15 minutes on Pro plans
 * (Hobby plans are restricted to daily, in which case manual retry via
 * /api/orders/fulfill or upgrading to Pro is the path).
 *
 * Batch size: 50 orders per tick. Sequential processing — Shiprocket
 * has no documented bulk API and we don't want to thunder them. A 50-
 * order batch typically completes in under 2 minutes (well under
 * Vercel's 5-min cron timeout on Pro).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { fulfillOrder } from '@/services/server/orchestratorService';

const BATCH_SIZE = 50;

function isAuthorizedCron(request: NextRequest): boolean {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        // Misconfiguration — fail closed.
        console.error('[cron/retry-fulfillment] CRON_SECRET is not set');
        return false;
    }
    const auth = request.headers.get('authorization') || '';
    return auth === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const db = getFirestore(adminApp);
    const now = Timestamp.now();

    let due;
    try {
        due = await db
            .collection('orders')
            .where('automation.nextRetryAt', '<=', now)
            .orderBy('automation.nextRetryAt', 'asc')
            .limit(BATCH_SIZE)
            .get();
    } catch (err: any) {
        console.error(
            '[cron/retry-fulfillment] query failed:',
            err?.message || err
        );
        return NextResponse.json(
            { error: err?.message || 'Query failed' },
            { status: 500 }
        );
    }

    if (due.empty) {
        return NextResponse.json({
            ok: true,
            processed: 0,
            tookMs: Date.now() - startedAt,
        });
    }

    const results: Array<{
        orderId: string;
        ok: boolean;
        failedAt?: string;
        retryScheduledAt?: number;
        error?: string;
    }> = [];

    // Sequential — orchestrator's lock would reject parallel attempts on the
    // same order anyway, and Shiprocket doesn't love bursts. With 50 orders
    // at ~5s each, this completes in ~4 min worst case.
    for (const doc of due.docs) {
        const orderId = doc.id;
        try {
            const r = await fulfillOrder(orderId);
            results.push({
                orderId,
                ok: r.ok,
                failedAt: r.failedAt,
                retryScheduledAt: r.retryScheduledAt,
                error: r.ok ? undefined : r.error,
            });
        } catch (err: any) {
            console.error(
                `[cron/retry-fulfillment] order=${orderId} crashed:`,
                err?.message || err
            );
            results.push({
                orderId,
                ok: false,
                error: err?.message || String(err),
            });
        }
    }

    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    console.log(
        `[cron/retry-fulfillment] processed ${results.length} (ok=${ok} failed=${failed}) in ${Date.now() - startedAt}ms`
    );

    return NextResponse.json({
        ok: true,
        processed: results.length,
        succeeded: ok,
        failed,
        tookMs: Date.now() - startedAt,
        results,
    });
}
