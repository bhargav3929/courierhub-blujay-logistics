import type {
    BookInput,
    BookResult,
    CarrierLabel,
    CarrierQuote,
    CourierAdapter,
    QuoteInput,
} from '../../../src/types/b2b/courier-adapter';
import type { PartnerId, ShipmentId } from '../../../src/types/b2b/ids';
import type { CourierCode } from '../../../src/types/b2b/shipment';
import type { NormalizedEvent, RawTrackingEvent, TrackingEventType } from '../../../src/types/b2b/tracking';
import { CarrierError } from '../../../src/services/b2b/couriers/shared/carrierErrors';
import { computeDedupKey } from '../../../src/services/b2b/tracking/dedupKey';

// Configurable mock of CourierAdapter for integration tests.
//
// Each operation has a `behavior` field tests set to control outcome.
// Call counts are exposed for assertions. AWB is deterministic per
// instance unless overridden.
//
// This adapter never touches a network. It's registered through the
// existing registry and used in place of BlueDart/Delhivery/DTDC. The
// rest of the platform — saga, ingestor, polling worker — is unmodified.

export type BookBehavior =
    | 'success'
    | 'transient_failure'
    | 'permanent_failure'
    | 'timeout_indeterminate';

export type QuoteBehavior = 'success' | 'transient_failure' | 'permanent_failure';
export type CancelBehavior = 'success' | 'transient_failure' | 'permanent_failure';
export type LabelBehavior = 'success' | 'transient_failure' | 'permanent_failure';
export type PollBehavior = 'success' | 'no_events' | 'transient_failure';
export type LookupBehavior = 'found' | 'not_found' | 'transient_failure';

export class MockCourierAdapter implements CourierAdapter {
    readonly courier: CourierCode;

    // Configurable per-operation behavior — set by tests.
    public bookBehavior: BookBehavior = 'success';
    public quoteBehavior: QuoteBehavior = 'success';
    public cancelBehavior: CancelBehavior = 'success';
    public labelBehavior: LabelBehavior = 'success';
    public pollBehavior: PollBehavior = 'no_events';
    public lookupBehavior: LookupBehavior = 'not_found';

    // Call counters — tests assert these.
    public quoteCount = 0;
    public bookCount = 0;
    public cancelCount = 0;
    public labelCount = 0;
    public pollCount = 0;
    public lookupCount = 0;

    // Predetermined data.
    public nextAwb: string = `AWB-MOCK-${Date.now().toString(36).toUpperCase()}`;
    public pollEvents: readonly RawTrackingEvent[] = [];

    // For "found" lookups, this is the AWB returned.
    public lookupAwb: string | null = null;

    constructor(courier: CourierCode) {
        this.courier = courier;
    }

    reset(): void {
        this.bookBehavior = 'success';
        this.quoteBehavior = 'success';
        this.cancelBehavior = 'success';
        this.labelBehavior = 'success';
        this.pollBehavior = 'no_events';
        this.lookupBehavior = 'not_found';
        this.quoteCount = 0;
        this.bookCount = 0;
        this.cancelCount = 0;
        this.labelCount = 0;
        this.pollCount = 0;
        this.lookupCount = 0;
        this.pollEvents = [];
        this.lookupAwb = null;
    }

    // ─── booking-side ──────────────────────────────────────────────

    async quote(_input: QuoteInput): Promise<CarrierQuote> {
        this.quoteCount += 1;
        if (this.quoteBehavior === 'permanent_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'quote',
                category: 'permanent', httpStatus: 400, rawMessage: 'mock quote refused',
            });
        }
        if (this.quoteBehavior === 'transient_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'quote',
                category: 'transient', httpStatus: 503, rawMessage: 'mock quote unavailable',
            });
        }
        return {
            courier: this.courier,
            serviceCode: 'STD',
            totalPaise: 10_000,
            breakdown: { fuelSurcharge: 1_500, gst: 1_800 },
            currency: 'INR',
            etaDays: 3,
        };
    }

    async book(input: BookInput): Promise<BookResult> {
        this.bookCount += 1;
        if (this.bookBehavior === 'permanent_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'book',
                category: 'permanent', httpStatus: 422, rawMessage: 'mock book rejected',
            });
        }
        if (this.bookBehavior === 'transient_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'book',
                category: 'transient', httpStatus: 503, rawMessage: 'mock book unavailable',
            });
        }
        if (this.bookBehavior === 'timeout_indeterminate') {
            // Carrier-side may or may not have accepted; saga should call
            // lookupByReference next.
            throw new CarrierError({
                courier: this.courier, operation: 'book',
                category: 'transient', rawMessage: 'mock book timeout (indeterminate)',
            });
        }
        return {
            awb: this.nextAwb,
            courier: this.courier,
            serviceCode: input.serviceCode ?? 'STD',
            bookedAt: new Date(),
            costPaise: 10_000,
            etaDays: 3,
            raw: { mock: true, reference: input.referenceNumber },
        };
    }

    async lookupByReference(
        _ref: string,
        _partnerId: PartnerId,
    ): Promise<{ awb: string } | null> {
        this.lookupCount += 1;
        if (this.lookupBehavior === 'transient_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'lookupByReference',
                category: 'transient', rawMessage: 'mock lookup unavailable',
            });
        }
        if (this.lookupBehavior === 'found') {
            return { awb: this.lookupAwb ?? this.nextAwb };
        }
        return null;
    }

    async cancel(_awb: string, _partnerId: PartnerId): Promise<void> {
        this.cancelCount += 1;
        if (this.cancelBehavior === 'permanent_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'cancel',
                category: 'permanent', rawMessage: 'mock cancel rejected',
            });
        }
        if (this.cancelBehavior === 'transient_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'cancel',
                category: 'transient', rawMessage: 'mock cancel unavailable',
            });
        }
    }

    async generateLabel(awb: string, _partnerId: PartnerId): Promise<CarrierLabel> {
        this.labelCount += 1;
        if (this.labelBehavior === 'permanent_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'generateLabel',
                category: 'permanent', rawMessage: 'mock label not available',
            });
        }
        if (this.labelBehavior === 'transient_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'generateLabel',
                category: 'transient', rawMessage: 'mock label transient',
            });
        }
        // Minimal PDF bytes — enough to be a valid file.
        const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
        return { format: 'pdf', bytes, filename: `mock-${awb}.pdf` };
    }

    async pollStatus(
        _awb: string,
        _partnerId: PartnerId,
    ): Promise<readonly RawTrackingEvent[]> {
        this.pollCount += 1;
        if (this.pollBehavior === 'transient_failure') {
            throw new CarrierError({
                courier: this.courier, operation: 'pollStatus',
                category: 'transient', rawMessage: 'mock poll unavailable',
            });
        }
        if (this.pollBehavior === 'no_events') return [];
        return this.pollEvents;
    }

    // ─── event-side ─────────────────────────────────────────────────

    parseWebhook(payload: unknown): readonly RawTrackingEvent[] {
        // Accept tests' direct shape: { events: RawTrackingEvent[] }.
        if (
            payload && typeof payload === 'object' &&
            Array.isArray((payload as { events?: unknown }).events)
        ) {
            return (payload as { events: RawTrackingEvent[] }).events;
        }
        return [];
    }

    parsePollResponse(payload: unknown): readonly RawTrackingEvent[] {
        return this.parseWebhook(payload);
    }

    normalize(
        raw: RawTrackingEvent,
        shipmentId: ShipmentId,
        receivedAt: Date,
    ): NormalizedEvent {
        const type = (raw.rawCode as TrackingEventType) || 'shipment.exception';
        return {
            type,
            rawCode: raw.rawCode,
            source: this.courier,
            occurredAt: raw.occurredAt,
            receivedAt,
            location: { city: null, pincode: null, raw: raw.locationRaw },
            facility: raw.facility,
            description: raw.description,
            impliedStatus: impliedStatusFor(type),
            impliedReason: null,
            dedupKey: computeDedupKey({
                source: this.courier,
                rawCode: raw.rawCode,
                occurredAt: raw.occurredAt,
                locationRaw: raw.locationRaw,
                shipmentId,
            }),
        };
    }
}

function impliedStatusFor(type: TrackingEventType): NormalizedEvent['impliedStatus'] {
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
