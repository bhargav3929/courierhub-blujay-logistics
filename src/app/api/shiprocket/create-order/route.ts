/**
 * POST /api/shiprocket/create-order
 *
 * Body: { orderId: string }
 * Auth: Authorization: Bearer <Firebase ID token> (must own the order)
 *
 * Thin wrapper around ensureShiprocketOrder() in shiprocketOps.ts.
 * The same op is reused by the orchestrator (Phase 5) and the Razorpay
 * webhook (Phase 6) without HTTP overhead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import { getOrderById } from '@/services/server/orderAdminService';
import {
    ensureShiprocketOrder,
    ShiprocketOpError,
} from '@/services/server/shiprocketOps';

const Body = z.object({ orderId: z.string().min(1) });

export async function POST(request: NextRequest) {
    try {
        const auth = await authenticateRequest(request);
        if (auth instanceof NextResponse) return auth;

        const json = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid body', issues: parsed.error.flatten() },
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

        const result = await ensureShiprocketOrder(order);
        console.log(
            `[shiprocket/create-order] order=${order.id} rsp_order=${result.shiprocketOrderId} shipment=${result.shipmentId}${result.alreadyCreated ? ' (cached)' : ''}`
        );
        return NextResponse.json({ ok: true, ...result });
    } catch (err: any) {
        if (err instanceof ShiprocketOpError) {
            return NextResponse.json(
                { error: err.message, ...(err.details ? { details: err.details } : {}) },
                { status: err.status }
            );
        }
        console.error(
            '[shiprocket/create-order] error:',
            err?.message,
            err?.body || ''
        );
        return NextResponse.json(
            { error: err?.message || 'Failed to create Shiprocket order' },
            { status: err?.status || 500 }
        );
    }
}
