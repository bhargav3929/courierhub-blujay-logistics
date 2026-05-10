// Server-side Shiprocket operations — pure functions on a (already-loaded,
// ownership-verified) Order. No auth, no HTTP framing. Used by:
//   - /api/shiprocket/* route handlers (which auth + load order + delegate)
//   - orchestratorService (which sequences the 3 fulfilment steps)
//   - Razorpay webhook (Phase 6 wires this in for full automation)
//
// Each step is idempotent — re-running with an already-completed order is
// a fast no-op. That's what makes scheduled retries safe.
import {
    attachShipmentRef,
    setAutomationStage,
    incrementAutomationAttempts,
} from '@/services/server/orderAdminService';
import {
    shiprocketRequest,
    getDefaultPickupLocation,
} from '@/services/server/shiprocketClient';
import type { Order } from '@/types/order';

export class ShiprocketOpError extends Error {
    status: number;
    details?: unknown;
    constructor(message: string, status: number, details?: unknown) {
        super(message);
        this.name = 'ShiprocketOpError';
        this.status = status;
        this.details = details;
    }
}

const PAISE_TO_RUPEES = (paise: number) => +(paise / 100).toFixed(2);

// =================================================================
//  STEP 1 — Create Shiprocket order  (POST /orders/create/adhoc)
// =================================================================

interface ShiprocketAdhocResponse {
    order_id?: number | string;
    shipment_id?: number | string;
    status?: string;
    status_code?: number;
    awb_code?: string | null;
    courier_company_id?: number | null;
    courier_name?: string | null;
}

export interface CreateOrderResult {
    shiprocketOrderId: string;
    shipmentId: string;
    status?: string;
    alreadyCreated?: boolean;
}

function buildAdhocPayload(order: Order, pickupLocation: string) {
    const ship = order.shippingAddress;
    const bill = order.billingAddress ?? ship;

    const weightGrams =
        order.items.reduce(
            (sum, item) => sum + (item.weight ?? 0) * item.quantity,
            0
        ) || 500;

    const orderDate = order.createdAt
        ? new Date(order.createdAt.toMillis())
        : new Date();
    const yyyy = orderDate.getUTCFullYear();
    const mm = String(orderDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(orderDate.getUTCDate()).padStart(2, '0');
    const hh = String(orderDate.getUTCHours()).padStart(2, '0');
    const mi = String(orderDate.getUTCMinutes()).padStart(2, '0');

    return {
        order_id: order.id,
        order_date: `${yyyy}-${mm}-${dd} ${hh}:${mi}`,
        pickup_location: pickupLocation,
        billing_customer_name: bill.name,
        billing_last_name: '',
        billing_address: bill.line1,
        billing_address_2: bill.line2 ?? '',
        billing_city: bill.city,
        billing_pincode: bill.pincode,
        billing_state: bill.state,
        billing_country: bill.country,
        billing_email: bill.email ?? order.customer.email ?? '',
        billing_phone: bill.phone,
        shipping_is_billing: bill === ship,
        shipping_customer_name: ship.name,
        shipping_address: ship.line1,
        shipping_address_2: ship.line2 ?? '',
        shipping_city: ship.city,
        shipping_pincode: ship.pincode,
        shipping_state: ship.state,
        shipping_country: ship.country,
        shipping_email: ship.email ?? order.customer.email ?? '',
        shipping_phone: ship.phone,
        order_items: order.items.map((it) => ({
            name: it.name,
            sku: it.sku ?? `SKU-${it.name.slice(0, 8).replace(/\s+/g, '_').toUpperCase()}`,
            units: it.quantity,
            selling_price: PAISE_TO_RUPEES(it.unitPrice),
            ...(it.hsn ? { hsn: it.hsn } : {}),
        })),
        payment_method: order.payment.provider === 'cod' ? 'COD' : 'Prepaid',
        sub_total: PAISE_TO_RUPEES(order.amounts.subtotal),
        shipping_charges: PAISE_TO_RUPEES(order.amounts.shipping),
        total_discount: PAISE_TO_RUPEES(order.amounts.discount),
        length: 10,
        breadth: 10,
        height: 5,
        weight: +(weightGrams / 1000).toFixed(2),
    };
}

export async function ensureShiprocketOrder(order: Order): Promise<CreateOrderResult> {
    if (
        order.shipment?.provider === 'shiprocket' &&
        order.shipment?.providerOrderId &&
        order.shipment?.providerShipmentId
    ) {
        return {
            shiprocketOrderId: order.shipment.providerOrderId,
            shipmentId: order.shipment.providerShipmentId,
            alreadyCreated: true,
        };
    }
    if (order.payment.status !== 'paid' && order.payment.provider !== 'cod') {
        throw new ShiprocketOpError(
            'Order is not paid yet — cannot create shipment',
            409
        );
    }
    const pickup = getDefaultPickupLocation();
    if (!pickup) {
        throw new ShiprocketOpError(
            'SHIPROCKET_PICKUP_LOCATION is not configured. Set it to a pickup location name registered in your Shiprocket dashboard (e.g. "Primary").',
            500
        );
    }

    await incrementAutomationAttempts(order.id);

    const response = await shiprocketRequest<ShiprocketAdhocResponse>({
        method: 'POST',
        path: '/orders/create/adhoc',
        body: buildAdhocPayload(order, pickup),
    });

    const shiprocketOrderId =
        response.order_id !== undefined ? String(response.order_id) : undefined;
    const shipmentId =
        response.shipment_id !== undefined ? String(response.shipment_id) : undefined;

    if (!shiprocketOrderId || !shipmentId) {
        await setAutomationStage(order.id, 'failed', {
            error: 'Shiprocket response missing order_id/shipment_id',
            note: 'create-order',
        });
        throw new ShiprocketOpError(
            'Shiprocket response missing order_id/shipment_id',
            502,
            response
        );
    }

    await attachShipmentRef(order.id, {
        provider: 'shiprocket',
        providerOrderId: shiprocketOrderId,
        providerShipmentId: shipmentId,
        ...(response.awb_code ? { awb: response.awb_code } : {}),
        ...(response.courier_company_id
            ? { courierId: Number(response.courier_company_id) }
            : {}),
        ...(response.courier_name ? { courierName: response.courier_name } : {}),
        ...(response.status ? { status: response.status } : {}),
    });
    await setAutomationStage(order.id, 'shipment_created', {
        note: 'shiprocket order created',
    });

    return {
        shiprocketOrderId,
        shipmentId,
        status: response.status,
    };
}

// =================================================================
//  STEP 2 — Assign AWB  (auto-picks recommended courier when no override)
// =================================================================

interface AssignAwbResponse {
    awb_assign_status?: number;
    response?: {
        data?: {
            awb_code?: string;
            courier_company_id?: number;
            courier_name?: string;
        };
    };
    message?: string;
}

interface ServiceabilityResponse {
    data?: {
        recommended_courier_company_id?: number;
        available_courier_companies?: Array<{
            courier_company_id: number;
            courier_name: string;
            is_recommended_advance?: boolean;
        }>;
    };
}

export interface AssignAwbResult {
    awb: string;
    courierId: number;
    courierName: string;
    alreadyAssigned?: boolean;
}

async function pickRecommendedCourier(
    pickupPin: string,
    deliveryPin: string,
    weightKg: number,
    cod: boolean
): Promise<{ courierId: number; name: string } | null> {
    const result = await shiprocketRequest<ServiceabilityResponse>({
        method: 'GET',
        path: '/courier/serviceability/',
        params: {
            pickup_postcode: pickupPin,
            delivery_postcode: deliveryPin,
            weight: weightKg,
            cod: cod ? 1 : 0,
        },
    });
    const couriers = result?.data?.available_courier_companies ?? [];
    const recommendedId =
        result?.data?.recommended_courier_company_id ??
        couriers.find((c) => c.is_recommended_advance)?.courier_company_id ??
        couriers[0]?.courier_company_id;
    if (!recommendedId) return null;
    const match = couriers.find((c) => c.courier_company_id === recommendedId);
    return {
        courierId: recommendedId,
        name: match?.courier_name || `Courier #${recommendedId}`,
    };
}

export async function ensureAwbAssigned(
    order: Order,
    overrideCourierId?: number
): Promise<AssignAwbResult> {
    if (!order.shipment?.providerShipmentId) {
        throw new ShiprocketOpError(
            'Order has no Shiprocket shipment_id — call create-order first',
            409
        );
    }
    if (order.shipment.awb) {
        return {
            awb: order.shipment.awb,
            courierId: order.shipment.courierId ?? 0,
            courierName: order.shipment.courierName ?? 'unknown',
            alreadyAssigned: true,
        };
    }

    let courierId = overrideCourierId;
    let courierName: string | undefined;

    if (!courierId) {
        const pickupPin = process.env.SHIPROCKET_PICKUP_PINCODE;
        if (!pickupPin) {
            throw new ShiprocketOpError(
                'SHIPROCKET_PICKUP_PINCODE not set — required for auto courier selection.',
                500
            );
        }
        const grams = order.items.reduce(
            (s, i) => s + (i.weight ?? 0) * i.quantity,
            0
        );
        const weightKg = grams ? +(grams / 1000).toFixed(2) : 0.5;
        const recommendation = await pickRecommendedCourier(
            pickupPin,
            order.shippingAddress.pincode,
            weightKg,
            order.payment.provider === 'cod'
        );
        if (!recommendation) {
            await setAutomationStage(order.id, 'failed', {
                error: 'No serviceable courier found',
                note: 'assign-awb',
            });
            throw new ShiprocketOpError(
                'No serviceable courier found for this route',
                422
            );
        }
        courierId = recommendation.courierId;
        courierName = recommendation.name;
    }

    const assignRes = await shiprocketRequest<AssignAwbResponse>({
        method: 'POST',
        path: '/courier/assign/awb',
        body: {
            shipment_id: Number(order.shipment.providerShipmentId),
            courier_id: courierId,
        },
    });

    const awb = assignRes?.response?.data?.awb_code;
    const assignedName =
        assignRes?.response?.data?.courier_name || courierName;
    if (!awb) {
        await setAutomationStage(order.id, 'failed', {
            error: assignRes?.message || 'Shiprocket did not return awb_code',
            note: 'assign-awb',
        });
        throw new ShiprocketOpError(
            assignRes?.message || 'Shiprocket did not return awb_code',
            502,
            assignRes
        );
    }

    await attachShipmentRef(order.id, {
        awb,
        courierId,
        courierName: assignedName,
    });

    return {
        awb,
        courierId: courierId!,
        courierName: assignedName ?? 'unknown',
    };
}

// =================================================================
//  STEP 3 — Generate label
// =================================================================

interface GenerateLabelResponse {
    label_created?: number;
    response?: string;
    label_url?: string;
    not_created?: unknown[];
}

export interface GenerateLabelResult {
    labelUrl: string;
    cached?: boolean;
}

export async function ensureLabel(order: Order): Promise<GenerateLabelResult> {
    if (!order.shipment?.providerShipmentId) {
        throw new ShiprocketOpError(
            'Order has no shipment_id — call create-order first',
            409
        );
    }
    if (!order.shipment.awb) {
        throw new ShiprocketOpError(
            'Order has no AWB yet — call assign-awb first',
            409
        );
    }
    if (order.shipment.labelUrl) {
        return { labelUrl: order.shipment.labelUrl, cached: true };
    }

    const res = await shiprocketRequest<GenerateLabelResponse>({
        method: 'POST',
        path: '/courier/generate/label',
        body: {
            shipment_id: [Number(order.shipment.providerShipmentId)],
        },
    });

    if (!res?.label_url) {
        throw new ShiprocketOpError(
            'Shiprocket did not return a label_url',
            502,
            res
        );
    }

    await attachShipmentRef(order.id, { labelUrl: res.label_url });
    return { labelUrl: res.label_url };
}
