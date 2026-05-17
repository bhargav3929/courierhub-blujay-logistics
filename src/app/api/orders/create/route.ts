/**
 * POST /api/orders/create
 *
 * Body: CreateOrderInput (validated below with zod)
 * Auth: Authorization: Bearer <Firebase ID token>
 *
 * Creates an order owned by the authenticated client (uid → clientId).
 * Idempotent on (clientId, externalOrderId) — repeat calls with the same
 * externalOrderId return the original order.
 *
 * All monetary values are in PAISE (smallest unit). 100 paise = ₹1.
 *
 * Phase 1 scope: this endpoint requires Bearer auth, so today it's invoked
 * either from the Blujay client portal directly or from a server-to-server
 * caller that already has a Firebase ID token. A public-API-key path for
 * external storefronts is a separate, later phase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import { createOrder } from '@/services/server/orderAdminService';

const Address = z.object({
    name: z.string().min(1),
    phone: z.string().min(7).max(20),
    email: z.string().email().optional(),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    country: z.string().min(1),
});

const Item = z.object({
    sku: z.string().optional(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.number().int().nonnegative(),  // paise
    weight: z.number().positive().optional(),   // grams
    hsn: z.string().optional(),
});

const Body = z.object({
    externalOrderId: z.string().min(1).optional(),
    customer: z.object({
        name: z.string().min(1),
        phone: z.string().min(7).max(20),
        email: z.string().email().optional(),
    }),
    shippingAddress: Address,
    billingAddress: Address.optional(),
    items: z.array(Item).min(1),
    amounts: z.object({
        subtotal: z.number().int().nonnegative(),
        shipping: z.number().int().nonnegative().optional(),
        tax: z.number().int().nonnegative().optional(),
        discount: z.number().int().nonnegative().optional(),
        total: z.number().int().positive(),
        codCollect: z.number().int().nonnegative().optional(),
    }),
    payment: z.object({
        provider: z.enum(['razorpay', 'cod']),
        currency: z.string().length(3).optional(),
    }),
    metadata: z.record(z.string(), z.string()).optional(),
    notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
    try {
        const auth = await authenticateRequest(request);
        if (auth instanceof NextResponse) return auth;
        const uid = auth.clientId;

        const json = await request.json().catch(() => ({}));
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid body', issues: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { id, order } = await createOrder(uid, parsed.data);
        console.log(`[orders/create] order ${id} created for client ${uid}`);
        return NextResponse.json({ ok: true, orderId: id, order });
    } catch (err: any) {
        console.error('[orders/create] error:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Failed to create order' },
            { status: 500 }
        );
    }
}
