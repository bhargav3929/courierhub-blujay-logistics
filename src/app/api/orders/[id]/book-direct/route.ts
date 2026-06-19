/**
 * POST /api/orders/[id]/book-direct
 *
 * Book a paid order via one of your existing direct carrier integrations
 * (BlueDart / Delhivery / DTDC). The Ship Links page hits this when the
 * admin clicks "Confirm & Book" with a carrier selected.
 *
 * Body: {
 *   carrier: 'bluedart' | 'delhivery' | 'dtdc',
 *   blueDartServiceType?: 'PRIORITY' | 'APEX' | 'BHARAT_DART' | 'SURFACE',
 *   blueDartPackType?: 'N' | 'T' | 'C',
 *   delhiveryServiceType?: 'Express' | 'Surface',
 *   dtdcServiceTypeId?: string,
 * }
 *
 * Auth: Bearer (must own the order).
 *
 * Returns:
 *   200 { ok: true, awb, courierName, provider }
 *   409 if order isn't paid yet (or already booked — short-circuit success)
 *   502 if carrier API rejected the booking
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import {
    getOrderById,
    tryAcquireFulfillmentLock,
    releaseFulfillmentLock,
} from '@/services/server/orderAdminService';
import {
    bookOrderDirect,
    DirectCarrierError,
} from '@/services/server/directCarrierOps';

const Body = z.object({
    carrier: z.enum(['bluedart', 'delhivery', 'dtdc']),
    blueDartServiceType: z
        .enum(['PRIORITY', 'APEX', 'BHARAT_DART', 'SURFACE'])
        .optional(),
    blueDartPackType: z.enum(['N', 'T', 'C']).optional(),
    delhiveryServiceType: z.enum(['Express', 'Surface']).optional(),
    dtdcServiceTypeId: z.string().optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateRequest(request);
        if (auth instanceof NextResponse) return auth;

        const { id } = await params;
        const json = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid body', issues: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const order = await getOrderById(id);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        if (order.clientId !== auth.clientId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Use the same fulfillment lock as the orchestrator so concurrent
        // bookings on the same order can't fire two carrier calls.
        const lock = await tryAcquireFulfillmentLock(id);
        if (!lock.acquired) {
            return NextResponse.json(
                { error: lock.reason || 'Booking already in progress' },
                { status: 409 }
            );
        }

        try {
            const result = await bookOrderDirect(order, parsed.data);
            console.log(
                `[orders/book-direct] order=${id} carrier=${parsed.data.carrier} awb=${result.awb}`
            );
            return NextResponse.json(result);
        } finally {
            await releaseFulfillmentLock(id).catch(() => {});
        }
    } catch (err: any) {
        if (err instanceof DirectCarrierError) {
            console.error(
                '[orders/book-direct] carrier error:',
                err.message,
                err.details ?? ''
            );
            return NextResponse.json(
                { error: err.message, ...(err.details ? { details: err.details } : {}) },
                { status: err.status }
            );
        }
        console.error('[orders/book-direct] unexpected:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Booking failed' },
            { status: 500 }
        );
    }
}
