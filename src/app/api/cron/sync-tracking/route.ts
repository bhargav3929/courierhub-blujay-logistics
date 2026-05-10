/**
 * GET /api/cron/sync-tracking
 *
 * Vercel cron — pulls Shiprocket tracking for orders that should be
 * actively shipping but haven't received a webhook update in a while.
 * Pure fallback. The Shiprocket webhook is the primary source.
 *
 * Schedule: every 4h on Pro plans (vercel.json).
 *
 * Selection:
 *   - automation.stage IN ('shipment_created', 'in_transit')
 *   - shipment.awb is set
 *   - shipment.lastSyncedAt is missing OR > MAX_AGE_MS old
 *
 * Auth: Bearer CRON_SECRET (Vercel injects automatically).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import {
    attachShipmentRef,
    setAutomationStage,
} from '@/services/server/orderAdminService';
import { shiprocketRequest } from '@/services/server/shiprocketClient';
import type { OrderAutomationStage } from '@/types/order';

const BATCH_SIZE = 50;
const MAX_AGE_MS = 4 * 60 * 60 * 1000;     // 4 hours since last sync

function mapStatusToStage(code: number | undefined): OrderAutomationStage | null {
    if (code === undefined || code === null) return null;
    if (code === 7) return 'delivered';
    if ([6, 17, 18, 19].includes(code)) return 'in_transit';
    if ([8, 9, 10].includes(code)) return 'failed';
    return null;
}

interface TrackResponse {
    tracking_data?: {
        shipment_status?: number;
        shipment_track?: Array<{
            current_status?: string;
            current_status_id?: number;
            edd?: string;
        }>;
        track_url?: string;
    };
}

function isAuthorizedCron(request: NextRequest): boolean {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        console.error('[cron/sync-tracking] CRON_SECRET is not set');
        return false;
    }
    return (
        (request.headers.get('authorization') || '') === `Bearer ${expected}`
    );
}

export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startedAt = Date.now();
    const db = getFirestore(adminApp);

    // Single Firestore query (auto-indexed on automation.stage). We filter
    // by lastSyncedAt freshness in-memory since Firestore can't filter on
    // a field that may be missing without a composite index.
    let candidates;
    try {
        candidates = await db
            .collection('orders')
            .where('automation.stage', 'in', ['shipment_created', 'in_transit'])
            .limit(BATCH_SIZE * 2)
            .get();
    } catch (err: any) {
        console.error(
            '[cron/sync-tracking] query failed:',
            err?.message || err
        );
        return NextResponse.json(
            { error: err?.message || 'Query failed' },
            { status: 500 }
        );
    }

    const cutoffMs = Date.now() - MAX_AGE_MS;
    const stale = candidates.docs
        .filter((d) => {
            const data = d.data() as any;
            if (!data?.shipment?.awb) return false;
            const lastSynced = data?.shipment?.lastSyncedAt;
            if (!lastSynced || typeof lastSynced.toMillis !== 'function') {
                return true;
            }
            return lastSynced.toMillis() < cutoffMs;
        })
        .slice(0, BATCH_SIZE);

    if (stale.length === 0) {
        return NextResponse.json({
            ok: true,
            checked: candidates.size,
            synced: 0,
            tookMs: Date.now() - startedAt,
        });
    }

    const results: Array<{
        orderId: string;
        awb: string;
        ok: boolean;
        statusCode?: number;
        error?: string;
    }> = [];

    for (const doc of stale) {
        const orderId = doc.id;
        const data = doc.data() as any;
        const awb = data.shipment.awb as string;
        try {
            const res = await shiprocketRequest<TrackResponse>({
                method: 'GET',
                path: `/courier/track/awb/${encodeURIComponent(awb)}`,
            });
            const head = res?.tracking_data?.shipment_track?.[0];
            const statusText = head?.current_status;
            const statusCode =
                head?.current_status_id ?? res?.tracking_data?.shipment_status;
            const trackUrl = res?.tracking_data?.track_url;

            await attachShipmentRef(orderId, {
                ...(statusText ? { status: statusText } : {}),
                ...(statusCode !== undefined ? { statusCode } : {}),
                ...(trackUrl ? { trackingUrl: trackUrl } : {}),
                lastSyncedAt: Timestamp.now() as any,
            });

            const nextStage = mapStatusToStage(statusCode);
            const currentStage = data?.automation?.stage as OrderAutomationStage;
            if (
                nextStage &&
                currentStage !== nextStage &&
                currentStage !== 'cancelled'
            ) {
                await setAutomationStage(orderId, nextStage, {
                    note: `cron sync: ${statusText ?? `status-${statusCode}`}`,
                });
            }

            results.push({ orderId, awb, ok: true, statusCode });
        } catch (err: any) {
            // Non-fatal — log and continue. Shiprocket transient blips are
            // common; the next cron tick will pick this order up again
            // because lastSyncedAt didn't advance.
            console.warn(
                `[cron/sync-tracking] order=${orderId} awb=${awb} failed: ${err?.message || err}`
            );
            results.push({
                orderId,
                awb,
                ok: false,
                error: err?.message || String(err),
            });
        }
    }

    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    console.log(
        `[cron/sync-tracking] checked ${candidates.size} synced ${results.length} (ok=${ok} failed=${failed}) in ${Date.now() - startedAt}ms`
    );

    return NextResponse.json({
        ok: true,
        checked: candidates.size,
        synced: results.length,
        succeeded: ok,
        failed,
        tookMs: Date.now() - startedAt,
        results,
    });
}
