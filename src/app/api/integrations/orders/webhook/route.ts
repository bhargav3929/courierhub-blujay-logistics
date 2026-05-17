/**
 * POST /api/integrations/orders/webhook
 *
 * Merchant order-intake webhook. Mirrors the Shopify pattern but is
 * provider-agnostic: any merchant's backend can POST a paid order here
 * after their customer pays on their own site.
 *
 * Auth:
 *   Header `X-Blujay-Api-Key: bj_<32hex>`
 *   The key is hashed (SHA-256) and looked up in `clientApiKeys`.
 *   On success, the resolved clientId becomes the shipment owner.
 *
 * Body (JSON):
 *   {
 *     "external_order_id":   string,            // merchant's own order id (idempotency key)
 *     "customer": { "name": string, "phone": string, "email"?: string },
 *     "shipping_address": {
 *        "name": string, "phone": string, "email"?: string,
 *        "line1": string, "line2"?: string,
 *        "city": string, "state": string, "pincode": string, "country": string
 *     },
 *     "items": [ { "name": string, "sku"?: string, "quantity": number,
 *                  "unit_price": number,           // in paise (smallest unit)
 *                  "weight_g"?: number,            // grams
 *                  "hsn"?: string } ],
 *     "amounts": {
 *        "subtotal": number,                       // paise
 *        "shipping"?: number, "tax"?: number, "discount"?: number,
 *        "total": number,
 *        "cod_collect"?: number                    // paise (only when payment_method='cod')
 *     },
 *     "payment_method": "prepaid" | "cod",
 *     "notes"?: string
 *   }
 *
 * Behaviour:
 *   - Idempotency: a second call with the same external_order_id for the
 *     same client returns the existing shipment id (no duplicate writes).
 *   - The shipment is created with `status: 'webhook_pending'` and
 *     `courier: 'Pending — pick on Shipments page'`. An admin picks the
 *     carrier later from /client-shipments + the existing Book flow.
 *   - origin/pickup is filled from the client's defaultPickupAddress
 *     (Settings → Pickup Address). If not set, the shipment is still
 *     created but origin fields are empty — the booking flow will surface
 *     a friendlier error than silently failing.
 *
 * Response policy:
 *   - 200 { ok: true, shipmentId, idempotent? }
 *   - 400 invalid body / missing fields
 *   - 401 missing or invalid api key
 *   - 500 internal error
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    getFirestore,
    Timestamp,
} from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { lookupApiKey } from '@/services/server/apiKeyService';

export const dynamic = 'force-dynamic';

const PAISE_TO_RUPEES = (p: number) => +(p / 100).toFixed(2);

const Address = z.object({
    name: z.string().min(1),
    phone: z.string().min(7).max(20),
    email: z.string().email().optional(),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    pincode: z.string().regex(/^\d{6}$/, 'pincode must be 6 digits'),
    country: z.string().min(1),
});

const Item = z.object({
    name: z.string().min(1),
    sku: z.string().optional(),
    quantity: z.number().int().positive(),
    unit_price: z.number().int().nonnegative(),
    weight_g: z.number().positive().optional(),
    hsn: z.string().optional(),
});

const Body = z.object({
    external_order_id: z.string().min(1),
    customer: z.object({
        name: z.string().min(1),
        phone: z.string().min(7).max(20),
        email: z.string().email().optional(),
    }),
    shipping_address: Address,
    items: z.array(Item).min(1),
    amounts: z.object({
        subtotal: z.number().int().nonnegative(),
        shipping: z.number().int().nonnegative().optional(),
        tax: z.number().int().nonnegative().optional(),
        discount: z.number().int().nonnegative().optional(),
        total: z.number().int().positive(),
        cod_collect: z.number().int().nonnegative().optional(),
    }),
    payment_method: z.enum(['prepaid', 'cod']),
    notes: z.string().optional(),
});

// Short request id for correlating log lines across a single webhook call.
function reqId(): string {
    return Math.random().toString(36).slice(2, 10);
}

// Show the visible prefix of an api key without leaking the rest.
function keyHint(raw: string | null | undefined): string {
    if (!raw) return '(none)';
    return raw.slice(0, 11) + '…';
}

export async function POST(request: NextRequest) {
    const rid = reqId();
    const start = Date.now();
    try {
        // 1. Auth: API key only (Bearer not supported on this public webhook).
        const rawKey =
            request.headers.get('x-blujay-api-key') ||
            request.headers.get('X-Blujay-Api-Key');
        const fwdIp =
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            '(unknown)';
        console.log(
            `[orders/webhook] rid=${rid} 📨 incoming ip=${fwdIp} key=${keyHint(rawKey)}`
        );

        if (!rawKey) {
            console.warn(`[orders/webhook] rid=${rid} ❌ 401 missing X-Blujay-Api-Key header`);
            return NextResponse.json(
                { error: 'Missing X-Blujay-Api-Key header' },
                { status: 401 }
            );
        }
        const keyHit = await lookupApiKey(rawKey);
        if (!keyHit) {
            console.warn(
                `[orders/webhook] rid=${rid} ❌ 401 invalid/revoked key prefix=${keyHint(rawKey)}`
            );
            return NextResponse.json(
                { error: 'Invalid or revoked API key' },
                { status: 401 }
            );
        }
        const clientId = keyHit.clientId;
        console.log(
            `[orders/webhook] rid=${rid} ✅ auth ok clientId=${clientId} keyId=${keyHit.keyId}`
        );

        // 2. Validate body.
        const json = await request.json().catch(() => null);
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
            const flat = parsed.error.flatten();
            console.warn(
                `[orders/webhook] rid=${rid} ❌ 400 validation failed fieldErrors=${JSON.stringify(
                    flat.fieldErrors
                )}`
            );
            return NextResponse.json(
                { error: 'Invalid body', issues: flat },
                { status: 400 }
            );
        }
        const payload = parsed.data;
        console.log(
            `[orders/webhook] rid=${rid} 📦 payload ok external=${payload.external_order_id} items=${payload.items.length} total=${payload.amounts.total} method=${payload.payment_method}`
        );
        const db = getFirestore(adminApp);

        // 3. Idempotency — same external_order_id under same client returns
        //    the original shipment.
        const dup = await db
            .collection('shipments')
            .where('clientId', '==', clientId)
            .where('webhookExternalOrderId', '==', payload.external_order_id)
            .limit(1)
            .get();
        if (!dup.empty) {
            const existing = dup.docs[0];
            console.log(
                `[orders/webhook] rid=${rid} 🔁 idempotent hit client=${clientId} external=${payload.external_order_id} shipment=${existing.id} (${Date.now() - start}ms)`
            );
            return NextResponse.json({
                ok: true,
                shipmentId: existing.id,
                idempotent: true,
            });
        }

        // 4. Pull default pickup address from the client's doc (same as the
        //    Shopify webhook does). Fall back to empty values if absent —
        //    the booking flow will tell the admin to set it.
        let pickup: Record<string, string> = {};
        let clientName = 'Webhook Merchant';
        try {
            const clientDoc = await db.collection('clients').doc(clientId).get();
            if (clientDoc.exists) {
                const data = clientDoc.data() ?? {};
                pickup = data.defaultPickupAddress || {};
                clientName = data.name || data.businessName || clientName;
            }
        } catch (err: any) {
            console.warn(
                `[orders/webhook] could not load pickup address for ${clientId}: ${err?.message || err}`
            );
        }

        // 5. Compute aggregates for the Shipment record.
        const ship = payload.shipping_address;
        const isCOD = payload.payment_method === 'cod';
        const totalWeightG = payload.items.reduce(
            (sum, it) => sum + (it.weight_g ?? 0) * it.quantity,
            0
        );
        const weightKg = totalWeightG ? +(totalWeightG / 1000).toFixed(3) : 0.5;
        const codAmount = isCOD
            ? PAISE_TO_RUPEES(payload.amounts.cod_collect ?? payload.amounts.total)
            : 0;
        const declaredValue = PAISE_TO_RUPEES(payload.amounts.subtotal);

        const now = Timestamp.now();
        const referenceNo = `ORD-${payload.external_order_id}`;

        const shipmentDoc = {
            clientId,
            clientName,
            clientType: 'franchise' as const,  // generic — webhook merchants aren't on Shopify
            courier: 'Pending — pick on Shipments page',
            courierTrackingId: '',
            status: 'webhook_pending' as const,

            webhookExternalOrderId: payload.external_order_id,
            webhookApiKeyId: keyHit.keyId,
            webhookSource: 'merchant_api' as const,

            origin: {
                city: pickup.city || '',
                state: pickup.state || '',
                pincode: pickup.pincode || '',
                address: pickup.address || '',
                phone: pickup.phone || '',
                name: pickup.name || '',
            },
            destination: {
                city: ship.city,
                state: ship.state,
                pincode: ship.pincode,
                address: [ship.line1, ship.line2].filter(Boolean).join(', '),
                phone: ship.phone,
                name: ship.name,
            },

            weight: weightKg,
            actualWeight: weightKg,
            // No dimensions on the webhook today — admin sets at booking time.

            courierCharge: 0,
            chargedAmount: PAISE_TO_RUPEES(payload.amounts.total),
            marginAmount: 0,

            declaredValue,
            receiverName: ship.name,
            receiverMobile: ship.phone,
            companyName: ship.name,
            commodityDetail1: payload.items[0]?.name || '',

            products: payload.items.map((it) => ({
                sku: it.sku || '',
                name: it.name,
                quantity: it.quantity,
                price: PAISE_TO_RUPEES(it.unit_price),
                ...(it.hsn ? { hsn: it.hsn } : {}),
            })),

            referenceNo,
            ...(isCOD
                ? { codEnabled: true, collectableAmount: codAmount, toPayCustomer: true }
                : { codEnabled: false, toPayCustomer: false }),
            ...(payload.customer.email ? { receiverEmail: payload.customer.email } : {}),
            notes: payload.notes ?? `Merchant webhook order ${payload.external_order_id}`,

            createdAt: now,
            updatedAt: now,
        };

        const ref = await db.collection('shipments').add(shipmentDoc);
        console.log(
            `[orders/webhook] rid=${rid} 🆕 shipment created client=${clientId} external=${payload.external_order_id} shipment=${ref.id} (${Date.now() - start}ms)`
        );

        return NextResponse.json({
            ok: true,
            shipmentId: ref.id,
            referenceNo,
        });
    } catch (err: any) {
        console.error(
            `[orders/webhook] rid=${rid} 💥 500 unexpected error (${Date.now() - start}ms):`,
            err?.message || err
        );
        return NextResponse.json(
            { error: err?.message || 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
