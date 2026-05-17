/**
 * POST /api/orders/fulfill
 *
 * Body: { orderId: string, courierId?: number }
 * Auth: Authorization: Bearer <Firebase ID token> (must own the order)
 *
 * Manually trigger the fulfilment orchestrator on an order. Runs:
 *     create-order → assign-awb (auto-pick courier) → generate-label
 * Each step is idempotent so this is safe to call multiple times — it
 * will resume from wherever the previous attempt stopped.
 *
 * Response:
 *   200 { ok: true, completedSteps, shipment }                  on full success
 *   200 { ok: false, failedAt, error, retryScheduledAt? }       on partial /
 *                                                                failure (so the
 *                                                                browser can show
 *                                                                what happened
 *                                                                without treating
 *                                                                a transient blip
 *                                                                as a 5xx)
 *
 * Phase 6 will also call fulfillOrder() directly from the Razorpay webhook,
 * making the entire payment-to-shipment flow fully automated.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import { getOrderById } from '@/services/server/orderAdminService';
import { fulfillOrder } from '@/services/server/orchestratorService';

const Body = z.object({
    orderId: z.string().min(1),
    courierId: z.number().int().positive().optional(),
});

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

        // Ownership check before delegating to the orchestrator.
        const order = await getOrderById(parsed.data.orderId);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        if (order.clientId !== auth.clientId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const result = await fulfillOrder(parsed.data.orderId, {
            courierId: parsed.data.courierId,
        });

        // Always 200 — the fulfilment-result envelope carries success/failure.
        // This lets the UI distinguish "transient failure, retry queued" from
        // "permanent failure, fix the input" without treating retries as 5xx.
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[orders/fulfill] unexpected:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Fulfilment failed' },
            { status: 500 }
        );
    }
}
