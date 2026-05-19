import type { ShipmentStatus } from './shipment';

// ─── event types (carrier-agnostic vocabulary) ───────────────────────────

export const ALL_TRACKING_EVENT_TYPES = [
    'shipment.created',
    'shipment.booked',
    'shipment.label_generated',
    'shipment.manifested',
    'shipment.picked_up',
    'shipment.in_transit',
    'shipment.arrived_at_hub',
    'shipment.departed_hub',
    'shipment.out_for_delivery',
    'shipment.delivery_attempted',
    'shipment.delivered',
    'shipment.undelivered',
    'shipment.rto_initiated',
    'shipment.rto_in_transit',
    'shipment.rto_delivered',
    'shipment.cancelled',
    'shipment.lost',
    'shipment.damaged',
    'shipment.on_hold',
    'shipment.exception',
] as const;
export type TrackingEventType = typeof ALL_TRACKING_EVENT_TYPES[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(ALL_TRACKING_EVENT_TYPES);
export const isTrackingEventType = (s: string): s is TrackingEventType =>
    EVENT_TYPE_SET.has(s);

// ─── event sources ───────────────────────────────────────────────────────

export const ALL_EVENT_SOURCES = [
    'bluedart',
    'delhivery',
    'dtdc',
    'partner_api',
    'admin_ui',
    'system',
] as const;
export type EventSource = typeof ALL_EVENT_SOURCES[number];

// ─── raw vs normalized ───────────────────────────────────────────────────

export interface NormalizedLocation {
    readonly city: string | null;
    readonly pincode: string | null;
    readonly raw: string | null;
}

// What the courier adapter (or partner API endpoint) hands to the ingestor
// before normalization. The `payload` field preserves the original wire
// format for audit and contract-drift investigation.
export interface RawTrackingEvent {
    readonly source: EventSource;
    readonly rawCode: string;
    readonly description: string;
    readonly occurredAt: Date;
    readonly locationRaw: string | null;
    readonly facility: string | null;
    readonly payload: Readonly<Record<string, unknown>>;
}

// What the EventIngestor produces and the state machine consumes.
// `dedupKey` is sha256(source|rawCode|occurredAt|locationRaw|shipmentId).
export interface NormalizedEvent {
    readonly type: TrackingEventType;
    readonly rawCode: string;
    readonly source: EventSource;
    readonly occurredAt: Date;
    readonly receivedAt: Date;
    readonly location: NormalizedLocation;
    readonly facility: string | null;
    readonly description: string;
    readonly impliedStatus: ShipmentStatus | null;
    readonly impliedReason: string | null;
    readonly dedupKey: string;
}
