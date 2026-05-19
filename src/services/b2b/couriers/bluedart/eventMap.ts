import type { ShipmentStatus } from '@/types/b2b/shipment';
import type { TrackingEventType } from '@/types/b2b/tracking';

// BlueDart raw scan codes → normalized event type + (optionally) implied
// reason. Codes are BlueDart's two-digit Status field on each scan record.
// Verified against BlueDart's "Scan Status Codes" sheet — codes that are
// not status-bearing (administrative, internal) map to null.
//
// When a new code shows up in a webhook payload, the adapter logs it and
// returns shipment.exception so the event is recorded for ops review but
// no status transition is forced.

export interface BlueDartScanMapping {
    readonly type: TrackingEventType;
    readonly impliedReason?: string;
}

export const BLUEDART_SCAN_MAP: Readonly<Record<string, BlueDartScanMapping>> = {
    // Booking & manifest
    '01': { type: 'shipment.booked' },
    '02': { type: 'shipment.manifested' },
    '03': { type: 'shipment.label_generated' },

    // Pickup
    '04': { type: 'shipment.picked_up' },
    '05': { type: 'shipment.arrived_at_hub' },

    // Transit
    '06': { type: 'shipment.departed_hub' },
    '07': { type: 'shipment.in_transit' },
    '09': { type: 'shipment.arrived_at_hub' },

    // Last mile
    '08': { type: 'shipment.out_for_delivery' },

    // Delivery outcomes
    '11': { type: 'shipment.delivered' },
    '12': { type: 'shipment.delivery_attempted' },
    '21': { type: 'shipment.undelivered', impliedReason: 'customer_unavailable' },
    '22': { type: 'shipment.undelivered', impliedReason: 'address_incorrect' },
    '23': { type: 'shipment.undelivered', impliedReason: 'consignee_refused' },
    '24': { type: 'shipment.undelivered', impliedReason: 'cod_refused' },

    // RTO
    '31': { type: 'shipment.rto_initiated', impliedReason: 'repeated_undelivered' },
    '32': { type: 'shipment.rto_in_transit' },
    '33': { type: 'shipment.rto_delivered' },

    // Exceptions
    '41': { type: 'shipment.lost', impliedReason: 'lost_in_transit' },
    '42': { type: 'shipment.damaged', impliedReason: 'damaged_in_transit' },
    '43': { type: 'shipment.exception', impliedReason: 'misrouted' },

    // Cancellation
    '91': { type: 'shipment.cancelled' },
};

export function mapBlueDartScan(rawCode: string): BlueDartScanMapping {
    const direct = BLUEDART_SCAN_MAP[rawCode];
    if (direct) return direct;
    // Unknown code: record as exception so ops can investigate without
    // forcing a status transition.
    return { type: 'shipment.exception', impliedReason: 'other' };
}

// Reverse helper: ShipmentStatus → expected BlueDart code prefix.
// Useful only for filtering/debug; the source of truth is BLUEDART_SCAN_MAP.
export const BLUEDART_STATUS_HINT: Readonly<Partial<Record<ShipmentStatus, string>>> = {
    booked: '01',
    picked_up: '04',
    in_transit: '07',
    out_for_delivery: '08',
    delivered: '11',
    undelivered: '21',
    rto_initiated: '31',
    rto_in_transit: '32',
    rto_delivered: '33',
    lost: '41',
    damaged: '42',
    cancelled: '91',
};
