/**
 * POST /api/orders/[id]/cancel-direct
 *
 * Cancel a shipment that was booked via /api/orders/[id]/book-direct.
 * Dispatches to the carrier's existing /api/<carrier>/cancel-shipment route.
 *
 * Auth: Bearer (must own the order).
 * Idempotent: returns success if the order is already cancelled.
 */
// Re-imported from directCarrierOps — picks up cancelOrderDirect export.
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/serverAuth';
import {
    getOrderById,
    tryAcquireFulfillmentLock,
    releaseFulfillmentLock,
} from '@/services/server/orderAdminService';
import {
    cancelOrderDirect,
    DirectCarrierError,
} from '@/services/server/directCarrierOps';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateRequest(request);
        if (auth instanceof NextResponse) return auth;

        const { id } = await params;
        const order = await getOrderById(id);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        if (order.clientId !== auth.clientId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Same lock as book-direct so we don't race a re-book vs cancel.
        const lock = await tryAcquireFulfillmentLock(id);
        if (!lock.acquired) {
            return NextResponse.json(
                { error: lock.reason || 'Operation already in progress' },
                { status: 409 }
            );
        }

        try {
            const result = await cancelOrderDirect(order);
            console.log(
                `[orders/cancel-direct] order=${id} provider=${result.provider} awb=${result.awb} cancelled`
            );
            return NextResponse.json(result);
        } finally {
            await releaseFulfillmentLock(id).catch(() => {});
        }
    } catch (err: any) {
        if (err instanceof DirectCarrierError) {
            console.error(
                '[orders/cancel-direct] carrier error:',
                err.message,
                err.details ?? ''
            );
            return NextResponse.json(
                { error: err.message, ...(err.details ? { details: err.details } : {}) },
                { status: err.status }
            );
        }
        console.error('[orders/cancel-direct] unexpected:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Cancellation failed' },
            { status: 500 }
        );
    }
}
