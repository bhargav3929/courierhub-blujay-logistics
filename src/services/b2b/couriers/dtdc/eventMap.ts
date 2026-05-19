import type { TrackingEventType } from '@/types/b2b/tracking';

// DTDC scan codes come through `strAction` / `strStatus`. The vocabulary
// is "soft" — DTDC ships textual statuses like "Booked", "In Transit",
// "Delivered", "Hold" with reason strings appended. We normalize by
// uppercasing + matching against known prefixes.

export interface DtdcScanMapping {
    readonly type: TrackingEventType;
    readonly impliedReason?: string;
}

const DTDC_MAP: Readonly<Record<string, DtdcScanMapping>> = {
    'BOOKED':                  { type: 'shipment.booked' },
    'MANIFESTED':              { type: 'shipment.manifested' },
    'PICKUP':                  { type: 'shipment.picked_up' },
    'PICKED UP':               { type: 'shipment.picked_up' },
    'IN TRANSIT':              { type: 'shipment.in_transit' },
    'INSCAN AT BRANCH':        { type: 'shipment.arrived_at_hub' },
    'OUT FOR DELIVERY':        { type: 'shipment.out_for_delivery' },
    'OUTSCAN FROM BRANCH':     { type: 'shipment.departed_hub' },
    'DELIVERED':               { type: 'shipment.delivered' },
    'UNDELIVERED':             { type: 'shipment.undelivered', impliedReason: 'other' },
    'CONSIGNEE NOT AVAILABLE': { type: 'shipment.undelivered', impliedReason: 'customer_unavailable' },
    'CONSIGNEE REFUSED':       { type: 'shipment.undelivered', impliedReason: 'consignee_refused' },
    'PREMISES CLOSED':         { type: 'shipment.undelivered', impliedReason: 'office_closed' },
    'ADDRESS INCORRECT':       { type: 'shipment.undelivered', impliedReason: 'address_incorrect' },
    'RTO INITIATED':           { type: 'shipment.rto_initiated', impliedReason: 'repeated_undelivered' },
    'RTO IN TRANSIT':          { type: 'shipment.rto_in_transit' },
    'RTO DELIVERED':           { type: 'shipment.rto_delivered' },
    'LOST':                    { type: 'shipment.lost', impliedReason: 'lost_in_transit' },
    'DAMAGED':                 { type: 'shipment.damaged', impliedReason: 'damaged_in_transit' },
    'CANCELLED':               { type: 'shipment.cancelled' },
    'HOLD':                    { type: 'shipment.on_hold' },
};

function normalize(raw: string): string {
    return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function mapDtdcScan(rawCode: string): DtdcScanMapping {
    const normalized = normalize(rawCode);
    const direct = DTDC_MAP[normalized];
    if (direct) return direct;
    // Try prefix match (e.g. "DELIVERED TO SECURITY" → "DELIVERED")
    for (const [key, value] of Object.entries(DTDC_MAP)) {
        if (normalized.startsWith(key)) return value;
    }
    return { type: 'shipment.exception', impliedReason: 'other' };
}
