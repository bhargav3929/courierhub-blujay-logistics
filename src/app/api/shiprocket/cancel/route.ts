/**
 * POST /api/shiprocket/cancel
 *
 * Body: { orderId: string }
 * Auth: Bearer (must own the order)
 *
 * Cancels the Shiprocket order. Two endpoints exist on Shiprocket:
 *   - POST /orders/cancel              (cancel the order before AWB)
 *   - POST /orders/cancel/shipment/awbs (cancel after AWB assignment)
 * We dispatch based on whether the order has an AWB.
 *
 * Updates automation.stage to 'cancelled' on success.
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
        if (order.automation.stage === 'cancelled') {
            return NextResponse.json({
                ok: true,
                alreadyCancelled: true,
            });
        }
        if (!order.shipment?.providerOrderId && !order.shipment?.awb) {
            return NextResponse.json(
                { error: 'Order has nothing to cancel on Shiprocket (not yet pushed)' },
                { status: 409 }
            );
        }

        // Pre-AWB → cancel by Shiprocket order id; post-AWB → cancel shipment AWBs.
        if (order.shipment.awb) {
            await shiprocketRequest({
                method: 'POST',
                path: '/orders/cancel/shipment/awbs',
                body: { awbs: [order.shipment.awb] },
            });
        } else {
            await shiprocketRequest({
                method: 'POST',
                path: '/orders/cancel',
                body: { ids: [Number(order.shipment.providerOrderId)] },
            });
        }

        await attachShipmentRef(order.id, {
            cancelledAt: Timestamp.now() as any,
            status: 'cancelled',
        });
        await setAutomationStage(order.id, 'cancelled', {
            note: 'cancelled via /api/shiprocket/cancel',
        });

        console.log(`[shiprocket/cancel] order=${order.id} cancelled`);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error(
            '[shiprocket/cancel] error:',
            err?.message,
            err?.body || ''
        );
        return NextResponse.json(
            { error: err?.message || 'Failed to cancel' },
            { status: err?.status || 500 }
        );
    }
}
