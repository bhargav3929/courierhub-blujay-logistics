import type { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type {
    BookInput,
    BookResult,
    CarrierLabel,
    CarrierQuote,
    CourierAdapter,
    CourierCredentials,
    CredentialsResolver,
    QuoteInput,
} from '@/types/b2b/courier-adapter';
import type { NormalizedEvent, RawTrackingEvent } from '@/types/b2b/tracking';
import { computeDedupKey } from '@/services/b2b/tracking/dedupKey';
import { CarrierError } from '../shared/carrierErrors';
import { carrierRequest } from '../shared/httpClient';
import { mapBlueDartScan } from './eventMap';

// BlueDart carrier adapter.
//
// Endpoints are placeholders that map to BlueDart's public surface — the
// actual base URLs and auth flow differ between sandbox and production
// and may change with their API version. The structure is what matters:
// every outbound call goes through carrierRequest (timeout + retry +
// circuit + structured logging), errors propagate as CarrierError, and
// the carrier-specific payload shape never escapes this file.

interface BlueDartCreds extends CourierCredentials {
    loginId: string;
    licenseKey: string;
    customerCode: string;
    areaCode: string;
    baseUrl: string;            // sandbox vs production
    webhookSecret?: string;
}

const COURIER = 'bluedart' as const;

export class BlueDartAdapter implements CourierAdapter {
    readonly courier = COURIER;

    constructor(private readonly credentials: CredentialsResolver) {}

    // ─── Booking-side ───────────────────────────────────────────────

    async quote(input: QuoteInput): Promise<CarrierQuote> {
        const creds = await this.creds(input.partnerId);
        const res = await carrierRequest<{ totalAmount?: number; expectedDays?: number; serviceCode?: string }>({
            courier: COURIER,
            operation: 'quote',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/transportation/rate/v1/calculate`,
                headers: this.authHeaders(creds),
                data: this.toQuotePayload(input, creds),
            },
        });
        return {
            courier: COURIER,
            serviceCode: res.data.serviceCode ?? input.serviceCode ?? 'A',
            totalPaise: Math.round((res.data.totalAmount ?? 0) * 100),
            breakdown: {},      // BlueDart often does not provide this; left empty
            currency: 'INR',
            etaDays: res.data.expectedDays ?? null,
        };
    }

    async book(input: BookInput): Promise<BookResult> {
        const creds = await this.creds(input.partnerId);
        // BlueDart legacy API has weak idempotency. We still pass the
        // shipmentId as a customer reference so a duplicate booking shows
        // up under the same key in their portal — and so lookupByReference
        // can find it.
        const res = await carrierRequest<{ awbNo?: string; awb?: string; serviceCode?: string }>({
            courier: COURIER,
            operation: 'book',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/transportation/waybill/v1/GenerateWayBill`,
                headers: this.authHeaders(creds),
                data: this.toBookPayload(input, creds),
            },
            // Tighter retry — booking is the most expensive call to repeat.
            retries: 2,
        });
        const awb = res.data.awbNo ?? res.data.awb;
        if (!awb) {
            throw new CarrierError({
                courier: COURIER,
                operation: 'book',
                category: 'permanent',
                rawMessage: 'BlueDart booking returned no AWB',
            });
        }
        return {
            awb,
            courier: COURIER,
            serviceCode: res.data.serviceCode ?? input.serviceCode ?? 'A',
            bookedAt: new Date(),
            costPaise: 0,           // set from quote at saga layer if needed
            etaDays: null,
            raw: res.data as Record<string, unknown>,
        };
    }

    async lookupByReference(
        referenceNumber: string,
        partnerId: PartnerId,
    ): Promise<{ awb: string } | null> {
        const creds = await this.creds(partnerId);
        const res = await carrierRequest<{ awbNo?: string }>({
            courier: COURIER,
            operation: 'lookupByReference',
            config: {
                method: 'GET',
                url: `${creds.baseUrl}/transportation/waybill/v1/ByReference`,
                headers: this.authHeaders(creds),
                params: { reference: referenceNumber, customerCode: creds.customerCode },
            },
            retries: 1,
        });
        return res.data.awbNo ? { awb: res.data.awbNo } : null;
    }

    async cancel(awb: string, partnerId: PartnerId): Promise<void> {
        const creds = await this.creds(partnerId);
        await carrierRequest({
            courier: COURIER,
            operation: 'cancel',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/transportation/waybill/v1/Cancel`,
                headers: this.authHeaders(creds),
                data: { awbNo: awb, customerCode: creds.customerCode },
            },
        });
    }

    async generateLabel(awb: string, partnerId: PartnerId): Promise<CarrierLabel> {
        const creds = await this.creds(partnerId);
        const res = await carrierRequest<ArrayBuffer>({
            courier: COURIER,
            operation: 'generateLabel',
            config: {
                method: 'GET',
                url: `${creds.baseUrl}/transportation/waybill/v1/Label`,
                headers: { ...this.authHeaders(creds), Accept: 'application/pdf' },
                params: { awbNo: awb },
                responseType: 'arraybuffer',
            },
        });
        return {
            format: 'pdf',
            bytes: new Uint8Array(res.data),
            filename: `bluedart-${awb}.pdf`,
        };
    }

    async pollStatus(
        awb: string,
        partnerId: PartnerId,
    ): Promise<readonly RawTrackingEvent[]> {
        const creds = await this.creds(partnerId);
        const res = await carrierRequest<unknown>({
            courier: COURIER,
            operation: 'pollStatus',
            config: {
                method: 'GET',
                url: `${creds.baseUrl}/transportation/tracking/v1/${encodeURIComponent(awb)}`,
                headers: this.authHeaders(creds),
            },
        });
        return this.parsePollResponse(res.data);
    }

    // ─── Event-side (also used by BlueDartWebhookHandler) ──────────

    parseWebhook(payload: unknown): readonly RawTrackingEvent[] {
        // BlueDart pushes webhook bodies in the same shape as the tracking
        // endpoint response, so we share the parser.
        return this.parsePollResponse(payload);
    }

    parsePollResponse(payload: unknown): readonly RawTrackingEvent[] {
        const shipment = pickPath(payload, ['ShipmentData', 0, 'Shipment'])
            ?? pickPath(payload, ['shipmentData', 0, 'shipment'])
            ?? pickPath(payload, ['Shipment']);
        if (!shipment || typeof shipment !== 'object') return [];

        const scans = pickArray(shipment, 'Scans') ?? pickArray(shipment, 'scans') ?? [];
        return scans.map((s): RawTrackingEvent => ({
            source: 'bluedart',
            rawCode: pickString(s, 'StatusCode') ?? pickString(s, 'Status') ?? '',
            description: pickString(s, 'Scan') ?? pickString(s, 'ScanRemarks') ?? '',
            occurredAt: parseBlueDartDate(
                pickString(s, 'ScanDate') ?? pickString(s, 'scanDate'),
            ),
            locationRaw: pickString(s, 'ScannedLocation') ?? pickString(s, 'location') ?? null,
            facility: pickString(s, 'ScannedLocationCode') ?? null,
            payload: s as Record<string, unknown>,
        }));
    }

    normalize(
        raw: RawTrackingEvent,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent {
        const mapping = mapBlueDartScan(raw.rawCode);
        const impliedStatus = impliedStatusFor(mapping.type);
        return {
            type: mapping.type,
            rawCode: raw.rawCode,
            source: 'bluedart',
            occurredAt: raw.occurredAt,
            receivedAt,
            location: { city: null, pincode: null, raw: raw.locationRaw },
            facility: raw.facility,
            description: raw.description,
            impliedStatus,
            impliedReason: mapping.impliedReason ?? null,
            dedupKey: computeDedupKey({
                source: 'bluedart',
                rawCode: raw.rawCode,
                occurredAt: raw.occurredAt,
                locationRaw: raw.locationRaw,
                shipmentId,
            }),
        };
    }

    // ─── helpers ──────────────────────────────────────────────────────

    private async creds(partnerId: PartnerId): Promise<BlueDartCreds> {
        const c = await this.credentials.resolve(partnerId, COURIER);
        if (!c) {
            throw new CarrierError({
                courier: COURIER,
                operation: 'quote',
                category: 'auth',
                rawMessage: 'Partner has not connected BlueDart',
            });
        }
        return c as unknown as BlueDartCreds;
    }

    private authHeaders(creds: BlueDartCreds): Record<string, string> {
        // BlueDart uses an OAuth-style flow in production. The actual
        // token exchange happens elsewhere and is cached per-partner.
        // For now we send loginId/licenseKey as headers — replace with the
        // real bearer token in production.
        return {
            'Content-Type': 'application/json',
            'X-Bd-Login-Id': creds.loginId,
            'X-Bd-License-Key': creds.licenseKey,
        };
    }

    private toQuotePayload(input: QuoteInput, creds: BlueDartCreds): unknown {
        return {
            customerCode: creds.customerCode,
            origin: { pincode: input.origin.pincode, areaCode: creds.areaCode },
            destination: { pincode: input.destination.pincode },
            weight: input.parcel.weightGrams / 1000,
            dimensions: input.parcel.dimensionsCm,
            declaredValue: input.parcel.declaredValuePaise / 100,
        };
    }

    private toBookPayload(input: BookInput, creds: BlueDartCreds): unknown {
        return {
            customerCode: creds.customerCode,
            referenceNumber: input.referenceNumber,
            consignor: addressToBd(input.origin),
            consignee: addressToBd(input.destination),
            parcel: {
                weight: input.parcel.weightGrams / 1000,
                dimensions: input.parcel.dimensionsCm,
                declaredValue: input.parcel.declaredValuePaise / 100,
                contents: input.parcel.contents,
                isCod: input.parcel.isCod,
                codAmount: input.cod ? input.cod.amountPaise / 100 : 0,
            },
        };
    }
}

// ─── pure helpers (no this binding) ─────────────────────────────────────

function impliedStatusFor(type: string): NormalizedEvent['impliedStatus'] {
    switch (type) {
        case 'shipment.booked':           return 'booked';
        case 'shipment.picked_up':        return 'picked_up';
        case 'shipment.in_transit':       return 'in_transit';
        case 'shipment.out_for_delivery': return 'out_for_delivery';
        case 'shipment.delivered':        return 'delivered';
        case 'shipment.undelivered':      return 'undelivered';
        case 'shipment.rto_initiated':    return 'rto_initiated';
        case 'shipment.rto_in_transit':   return 'rto_in_transit';
        case 'shipment.rto_delivered':    return 'rto_delivered';
        case 'shipment.cancelled':        return 'cancelled';
        case 'shipment.lost':             return 'lost';
        case 'shipment.damaged':          return 'damaged';
        default:                          return null;
    }
}

function addressToBd(a: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string }): unknown {
    return {
        name: a.name,
        phone: a.phone,
        address1: a.line1,
        address2: a.line2 ?? '',
        city: a.city,
        state: a.state,
        pincode: a.pincode,
    };
}

function parseBlueDartDate(raw: string | null | undefined): Date {
    if (!raw) return new Date();
    // BlueDart uses "DD-MMM-YYYY HH:mm:ss" in many payloads. Fallback to Date parser.
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) return d;
    return new Date();
}

function pickString(obj: unknown, key: string): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
}

function pickArray(obj: unknown, key: string): unknown[] | null {
    if (!obj || typeof obj !== 'object') return null;
    const v = (obj as Record<string, unknown>)[key];
    return Array.isArray(v) ? v : null;
}

function pickPath(obj: unknown, path: ReadonlyArray<string | number>): unknown {
    let cur: unknown = obj;
    for (const seg of path) {
        if (cur === null || cur === undefined) return undefined;
        if (typeof seg === 'number') {
            if (!Array.isArray(cur)) return undefined;
            cur = cur[seg];
        } else {
            if (typeof cur !== 'object') return undefined;
            cur = (cur as Record<string, unknown>)[seg];
        }
    }
    return cur;
}
