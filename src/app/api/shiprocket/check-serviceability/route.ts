/**
 * POST /api/shiprocket/check-serviceability
 *
 * Body: { orderId: string }                          (preferred)
 *   OR  { pickupPincode, deliveryPincode, weightKg, cod? }
 * Auth: Authorization: Bearer <Firebase ID token>    (must own the order if orderId given)
 *
 * Returns the list of available couriers from Shiprocket plus the
 * `recommendedCourierId` (Shiprocket's automated pick). Useful for UIs that
 * want to show options or for diagnostics. The assign-awb route calls this
 * internally when no courierId is provided.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import { getOrderById } from '@/services/server/orderAdminService';
import { shiprocketRequest } from '@/services/server/shiprocketClient';

const Body = z
    .object({
        orderId: z.string().min(1).optional(),
        pickupPincode: z.string().regex(/^\d{6}$/).optional(),
        deliveryPincode: z.string().regex(/^\d{6}$/).optional(),
        weightKg: z.number().positive().optional(),
        cod: z.boolean().optional(),
    })
    .refine(
        (b) => b.orderId || (b.pickupPincode && b.deliveryPincode),
        'orderId or both pincodes required'
    );

interface ShiprocketCourier {
    courier_company_id: number;
    courier_name: string;
    rate?: number;
    freight_charge?: number;
    etd?: string;
    estimated_delivery_days?: string;
    rating?: number;
    is_recommended_advance?: boolean;
}

interface ServiceabilityResponse {
    status?: number;
    data?: {
        recommended_courier_company_id?: number;
        available_courier_companies?: ShiprocketCourier[];
    };
}

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

        let pickupPincode = parsed.data.pickupPincode;
        let deliveryPincode = parsed.data.deliveryPincode;
        let weightKg = parsed.data.weightKg;
        let cod = parsed.data.cod;

        if (parsed.data.orderId) {
            const order = await getOrderById(parsed.data.orderId);
            if (!order) {
                return NextResponse.json(
                    { error: 'Order not found' },
                    { status: 404 }
                );
            }
            if (order.clientId !== auth.clientId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            // Pickup pincode must come from env (warehouse) — Shiprocket needs the
            // origin pin matching a registered pickup location.
            const fromEnv = process.env.SHIPROCKET_PICKUP_PINCODE;
            if (!fromEnv) {
                return NextResponse.json(
                    {
                        error:
                            'SHIPROCKET_PICKUP_PINCODE not set. Set this to your warehouse pincode (matches the Shiprocket pickup location).',
                    },
                    { status: 500 }
                );
            }
            pickupPincode = pickupPincode || fromEnv;
            deliveryPincode = deliveryPincode || order.shippingAddress.pincode;
            if (weightKg == null) {
                const grams = order.items.reduce(
                    (s, i) => s + (i.weight ?? 0) * i.quantity,
                    0
                );
                weightKg = grams ? +(grams / 1000).toFixed(2) : 0.5;
            }
            if (cod == null) cod = order.payment.provider === 'cod';
        }

        if (!pickupPincode || !deliveryPincode || !weightKg) {
            return NextResponse.json(
                { error: 'Missing pickup/delivery pincode or weight' },
                { status: 400 }
            );
        }

        const result = await shiprocketRequest<ServiceabilityResponse>({
            method: 'GET',
            path: '/courier/serviceability/',
            params: {
                pickup_postcode: pickupPincode,
                delivery_postcode: deliveryPincode,
                weight: weightKg,
                cod: cod ? 1 : 0,
            },
        });

        const couriers = result?.data?.available_courier_companies ?? [];
        const recommendedId =
            result?.data?.recommended_courier_company_id ??
            couriers.find((c) => c.is_recommended_advance)?.courier_company_id ??
            couriers[0]?.courier_company_id ??
            null;

        return NextResponse.json({
            ok: true,
            recommendedCourierId: recommendedId,
            couriers: couriers.map((c) => ({
                courierId: c.courier_company_id,
                name: c.courier_name,
                rate: c.rate ?? c.freight_charge,
                etd: c.etd ?? c.estimated_delivery_days,
                rating: c.rating,
                recommended: c.courier_company_id === recommendedId,
            })),
        });
    } catch (err: any) {
        console.error(
            '[shiprocket/check-serviceability] error:',
            err?.message,
            err?.body || ''
        );
        return NextResponse.json(
            { error: err?.message || 'Failed to fetch serviceability' },
            { status: err?.status || 500 }
        );
    }
}
