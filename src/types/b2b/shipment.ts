import type { AddressInput, ParcelInput } from './address';

// ─── enums (string unions derived from arrays for exhaustive iteration) ──

export const ALL_SHIPMENT_SOURCES = [
    'b2b_api',
    'self_shipment',
    'webhook_b2c',
    'manual',
] as const;
export type ShipmentSource = typeof ALL_SHIPMENT_SOURCES[number];

export const ALL_FULFILLMENT_MODES = [
    'courier',
    'self_shipment',
    'pickup_only',
] as const;
export type FulfillmentMode = typeof ALL_FULFILLMENT_MODES[number];

export const ALL_TRACKING_MODES = [
    'automatic',
    'manual',
    'hybrid',
] as const;
export type TrackingMode = typeof ALL_TRACKING_MODES[number];

export const ALL_COURIER_CODES = [
    'bluedart',
    'delhivery',
    'dtdc',
] as const;
export type CourierCode = typeof ALL_COURIER_CODES[number];

export const ALL_SHIPMENT_STATUSES = [
    'draft',
    'booked',
    'ready_for_pickup',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'undelivered',
    'delivered',
    'rto_initiated',
    'rto_in_transit',
    'rto_delivered',
    'cancelled',
    'lost',
    'damaged',
    'on_hold',
] as const;
export type ShipmentStatus = typeof ALL_SHIPMENT_STATUSES[number];

// Terminal = no transitions out (except `correct_status` admin override).
export const TERMINAL_STATUSES: ReadonlySet<ShipmentStatus> = new Set<ShipmentStatus>([
    'delivered',
    'rto_delivered',
    'cancelled',
    'lost',
    'damaged',
]);

export const isTerminalStatus = (s: ShipmentStatus): boolean =>
    TERMINAL_STATUSES.has(s);

// ─── runtime type guards ─────────────────────────────────────────────────

const STATUS_SET: ReadonlySet<string> = new Set(ALL_SHIPMENT_STATUSES);
const FULFILLMENT_SET: ReadonlySet<string> = new Set(ALL_FULFILLMENT_MODES);
const TRACKING_SET: ReadonlySet<string> = new Set(ALL_TRACKING_MODES);
const COURIER_SET: ReadonlySet<string> = new Set(ALL_COURIER_CODES);

export const isShipmentStatus = (s: string): s is ShipmentStatus => STATUS_SET.has(s);
export const isFulfillmentMode = (s: string): s is FulfillmentMode => FULFILLMENT_SET.has(s);
export const isTrackingMode = (s: string): s is TrackingMode => TRACKING_SET.has(s);
export const isCourierCode = (s: string): s is CourierCode => COURIER_SET.has(s);

// ─── input shapes ────────────────────────────────────────────────────────

export interface CreateShipmentInput {
    externalRef?: string;
    clientId?: string;
    fulfillmentMode: FulfillmentMode;
    trackingMode?: TrackingMode;
    preferredCourier?: CourierCode;
    origin: AddressInput;
    destination: AddressInput;
    returnAddress?: AddressInput;
    parcel: ParcelInput;
    metadata?: Record<string, unknown>;
}
