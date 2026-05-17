/**
 * POST /api/razorpay/create-order
 *
 * Body: { orderId: string }                        (our internal order ID)
 * Auth: Authorization: Bearer <Firebase ID token>  (must own the order)
 *
 * 1. Verifies the caller is the order's owner.
 * 2. Confirms the order is in a payable state (provider=razorpay, status≠paid).
 * 3. Creates a Razorpay order via the SDK (test mode if key starts rzp_test_).
 * 4. Persists providerOrderId on our order doc.
 * 5. Returns { key, razorpayOrderId, amount, currency } so the browser
 *    SDK can open Razorpay Checkout.
 *
 * The webhook (Phase 3) will be the authoritative source for "paid" status;
 * this endpoint is only the *intent* to charge.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebaseAdmin';
import { getOrderById, attachRazorpayOrder } from '@/services/server/orderAdminService';
import {
    getRazorpayClient,
    getRazorpayPublicKeyId,
    isRazorpayTestMode,
} from '@/services/server/razorpayClient';
import { withRetry } from '@/lib/retry';

const Body = z.object({ orderId: z.string().min(1) });

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization') || '';
        if (!authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        let uid: string;
        try {
            const decoded = await adminAuth.verifyIdToken(
                authHeader.slice('Bearer '.length)
            );
            uid = decoded.uid;
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const json = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid body', issues: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { orderId } = parsed.data;

        const order = await getOrderById(orderId);
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        if (order.clientId !== uid) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (order.payment.provider !== 'razorpay') {
            return NextResponse.json(
                { error: 'Order is not a Razorpay order' },
                { status: 400 }
            );
        }
        if (order.payment.status === 'paid') {
            return NextResponse.json({ error: 'Order is already paid' }, { status: 409 });
        }

        const rzp = getRazorpayClient();
        const rzpOrder = await withRetry(
            () =>
                rzp.orders.create({
                    amount: order.amounts.total,                    // PAISE
                    currency: order.payment.currency || 'INR',
                    receipt: orderId,
                    notes: { blujay_order_id: orderId, blujay_client_id: uid },
                }),
            {
                retries: 2,
                onRetry: (attempt, err) =>
                    console.warn(
                        `[razorpay/create-order] retry ${attempt}:`,
                        (err as any)?.error?.description || (err as any)?.message
                    ),
                // Don't retry on 4xx — those are auth/validation errors.
                shouldRetry: (err) => {
                    const code = (err as any)?.statusCode || (err as any)?.error?.statusCode;
                    return !code || code >= 500;
                },
            }
        );

        await attachRazorpayOrder(orderId, rzpOrder.id);
        console.log(
            `[razorpay/create-order] mode=${isRazorpayTestMode() ? 'TEST' : 'LIVE'} order=${orderId} rzp=${rzpOrder.id}`
        );

        return NextResponse.json({
            ok: true,
            key: getRazorpayPublicKeyId(),
            razorpayOrderId: rzpOrder.id,
            amount: rzpOrder.amount,
            currency: rzpOrder.currency,
            testMode: isRazorpayTestMode(),
        });
    } catch (err: any) {
        const description =
            err?.error?.description || err?.message || 'Failed to create Razorpay order';
        const status = err?.statusCode || err?.error?.statusCode || 500;
        console.error('[razorpay/create-order] error:', description);
        return NextResponse.json({ error: description }, { status });
    }
}
