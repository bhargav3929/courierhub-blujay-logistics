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
import { mapDtdcScan } from './eventMap';

interface DtdcCreds extends CourierCredentials {
    apiKey: string;
    customerCode: string;
    trackingUsername?: string;
    trackingPassword?: string;
    baseUrl: string;             // sandbox vs prod
    webhookSecret?: string;
}

const COURIER = 'dtdc' as const;

export class DTDCAdapter implements CourierAdapter {
    readonly courier = COURIER;

    constructor(private readonly credentials: CredentialsResolver) {}

    // ─── Booking-side ───────────────────────────────────────────────

    async quote(input: QuoteInput): Promise<CarrierQuote> {
        const creds = await this.creds(input.partnerId);
        const res = await carrierRequest<{ total?: number; transit_days?: number }>({
            courier: COURIER,
            operation: 'quote',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/apidocs/api/v1/rate`,
                headers: this.authHeaders(creds),
                data: {
                    customer_code: creds.customerCode,
                    origin_pin: input.origin.pincode,
                    destination_pin: input.destination.pincode,
                    weight_grams: input.parcel.weightGrams,
                    cod_amount: input.parcel.codAmountPaise / 100,
                },
            },
        });
        return {
            courier: COURIER,
            serviceCode: input.serviceCode ?? 'B2C SMART EXPRESS',
            totalPaise: Math.round((res.data.total ?? 0) * 100),
            breakdown: {},
            currency: 'INR',
            etaDays: res.data.transit_days ?? null,
        };
    }

    async book(input: BookInput): Promise<BookResult> {
        // DTDC accepts a `reference_number` field. Reuse returns existing AWB.
        const creds = await this.creds(input.partnerId);
        const res = await carrierRequest<{
            data?: Array<{ reference_number?: string; awb_number?: string; success?: boolean }>;
            success?: boolean;
        }>({
            courier: COURIER,
            operation: 'book',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/apidocs/api/v1/softdata`,
                headers: this.authHeaders(creds),
                data: this.toBookPayload(input, creds),
            },
            retries: 2,
        });
        const pkg = res.data.data?.[0];
        if (!pkg || !pkg.awb_number) {
            throw new CarrierError({
                courier: COURIER,
                operation: 'book',
                category: 'permanent',
                rawMessage: 'DTDC softdata returned no awb_number',
            });
        }
        return {
            awb: pkg.awb_number,
            courier: COURIER,
            serviceCode: input.serviceCode ?? 'B2C SMART EXPRESS',
            bookedAt: new Date(),
            costPaise: 0,
            etaDays: null,
            raw: res.data as Record<string, unknown>,
        };
    }

    async lookupByReference(
        referenceNumber: string,
        partnerId: PartnerId,
    ): Promise<{ awb: string } | null> {
        const creds = await this.creds(partnerId);
        const res = await carrierRequest<{ data?: Array<{ awb_number?: string }> }>({
            courier: COURIER,
            operation: 'lookupByReference',
            config: {
                method: 'GET',
                url: `${creds.baseUrl}/apidocs/api/v1/reference-lookup`,
                headers: this.authHeaders(creds),
                params: { reference_number: referenceNumber },
            },
            retries: 1,
        });
        const awb = res.data.data?.[0]?.awb_number;
        return awb ? { awb } : null;
    }

    async cancel(awb: string, partnerId: PartnerId): Promise<void> {
        const creds = await this.creds(partnerId);
        await carrierRequest({
            courier: COURIER,
            operation: 'cancel',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/apidocs/api/v1/softdata/cancel`,
                headers: this.authHeaders(creds),
                data: { awb_number: awb, customer_code: creds.customerCode },
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
                url: `${creds.baseUrl}/apidocs/api/v1/label`,
                headers: { ...this.authHeaders(creds), Accept: 'application/pdf' },
                params: { awb_number: awb },
                responseType: 'arraybuffer',
            },
        });
        return {
            format: 'pdf',
            bytes: new Uint8Array(res.data),
            filename: `dtdc-${awb}.pdf`,
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
                method: 'POST',
                url: `${creds.baseUrl}/apidocs/api/v1/track`,
                headers: this.authHeaders(creds),
                data: { trkType: 'cnno', strcnno: awb, addtnlDtl: 'Y' },
            },
        });
        return this.parsePollResponse(res.data);
    }

    // ─── Event-side ─────────────────────────────────────────────────

    parseWebhook(payload: unknown): readonly RawTrackingEvent[] {
        return this.parsePollResponse(payload);
    }

    parsePollResponse(payload: unknown): readonly RawTrackingEvent[] {
        const details = pickArray(payload, 'trackDetails')
            ?? pickArray(pickObject(payload, 'data'), 'trackDetails')
            ?? [];
        return details.map((d): RawTrackingEvent => ({
            source: 'dtdc',
            rawCode: pickString(d, 'strAction') ?? pickString(d, 'strStatus') ?? '',
            description: pickString(d, 'strAction') ?? pickString(d, 'strRemarks') ?? '',
            occurredAt: parseDtdcDate(
                pickString(d, 'strDateOfOperation') ?? pickString(d, 'strScanDate'),
            ),
            locationRaw: pickString(d, 'strOrigin') ?? pickString(d, 'strLocation') ?? null,
            facility: pickString(d, 'strBranch') ?? null,
            payload: d as Record<string, unknown>,
        }));
    }

    normalize(
        raw: RawTrackingEvent,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent {
        const mapping = mapDtdcScan(raw.rawCode);
        return {
            type: mapping.type,
            rawCode: raw.rawCode,
            source: 'dtdc',
            occurredAt: raw.occurredAt,
            receivedAt,
            location: { city: null, pincode: null, raw: raw.locationRaw },
            facility: raw.facility,
            description: raw.description,
            impliedStatus: impliedStatusFor(mapping.type),
            impliedReason: mapping.impliedReason ?? null,
            dedupKey: computeDedupKey({
                source: 'dtdc',
                rawCode: raw.rawCode,
                occurredAt: raw.occurredAt,
                locationRaw: raw.locationRaw,
                shipmentId,
            }),
        };
    }

    // ─── helpers ──────────────────────────────────────────────────────

    private async creds(partnerId: PartnerId): Promise<DtdcCreds> {
        const c = await this.credentials.resolve(partnerId, COURIER);
        if (!c) {
            throw new CarrierError({
                courier: COURIER,
                operation: 'quote',
                category: 'auth',
                rawMessage: 'Partner has not connected DTDC',
            });
        }
        return c as unknown as DtdcCreds;
    }

    private authHeaders(creds: DtdcCreds): Record<string, string> {
        return {
            'api-key': creds.apiKey,
            'Content-Type': 'application/json',
        };
    }

    private toBookPayload(input: BookInput, creds: DtdcCreds): unknown {
        return {
            customer_code: creds.customerCode,
            consignments: [{
                customer_code: creds.customerCode,
                service_type_id: input.serviceCode ?? 'B2C SMART EXPRESS',
                load_type: 'NON-DOCUMENT',
                reference_number: input.referenceNumber,
                origin_details: addressToDtdc(input.origin),
                destination_details: addressToDtdc(input.destination),
                pieces_count: 1,
                weight: input.parcel.weightGrams / 1000,
                length: input.parcel.dimensionsCm.length,
                breadth: input.parcel.dimensionsCm.width,
                height: input.parcel.dimensionsCm.height,
                cod_amount: input.cod ? input.cod.amountPaise / 100 : 0,
                cod_collection_mode: input.cod ? 'cash' : '',
                description: input.parcel.contents,
                declared_value: input.parcel.declaredValuePaise / 100,
            }],
        };
    }
}

// ─── pure helpers ───────────────────────────────────────────────────────

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
        case 'shipment.on_hold':          return 'on_hold';
        default:                          return null;
    }
}

function addressToDtdc(a: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; country: string }): unknown {
    return {
        name: a.name,
        phone: a.phone,
        address_line_1: a.line1,
        address_line_2: a.line2 ?? '',
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        country: a.country,
    };
}

function parseDtdcDate(raw: string | null | undefined): Date {
    if (!raw) return new Date();
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : new Date();
}

function pickString(obj: unknown, key: string): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : undefined;
}

function pickObject(obj: unknown, key: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    return (obj as Record<string, unknown>)[key];
}

function pickArray(obj: unknown, key: string): unknown[] | null {
    if (!obj || typeof obj !== 'object') return null;
    const v = (obj as Record<string, unknown>)[key];
    return Array.isArray(v) ? v : null;
}
