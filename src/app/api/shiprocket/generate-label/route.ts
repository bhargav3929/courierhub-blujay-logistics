/**
 * POST /api/shiprocket/generate-label
 *
 * Body: { orderId: string }
 * Auth: Bearer
 *
 * Thin wrapper around ensureLabel() in shiprocketOps.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import { getOrderById } from '@/services/server/orderAdminService';
import {
    ensureLabel,
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

        const result = await ensureLabel(order);
        console.log(
            `[shiprocket/generate-label] order=${order.id} label=${result.labelUrl}${result.cached ? ' (cached)' : ''}`
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
            '[shiprocket/generate-label] error:',
            err?.message,
            err?.body || ''
        );
        return NextResponse.json(
            { error: err?.message || 'Failed to generate label' },
            { status: err?.status || 500 }
        );
    }
}
