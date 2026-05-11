/**
 * GET /api/shiprocket/track?orderId=...
 *
 * Auth: Bearer (must own the order)
 *
 * Pulls live tracking from Shiprocket using the order's stored AWB,
 * updates `shipment.status`, `shipment.statusCode`, `shipment.lastSyncedAt`
 * on our order doc, and returns the full tracking timeline.
 *
 * Phase 4 is on-demand polling. Phase 7 will add a Shiprocket webhook +
 * a Vercel cron fallback so this isn't the only sync path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/serverAuth';
import {
    getOrderById,
    attachShipmentRef,
    setAutomationStage,
} from '@/services/server/orderAdminService';
import { shiprocketRequest } from '@/services/server/shiprocketClient';
import type { OrderAutomationStage } from '@/types/order';

const Query = z.object({ orderId: z.string().min(1) });

interface ShipmentTrackEntry {
    activity?: string;
    location?: string;
    date?: string;
    status?: string;
    sr_status?: string;
}

interface TrackResponse {
    tracking_data?: {
        track_status?: number;
        shipment_status?: number;
        shipment_track?: Array<{
            current_status?: string;
            current_status_id?: number;
            awb_code?: string;
            edd?: string;
        }>;
        shipment_track_activities?: ShipmentTrackEntry[];
        track_url?: string;
    };
}

// Map Shiprocket status codes to our automation stages.
// Reference (Shiprocket public docs):
//   6  In Transit
//   7  Delivered
//   8  RTO Initiated
//   17 Out for Delivery
//   ...
function mapStatusToStage(code?: number): OrderAutomationStage | null {
    if (code === undefined || code === null) return null;
    if (code === 7) return 'delivered';
    // 6 = in_transit, 17 = out_for_delivery, 18 = ofd, etc — collapse to in_transit.
    if ([6, 17, 18, 19].includes(code)) return 'in_transit';
    if ([8, 9, 10].includes(code)) return 'failed';
    return null;
}

export async function GET(request: NextRequest) {
    try {
        const auth = await authenticateRequest(request);
        if (auth instanceof NextResponse) return auth;

        const url = new URL(request.url);
        const parsed = Query.safeParse({ orderId: url.searchParams.get('orderId') });
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'orderId query param required' },
                { status: 400 }
            );
        }

        const order = await getOrderById(parsed.data.orderId);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        if (order.clientId !== auth.clientId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (!order.shipment?.awb) {
            return NextResponse.json(
                { error: 'Order has no AWB to track' },
                { status: 409 }
            );
        }

        const res = await shiprocketRequest<TrackResponse>({
            method: 'GET',
            path: `/courier/track/awb/${encodeURIComponent(order.shipment.awb)}`,
        });

        const data = res?.tracking_data;
        const head = data?.shipment_track?.[0];
        const statusText = head?.current_status;
        const statusCode = head?.current_status_id ?? data?.shipment_status;

        await attachShipmentRef(order.id, {
            ...(statusText ? { status: statusText } : {}),
            ...(statusCode !== undefined ? { statusCode } : {}),
            ...(data?.track_url ? { trackingUrl: data.track_url } : {}),
            lastSyncedAt: Timestamp.now() as any,
        });

        const nextStage = mapStatusToStage(statusCode);
        if (
            nextStage &&
            order.automation.stage !== nextStage &&
            order.automation.stage !== 'cancelled'
        ) {
            await setAutomationStage(order.id, nextStage, {
                note: `tracking sync: ${statusText ?? 'status-' + statusCode}`,
            });
        }

        return NextResponse.json({
            ok: true,
            awb: order.shipment.awb,
            status: statusText,
            statusCode,
            trackUrl: data?.track_url,
            edd: head?.edd,
            activities: data?.shipment_track_activities ?? [],
        });
    } catch (err: any) {
        console.error(
            '[shiprocket/track] error:',
            err?.message,
            err?.body || ''
        );
        return NextResponse.json(
            { error: err?.message || 'Failed to fetch tracking' },
            { status: err?.status || 500 }
        );
    }
}
