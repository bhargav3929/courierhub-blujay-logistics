// Server-side dispatcher: routes a paid Order to one of the existing
// direct carrier integrations (BlueDart / Delhivery / DTDC).
//
// Design constraint: do not touch existing carrier code. We re-use the
// existing /api/<carrier>/* routes by issuing a server-side fetch to
// our own host. That keeps every existing payload-builder, auth, token
// cache and credential-resolver intact.
//
// Payload shapes mirror the existing add-shipment booking handlers
// in src/app/(client)/add-shipment/page.tsx — the proven format.
//
// Defaults:
//   - Package dimensions: 10x10x5 cm  (Order schema doesn't carry box dims yet)
//   - Item weight: sum of items[].weight (grams), fallback 500g
//   - Pickup info: BLUEDART_PREDEFINED / DTDC_PREDEFINED / DELHIVERY_PREDEFINED
import {
    attachShipmentRef,
    setAutomationStage,
} from '@/services/server/orderAdminService';
import {
    BLUEDART_PREDEFINED,
    BLUEDART_SERVICE_TYPES,
    type BlueDartServiceType,
} from '@/config/bluedartConfig';
import { DTDC_PREDEFINED } from '@/config/dtdcConfig';
import {
    DELHIVERY_PREDEFINED,
    DELHIVERY_SERVICE_TYPES,
    sanitizeDelhiveryField,
    type DelhiveryServiceType,
} from '@/config/delhiveryConfig';
import type { Order, OrderShipmentRef } from '@/types/order';

export type DirectCarrier = 'bluedart' | 'delhivery' | 'dtdc';

export interface DirectBookingResult {
    awb: string;
    courierName: string;
    extra?: Record<string, unknown>;
}

export class DirectCarrierError extends Error {
    status: number;
    details?: unknown;
    constructor(message: string, status: number, details?: unknown) {
        super(message);
        this.name = 'DirectCarrierError';
        this.status = status;
        this.details = details;
    }
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

const PAISE_TO_RUPEES = (paise: number) => +(paise / 100).toFixed(2);

function internalBaseUrl(): string {
    return (
        process.env.INTERNAL_API_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        `http://localhost:${process.env.PORT || 3000}`
    );
}

async function callInternal<T = unknown>(
    path: string,
    body: unknown
): Promise<T> {
    const res = await fetch(`${internalBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let data: any;
    try {
        data = await res.json();
    } catch {
        throw new DirectCarrierError(
            `Internal call to ${path} returned non-JSON (HTTP ${res.status})`,
            res.status
        );
    }
    if (!res.ok) {
        throw new DirectCarrierError(
            data?.error || data?.details || `Internal call ${path} failed`,
            res.status,
            data
        );
    }
    return data as T;
}

function totalWeightKg(order: Order): number {
    const grams = order.items.reduce(
        (sum, it) => sum + (it.weight ?? 0) * it.quantity,
        0
    );
    return grams ? +(grams / 1000).toFixed(3) : 0.5;
}

function totalWeightGrams(order: Order): number {
    const g = order.items.reduce(
        (s, it) => s + (it.weight ?? 0) * it.quantity,
        0
    );
    return g ? Math.max(1, Math.round(g)) : DELHIVERY_PREDEFINED.defaultWeightGrams;
}

function totalQuantity(order: Order): number {
    return order.items.reduce((s, it) => s + it.quantity, 0) || 1;
}

function declaredValueRupees(order: Order): number {
    return PAISE_TO_RUPEES(order.amounts.subtotal) || 200;
}

function isCOD(order: Order): boolean {
    return order.payment.provider === 'cod';
}

function codAmountRupees(order: Order): number {
    return PAISE_TO_RUPEES(order.amounts.codCollect ?? order.amounts.total);
}

function buildReferenceNo(order: Order): string {
    return `ORDER-${order.id.slice(-6).toUpperCase()}`;
}

// -----------------------------------------------------------------
// BlueDart
// -----------------------------------------------------------------

export interface BlueDartBookOptions {
    serviceType?: BlueDartServiceType; // default APEX (B2C)
}

interface BlueDartResponse {
    GenerateWayBillResult?: {
        AWBNo?: string;
        DestinationArea?: string;
        DestinationLocation?: string;
        TokenNumber?: string;
        IsError?: boolean;
        Status?: Array<{ StatusInformation?: string; StatusCode?: string }>;
    };
    AWBNo?: string;
    IsError?: boolean;
    Status?: Array<{ StatusInformation?: string; StatusCode?: string }>;
}

export async function bookViaBlueDart(
    order: Order,
    opts: BlueDartBookOptions = {}
): Promise<DirectBookingResult> {
    const service =
        BLUEDART_SERVICE_TYPES[opts.serviceType ?? 'APEX'] ||
        BLUEDART_SERVICE_TYPES.APEX;
    const ship = order.shippingAddress;
    const cod = isCOD(order);
    const referenceNo = buildReferenceNo(order);
    const collectableAmount = cod ? codAmountRupees(order) : 0;

    const payload = {
        Request: {
            Consignee: {
                ConsigneeName: ship.name,
                ConsigneeAddress1: ship.line1.slice(0, 30),
                ConsigneeAddress2: (ship.line2 ?? ship.line1.slice(30, 60) ?? '').slice(0, 30),
                ConsigneeAddress3: ship.city,
                ConsigneePincode: ship.pincode,
                ConsigneeMobile: ship.phone,
                ConsigneeTelephone: ship.phone,
                ConsigneeAttention: ship.name,
            },
            Shipper: {
                CustomerName: BLUEDART_PREDEFINED.shipperName,
                CustomerCode: BLUEDART_PREDEFINED.billingCustomerCode,
                CustomerAddress1: BLUEDART_PREDEFINED.pickupAddress.slice(0, 30),
                CustomerAddress2: BLUEDART_PREDEFINED.pickupAddress.slice(30, 60) || '',
                CustomerAddress3: 'HYD',
                CustomerPincode: BLUEDART_PREDEFINED.pickupPincode,
                CustomerMobile: BLUEDART_PREDEFINED.senderMobile,
                CustomerTelephone: BLUEDART_PREDEFINED.senderMobile,
                OriginArea: BLUEDART_PREDEFINED.billingArea,
                Sender: BLUEDART_PREDEFINED.senderName,
                isToPayCustomer: false,
            },
            Services: {
                ProductCode: service.code,
                ProductType: 1,
                ...(cod ? { SubProductCode: 'C' } : { SubProductCode: 'P' }),
                PieceCount: '1',
                PackType: service.packType || '',
                ActualWeight: totalWeightKg(order).toString(),
                Dimensions: [
                    { Length: '10', Breadth: '10', Height: '5', Count: '1' },
                ],
                ...(cod ? { CollectableAmount: collectableAmount } : {}),
                DeclaredValue: declaredValueRupees(order),
                CreditReferenceNo: referenceNo,
                PickupDate: `/Date(${Date.now() + 24 * 60 * 60 * 1000})/`,
                PickupTime: BLUEDART_PREDEFINED.pickupTime,
                PDFOutputNotRequired: false,
                Commodity: { CommodityDetail1: order.items[0]?.name || '' },
            },
        },
        Profile: {
            // /api/bluedart/generate-waybill fills these in from env or per-client
            // creds when missing, so we leave them blank here.
            Api_type: 'S',
            Version: '1.10',
        },
        __clientId: order.clientId,
    };

    const data = await callInternal<BlueDartResponse>(
        '/api/bluedart/generate-waybill',
        payload
    );
    const result = data.GenerateWayBillResult ?? data;
    const status = (result as any)?.Status?.[0] ?? {};
    if ((result as any)?.IsError === true) {
        throw new DirectCarrierError(
            `BlueDart: ${status.StatusInformation || 'Unknown error'}`,
            502,
            result
        );
    }
    const awb = (result as any)?.AWBNo;
    if (!awb) {
        throw new DirectCarrierError(
            'BlueDart did not return an AWB',
            502,
            result
        );
    }
    // service.displayName already includes "Blue Dart" / "Dart" prefix where
    // appropriate ("Blue Dart Air", "Domestic Priority", "Dart Surfaceline"),
    // so we use it as-is. For "Domestic Priority" we prepend "Blue Dart" to
    // avoid an ambiguous label.
    const courierName = /blue\s*dart|^dart/i.test(service.displayName)
        ? service.displayName
        : `Blue Dart ${service.displayName}`;

    return {
        awb,
        courierName,
        extra: {
            destinationArea: (result as any)?.DestinationArea,
            destinationLocation: (result as any)?.DestinationLocation,
            tokenNumber: (result as any)?.TokenNumber,
            serviceCode: service.code,
            serviceName: service.name,
        },
    };
}

// -----------------------------------------------------------------
// Delhivery
// -----------------------------------------------------------------

export interface DelhiveryBookOptions {
    serviceType?: DelhiveryServiceType; // default Surface
}

interface DelhiveryResponse {
    success?: boolean;
    packages?: Array<{
        waybill?: string;
        status?: string;
        remarks?: string | string[];
    }>;
    rmk?: string;
    error?: string;
    message?: string;
}

export async function bookViaDelhivery(
    order: Order,
    opts: DelhiveryBookOptions = {}
): Promise<DirectBookingResult> {
    const service =
        DELHIVERY_SERVICE_TYPES[opts.serviceType ?? 'Surface'] ||
        DELHIVERY_SERVICE_TYPES.Surface;
    const ship = order.shippingAddress;
    const cod = isCOD(order);
    const referenceNo = buildReferenceNo(order);

    const payload = {
        // /api/delhivery/create-order fills pickup_location from per-client or
        // env defaults if omitted, so we omit and let the route handle it.
        shipments: [
            {
                name: sanitizeDelhiveryField(ship.name),
                add: sanitizeDelhiveryField(ship.line1),
                pin: ship.pincode.replace(/\D/g, ''),
                city: sanitizeDelhiveryField(ship.city),
                state: sanitizeDelhiveryField(ship.state),
                country: 'India',
                phone: ship.phone.replace(/\D/g, ''),
                order: referenceNo,
                payment_mode: cod ? 'COD' : 'Prepaid',
                products_desc: sanitizeDelhiveryField(
                    order.items[0]?.name || DELHIVERY_PREDEFINED.defaultProductDesc
                ),
                hsn_code:
                    order.items[0]?.hsn || DELHIVERY_PREDEFINED.defaultHsnCode,
                ...(cod ? { cod_amount: codAmountRupees(order) } : {}),
                total_amount: declaredValueRupees(order),
                seller_add: DELHIVERY_PREDEFINED.pickupAddress,
                seller_name: BLUEDART_PREDEFINED.shipperName,
                quantity: totalQuantity(order),
                shipment_width: DELHIVERY_PREDEFINED.defaultDimensionsCm.width,
                shipment_height: DELHIVERY_PREDEFINED.defaultDimensionsCm.height,
                shipment_length: DELHIVERY_PREDEFINED.defaultDimensionsCm.length,
                weight: totalWeightGrams(order),
                shipping_mode: service.code,
                address_type: 'home' as const,
            },
        ],
        __clientId: order.clientId,
    };

    const data = await callInternal<DelhiveryResponse>(
        '/api/delhivery/create-order',
        payload
    );
    const pkg = data.packages?.[0];
    const success = data.success === true || pkg?.status === 'Success' || !!pkg?.waybill;
    if (!success || !pkg?.waybill) {
        const remarks = Array.isArray(pkg?.remarks)
            ? pkg!.remarks.join('; ')
            : (pkg?.remarks ?? '');
        const msg =
            remarks ||
            data.rmk ||
            data.error ||
            data.message ||
            'Delhivery rejected the order';
        throw new DirectCarrierError(`Delhivery: ${msg}`, 502, data);
    }
    return {
        awb: pkg.waybill,
        courierName: service.displayName,
        extra: { serviceCode: service.code, referenceNo },
    };
}

// -----------------------------------------------------------------
// DTDC
// -----------------------------------------------------------------

export interface DTDCBookOptions {
    // No service-type variants today — DTDC_PREDEFINED.serviceTypeId is used.
    serviceTypeId?: string;
}

interface DTDCResponse {
    status?: string;
    data?: Array<{
        success?: boolean;
        reference_number?: string;
        chargeable_weight?: number;
        message?: string;
    }>;
    message?: string;
}

export async function bookViaDTDC(
    order: Order,
    opts: DTDCBookOptions = {}
): Promise<DirectBookingResult> {
    const ship = order.shippingAddress;
    const cod = isCOD(order);
    const referenceNo = buildReferenceNo(order);

    const payload = {
        customer_code: DTDC_PREDEFINED.customerCode,
        service_type_id: opts.serviceTypeId || DTDC_PREDEFINED.serviceTypeId,
        load_type: DTDC_PREDEFINED.loadType,
        description: order.items[0]?.name || 'General Goods',
        dimension_unit: DTDC_PREDEFINED.dimensionUnit,
        length: '10',
        width: '10',
        height: '5',
        weight_unit: DTDC_PREDEFINED.weightUnit,
        weight: totalWeightKg(order).toString(),
        declared_value:
            declaredValueRupees(order) ||
            parseFloat(DTDC_PREDEFINED.defaultDeclaredValue),
        num_pieces: DTDC_PREDEFINED.defaultPieceCount,
        customer_reference_number: referenceNo,
        commodity_id: DTDC_PREDEFINED.commodityId,
        is_risk_surcharge_applicable:
            (DTDC_PREDEFINED as any).isRiskSurchargeApplicable ?? 'false',
        ...(cod
            ? {
                  cod_collection_mode: 'cash',
                  cod_amount: codAmountRupees(order),
              }
            : {}),
        origin_details: {
            name: DTDC_PREDEFINED.shipperName,
            phone: DTDC_PREDEFINED.senderMobile,
            address_line_1: DTDC_PREDEFINED.pickupAddress1,
            pincode: DTDC_PREDEFINED.pickupPincode,
            city: DTDC_PREDEFINED.pickupCity,
            state: DTDC_PREDEFINED.pickupState,
        },
        destination_details: {
            name: ship.name,
            phone: ship.phone,
            address_line_1: ship.line1,
            pincode: ship.pincode,
            city: ship.city,
            state: ship.state,
        },
        __clientId: order.clientId,
    };

    const data = await callInternal<DTDCResponse>(
        '/api/dtdc/create-order',
        payload
    );
    const top = data.data?.[0];
    if (data.status !== 'OK' || !top?.success || !top.reference_number) {
        const msg =
            top?.message ||
            data.message ||
            'DTDC rejected the order';
        throw new DirectCarrierError(`DTDC: ${msg}`, 502, data);
    }
    return {
        awb: top.reference_number,
        courierName: 'DTDC',
        extra: {
            chargeableWeight: top.chargeable_weight,
            referenceNo,
        },
    };
}

// -----------------------------------------------------------------
// Top-level dispatcher — what the API route calls
// -----------------------------------------------------------------

export interface BookOrderDirectInput {
    carrier: DirectCarrier;
    blueDartServiceType?: BlueDartServiceType;
    delhiveryServiceType?: DelhiveryServiceType;
    dtdcServiceTypeId?: string;
}

export interface BookOrderDirectResult {
    ok: true;
    awb: string;
    courierName: string;
    provider: DirectCarrier;
}

/**
 * Book a paid order via one of the three direct carriers. Idempotent on
 * order.shipment.awb being set already (returns the existing AWB without
 * re-booking).
 */
export async function bookOrderDirect(
    order: Order,
    input: BookOrderDirectInput
): Promise<BookOrderDirectResult> {
    // Idempotency: if already booked, short-circuit.
    if (order.shipment?.awb && order.shipment.provider) {
        return {
            ok: true,
            awb: order.shipment.awb,
            courierName: order.shipment.courierName ?? 'unknown',
            provider: order.shipment.provider as DirectCarrier,
        };
    }

    if (order.payment.status !== 'paid' && order.payment.provider !== 'cod') {
        throw new DirectCarrierError(
            'Order is not paid yet — cannot book shipment',
            409
        );
    }

    let result: DirectBookingResult;
    switch (input.carrier) {
        case 'bluedart':
            result = await bookViaBlueDart(order, {
                serviceType: input.blueDartServiceType,
            });
            break;
        case 'delhivery':
            result = await bookViaDelhivery(order, {
                serviceType: input.delhiveryServiceType,
            });
            break;
        case 'dtdc':
            result = await bookViaDTDC(order, {
                serviceTypeId: input.dtdcServiceTypeId,
            });
            break;
        default:
            throw new DirectCarrierError(
                `Unsupported carrier: ${(input as any).carrier}`,
                400
            );
    }

    const ref: Partial<OrderShipmentRef> = {
        provider: input.carrier,
        awb: result.awb,
        courierName: result.courierName,
    };
    await attachShipmentRef(order.id, ref);
    await setAutomationStage(order.id, 'shipment_created', {
        note: `${input.carrier} booked: AWB ${result.awb}`,
    });

    return {
        ok: true,
        awb: result.awb,
        courierName: result.courierName,
        provider: input.carrier,
    };
}

// =====================================================================
//  Cancellation — dispatches to the existing per-carrier cancel route.
// =====================================================================

export interface CancelOrderDirectResult {
    ok: true;
    awb: string;
    provider: DirectCarrier;
}

interface BlueDartCancelResponse {
    CancelWaybillResult?: { IsError?: boolean; Status?: any[] };
    IsError?: boolean;
    Status?: Array<{ StatusInformation?: string }>;
}

interface DelhiveryCancelResponse {
    success?: boolean;
    error?: string;
    rmk?: string;
    status?: string;
}

interface DTDCCancelResponse {
    status?: string;
    data?: Array<{ success?: boolean; message?: string }>;
    message?: string;
}

/**
 * Cancel a previously-booked direct-carrier shipment. Dispatches to the
 * carrier the order was booked with. Idempotent on already-cancelled orders.
 */
export async function cancelOrderDirect(
    order: Order
): Promise<CancelOrderDirectResult> {
    const provider = order.shipment?.provider as DirectCarrier | undefined;
    const awb = order.shipment?.awb;
    if (!provider || !awb) {
        throw new DirectCarrierError(
            'Order has no booked shipment to cancel',
            409
        );
    }
    if (order.automation.stage === 'cancelled') {
        return { ok: true, awb, provider };
    }

    if (provider === 'bluedart') {
        const data = await callInternal<BlueDartCancelResponse>(
            '/api/bluedart/cancel-shipment',
            { awb, clientId: order.clientId }
        );
        const result = data.CancelWaybillResult ?? data;
        const isErr = (result as any)?.IsError === true;
        if (isErr) {
            const status = (result as any)?.Status?.[0] ?? {};
            throw new DirectCarrierError(
                `BlueDart: ${status.StatusInformation || 'Cancellation rejected'}`,
                502,
                result
            );
        }
    } else if (provider === 'delhivery') {
        const data = await callInternal<DelhiveryCancelResponse>(
            '/api/delhivery/cancel-shipment',
            { waybill: awb, __clientId: order.clientId }
        );
        const ok =
            data.success === true ||
            data.status === 'OK' ||
            /success/i.test(data.rmk || '');
        if (!ok) {
            throw new DirectCarrierError(
                `Delhivery: ${data.rmk || data.error || 'Cancellation rejected'}`,
                502,
                data
            );
        }
    } else if (provider === 'dtdc') {
        const data = await callInternal<DTDCCancelResponse>(
            '/api/dtdc/cancel-shipment',
            { awb, __clientId: order.clientId }
        );
        const top = data.data?.[0];
        if (data.status !== 'OK' || top?.success === false) {
            throw new DirectCarrierError(
                `DTDC: ${top?.message || data.message || 'Cancellation rejected'}`,
                502,
                data
            );
        }
    } else {
        throw new DirectCarrierError(
            `Unsupported provider for cancellation: ${provider}`,
            400
        );
    }

    // Persist cancellation on the order doc.
    await attachShipmentRef(order.id, {
        status: 'cancelled',
    });
    await setAutomationStage(order.id, 'cancelled', {
        note: `${provider} shipment cancelled (AWB ${awb})`,
    });

    return { ok: true, awb, provider };
}
