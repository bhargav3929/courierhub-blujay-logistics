import type { TrackingEventType } from '@/types/b2b/tracking';

// Delhivery returns scan statuses as text strings ("Manifested", "In Transit",
// "Dispatched", "Delivered", "RTO", "Lost", etc.) and a sub-instruction field
// for failure reasons. We normalize the text by uppercasing + collapsing.

export interface DelhiveryScanMapping {
    readonly type: TrackingEventType;
    readonly impliedReason?: string;
}

const DELHIVERY_MAP: Readonly<Record<string, DelhiveryScanMapping>> = {
    'MANIFESTED':              { type: 'shipment.manifested' },
    'PICKED UP':               { type: 'shipment.picked_up' },
    'IN TRANSIT':              { type: 'shipment.in_transit' },
    'DISPATCHED':              { type: 'shipment.out_for_delivery' },
    'OUT FOR DELIVERY':        { type: 'shipment.out_for_delivery' },
    'DELIVERED':               { type: 'shipment.delivered' },
    'UNDELIVERED':             { type: 'shipment.undelivered', impliedReason: 'other' },
    'CONSIGNEE REFUSED':       { type: 'shipment.undelivered', impliedReason: 'consignee_refused' },
    'NO ATTEMPT':              { type: 'shipment.undelivered', impliedReason: 'customer_unavailable' },
    'INCORRECT ADDRESS':       { type: 'shipment.undelivered', impliedReason: 'address_incorrect' },
    'COD NOT READY':           { type: 'shipment.undelivered', impliedReason: 'cod_refused' },
    'RTO':                     { type: 'shipment.rto_initiated', impliedReason: 'repeated_undelivered' },
    'RTO IN TRANSIT':          { type: 'shipment.rto_in_transit' },
    'RTO DELIVERED':           { type: 'shipment.rto_delivered' },
    'LOST':                    { type: 'shipment.lost', impliedReason: 'lost_in_transit' },
    'DAMAGED':                 { type: 'shipment.damaged', impliedReason: 'damaged_in_transit' },
    'CANCELLED':               { type: 'shipment.cancelled' },
};

function normalize(raw: string): string {
    return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function mapDelhiveryScan(rawCode: string): DelhiveryScanMapping {
    const direct = DELHIVERY_MAP[normalize(rawCode)];
    if (direct) return direct;
    return { type: 'shipment.exception', impliedReason: 'other' };
}
