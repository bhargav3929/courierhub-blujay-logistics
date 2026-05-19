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
import { mapDelhiveryScan } from './eventMap';

interface DelhiveryCreds extends CourierCredentials {
    apiToken: string;
    clientName: string;
    pickupLocationName: string;
    baseUrl: string;             // https://staging-express.delhivery.com OR https://track.delhivery.com
    webhookSecret?: string;
}

const COURIER = 'delhivery' as const;

export class DelhiveryAdapter implements CourierAdapter {
    readonly courier = COURIER;

    constructor(private readonly credentials: CredentialsResolver) {}

    // ─── Booking-side ───────────────────────────────────────────────

    async quote(input: QuoteInput): Promise<CarrierQuote> {
        const creds = await this.creds(input.partnerId);
        const res = await carrierRequest<{ total_amount?: number }>({
            courier: COURIER,
            operation: 'quote',
            config: {
                method: 'GET',
                url: `${creds.baseUrl}/api/kinko/v1/invoice/charges/.json`,
                headers: this.authHeaders(creds),
                params: {
                    md: 'S',
                    ss: 'Delivered',
                    o_pin: input.origin.pincode,
                    d_pin: input.destination.pincode,
                    cgm: input.parcel.weightGrams,
                    pt: input.parcel.isCod ? 'COD' : 'Pre-paid',
                },
            },
        });
        return {
            courier: COURIER,
            serviceCode: input.serviceCode ?? 'S',
            totalPaise: Math.round((res.data.total_amount ?? 0) * 100),
            breakdown: {},
            currency: 'INR',
            etaDays: null,
        };
    }

    async book(input: BookInput): Promise<BookResult> {
        // Delhivery accepts a `client_reference_number` we pass as the
        // shipmentId. Reuse with the same reference returns the existing
        // waybill — native idempotency.
        const creds = await this.creds(input.partnerId);
        const body = this.toBookFormData(input, creds);
        const res = await carrierRequest<{
            packages?: Array<{ waybill?: string; refnum?: string; status?: string }>;
        }>({
            courier: COURIER,
            operation: 'book',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/api/cmu/create.json`,
                headers: {
                    ...this.authHeaders(creds),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data: body,
            },
            retries: 2,
        });
        const pkg = res.data.packages?.[0];
        const awb = pkg?.waybill;
        if (!awb) {
            throw new CarrierError({
                courier: COURIER,
                operation: 'book',
                category: 'permanent',
                rawMessage: 'Delhivery returned no waybill in package response',
            });
        }
        return {
            awb,
            courier: COURIER,
            serviceCode: input.serviceCode ?? 'S',
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
        const res = await carrierRequest<{ packages?: Array<{ waybill?: string }> }>({
            courier: COURIER,
            operation: 'lookupByReference',
            config: {
                method: 'GET',
                url: `${creds.baseUrl}/api/packages/json/`,
                headers: this.authHeaders(creds),
                params: { ref_ids: referenceNumber },
            },
            retries: 1,
        });
        const awb = res.data.packages?.[0]?.waybill;
        return awb ? { awb } : null;
    }

    async cancel(awb: string, partnerId: PartnerId): Promise<void> {
        const creds = await this.creds(partnerId);
        await carrierRequest({
            courier: COURIER,
            operation: 'cancel',
            config: {
                method: 'POST',
                url: `${creds.baseUrl}/api/p/edit`,
                headers: {
                    ...this.authHeaders(creds),
                    'Content-Type': 'application/json',
                },
                data: { waybill: awb, cancellation: 'true' },
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
                url: `${creds.baseUrl}/api/p/packing_slip`,
                headers: { ...this.authHeaders(creds), Accept: 'application/pdf' },
                params: { wbns: awb, pdf: true },
                responseType: 'arraybuffer',
            },
        });
        return {
            format: 'pdf',
            bytes: new Uint8Array(res.data),
            filename: `delhivery-${awb}.pdf`,
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
                url: `${creds.baseUrl}/api/v1/packages/json/`,
                headers: this.authHeaders(creds),
                params: { waybill: awb },
            },
        });
        return this.parsePollResponse(res.data);
    }

    // ─── Event-side ─────────────────────────────────────────────────

    parseWebhook(payload: unknown): readonly RawTrackingEvent[] {
        return this.parsePollResponse(payload);
    }

    parsePollResponse(payload: unknown): readonly RawTrackingEvent[] {
        const shipment = pickPath(payload, ['ShipmentData', 0, 'Shipment'])
            ?? pickPath(payload, ['shipmentData', 0, 'shipment']);
        if (!shipment || typeof shipment !== 'object') return [];

        const scans = pickArray(shipment, 'Scans') ?? pickArray(shipment, 'scans') ?? [];
        return scans.map((s): RawTrackingEvent => {
            const detail = pickObject(s, 'ScanDetail') ?? s;
            return {
                source: 'delhivery',
                rawCode: pickString(detail, 'Scan') ?? pickString(detail, 'Instructions') ?? '',
                description: pickString(detail, 'Instructions') ?? pickString(detail, 'Scan') ?? '',
                occurredAt: parseDelhiveryDate(pickString(detail, 'ScanDateTime')),
                locationRaw: pickString(detail, 'ScannedLocation') ?? null,
                facility: null,
                payload: s as Record<string, unknown>,
            };
        });
    }

    normalize(
        raw: RawTrackingEvent,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent {
        const mapping = mapDelhiveryScan(raw.rawCode);
        return {
            type: mapping.type,
            rawCode: raw.rawCode,
            source: 'delhivery',
            occurredAt: raw.occurredAt,
            receivedAt,
            location: { city: null, pincode: null, raw: raw.locationRaw },
            facility: raw.facility,
            description: raw.description,
            impliedStatus: impliedStatusFor(mapping.type),
            impliedReason: mapping.impliedReason ?? null,
            dedupKey: computeDedupKey({
                source: 'delhivery',
                rawCode: raw.rawCode,
                occurredAt: raw.occurredAt,
                locationRaw: raw.locationRaw,
                shipmentId,
            }),
        };
    }

    // ─── helpers ──────────────────────────────────────────────────────

    private async creds(partnerId: PartnerId): Promise<DelhiveryCreds> {
        const c = await this.credentials.resolve(partnerId, COURIER);
        if (!c) {
            throw new CarrierError({
                courier: COURIER,
                operation: 'quote',
                category: 'auth',
                rawMessage: 'Partner has not connected Delhivery',
            });
        }
        return c as unknown as DelhiveryCreds;
    }

    private authHeaders(creds: DelhiveryCreds): Record<string, string> {
        return {
            Authorization: `Token ${creds.apiToken}`,
            Accept: 'application/json',
        };
    }

    private toBookFormData(input: BookInput, creds: DelhiveryCreds): string {
        // Delhivery accepts a `format=json&data=<json>` form body.
        const data = {
            shipments: [{
                name: input.destination.name,
                add: `${input.destination.line1}${input.destination.line2 ? ', ' + input.destination.line2 : ''}`,
                pin: input.destination.pincode,
                city: input.destination.city,
                state: input.destination.state,
                country: input.destination.country,
                phone: input.destination.phone,
                order: input.referenceNumber,
                payment_mode: input.parcel.isCod ? 'COD' : 'Pre-paid',
                return_pin: input.origin.pincode,
                return_city: input.origin.city,
                return_phone: input.origin.phone,
                return_add: input.origin.line1,
                return_state: input.origin.state,
                return_country: input.origin.country,
                products_desc: input.parcel.contents,
                cod_amount: input.cod ? (input.cod.amountPaise / 100) : 0,
                order_date: new Date().toISOString(),
                total_amount: input.parcel.declaredValuePaise / 100,
                weight: input.parcel.weightGrams,
                shipment_width: input.parcel.dimensionsCm.width,
                shipment_height: input.parcel.dimensionsCm.height,
                shipment_length: input.parcel.dimensionsCm.length,
                client_reference_number: input.referenceNumber,
            }],
            pickup_location: { name: creds.pickupLocationName },
        };
        return `format=json&data=${encodeURIComponent(JSON.stringify(data))}`;
    }
}

// ─── pure helpers ───────────────────────────────────────────────────────

function impliedStatusFor(type: string): NormalizedEvent['impliedStatus'] {
    switch (type) {
        case 'shipment.manifested':       return null;        // pre-booking, no projection
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

function parseDelhiveryDate(raw: string | null | undefined): Date {
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
