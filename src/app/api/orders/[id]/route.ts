/**
 * GET /api/orders/[id]
 *
 * Returns the order if the caller (Bearer token) is its owner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/serverAuth';
import { getOrderById } from '@/services/server/orderAdminService';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await authenticateRequest(request);
        if (auth instanceof NextResponse) return auth;
        const uid = auth.clientId;

        const { id } = await params;
        const order = await getOrderById(id);
        if (!order) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        if (order.clientId !== uid) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json({ ok: true, order });
    } catch (err: any) {
        console.error('[orders/get] error:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Failed to fetch order' },
            { status: 500 }
        );
    }
}
