/**
 * POST /api/razorpay/verify-payment
 *
 * Body: {
 *   orderId: string,                    // our order ID
 *   razorpay_order_id: string,
 *   razorpay_payment_id: string,
 *   razorpay_signature: string,
 *   method?: string                     // surfaced from Checkout response
 * }
 *
 * Verifies the HMAC-SHA256 signature server-side, then marks the order paid.
 * The webhook (Phase 3) is the authoritative source — this endpoint exists
 * so the checkout UI can give immediate feedback and so we don't depend on
 * webhook latency. markOrderPaid is idempotent on payment.status === 'paid'.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebaseAdmin';
import {
    getOrderById,
    markOrderPaid,
    markOrderPaymentFailed,
} from '@/services/server/orderAdminService';

const Body = z.object({
    orderId: z.string().min(1),
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
    method: z.string().optional(),
});

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
        const {
            orderId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            method,
        } = parsed.data;

        const order = await getOrderById(orderId);
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (order.clientId !== uid) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (
            order.payment.providerOrderId &&
            order.payment.providerOrderId !== razorpay_order_id
        ) {
            return NextResponse.json(
                { error: 'razorpay_order_id mismatch' },
                { status: 400 }
            );
        }
        if (order.payment.status === 'paid') {
            return NextResponse.json({ ok: true, alreadyPaid: true });
        }

        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            return NextResponse.json(
                { error: 'Server missing RAZORPAY_KEY_SECRET' },
                { status: 500 }
            );
        }

        const expected = crypto
            .createHmac('sha256', secret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        const expectedBuf = Buffer.from(expected);
        const actualBuf = Buffer.from(razorpay_signature);
        const valid =
            expectedBuf.length === actualBuf.length &&
            crypto.timingSafeEqual(expectedBuf, actualBuf);

        if (!valid) {
            await markOrderPaymentFailed(orderId, 'Invalid Razorpay signature');
            console.warn(
                `[razorpay/verify-payment] signature mismatch order=${orderId} rzp=${razorpay_order_id}`
            );
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }

        await markOrderPaid(orderId, {
            providerPaymentId: razorpay_payment_id,
            method,
        });
        console.log(
            `[razorpay/verify-payment] paid order=${orderId} payment=${razorpay_payment_id}`
        );

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[razorpay/verify-payment] error:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Failed to verify payment' },
            { status: 500 }
        );
    }
}
