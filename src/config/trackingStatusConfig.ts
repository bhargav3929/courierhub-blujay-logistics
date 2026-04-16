// Tracking Status Configuration
// Maps raw courier tracking statuses to normalized display statuses

export type TrackingStatus =
    | 'booked'
    | 'picked_up'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'delivery_failed'
    | 'rto_initiated'
    | 'rto_in_transit'
    | 'rto_delivered'
    | 'cancelled'
    | 'on_hold'
    | 'lost';

export interface TrackingStatusDisplay {
    label: string;
    bg: string;
    text: string;
    border: string;
    dotColor: string;
}

// Display config for each normalized status
export const TRACKING_STATUS_DISPLAY: Record<TrackingStatus, TrackingStatusDisplay> = {
    booked: {
        label: 'Booked',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        dotColor: 'bg-blue-500',
    },
    picked_up: {
        label: 'Picked Up',
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        dotColor: 'bg-indigo-500',
    },
    in_transit: {
        label: 'In Transit',
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        dotColor: 'bg-amber-500',
    },
    out_for_delivery: {
        label: 'Out for Delivery',
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: 'border-orange-200',
        dotColor: 'bg-orange-500',
    },
    delivered: {
        label: 'Delivered',
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dotColor: 'bg-emerald-500',
    },
    delivery_failed: {
        label: 'Delivery Failed',
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
        dotColor: 'bg-red-500',
    },
    rto_initiated: {
        label: 'RTO Initiated',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dotColor: 'bg-purple-500',
    },
    rto_in_transit: {
        label: 'RTO In Transit',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        dotColor: 'bg-purple-500',
    },
    rto_delivered: {
        label: 'RTO Delivered',
        bg: 'bg-fuchsia-50',
        text: 'text-fuchsia-700',
        border: 'border-fuchsia-200',
        dotColor: 'bg-fuchsia-500',
    },
    cancelled: {
        label: 'Cancelled',
        bg: 'bg-gray-100',
        text: 'text-gray-600',
        border: 'border-gray-200',
        dotColor: 'bg-gray-400',
    },
    on_hold: {
        label: 'On Hold',
        bg: 'bg-yellow-50',
        text: 'text-yellow-700',
        border: 'border-yellow-200',
        dotColor: 'bg-yellow-500',
    },
    lost: {
        label: 'Lost',
        bg: 'bg-red-100',
        text: 'text-red-800',
        border: 'border-red-300',
        dotColor: 'bg-red-600',
    },
};

// Blue Dart raw status → normalized status mapping
// Keys are lowercased for case-insensitive matching
const BLUE_DART_STATUS_MAP: Record<string, TrackingStatus> = {
    // Booked
    'soft data upload': 'booked',
    'shipment soft data upload': 'booked',
    'generated': 'booked',
    'softdata upload': 'booked',
    'data upload': 'booked',

    // Picked Up
    'shipment picked up': 'picked_up',
    'picked up': 'picked_up',
    'pickup completed': 'picked_up',

    // In Transit
    'in transit': 'in_transit',
    'in transit to hub': 'in_transit',
    'consignment in transit': 'in_transit',
    'consignment under transportation': 'in_transit',
    'processed at facility': 'in_transit',
    'arrived at destination hub': 'in_transit',
    'in-scan at hub': 'in_transit',
    'inscan at hub': 'in_transit',
    'outscan from hub': 'in_transit',
    'shipment in transit': 'in_transit',
    'departed from facility': 'in_transit',
    'arrived at facility': 'in_transit',
    'network delay, will impact delivery': 'in_transit',
    'flight/vehicle/train delayed/cancelled': 'in_transit',
    'shipment redirected': 'in_transit',
    'package received': 'in_transit',
    'received at origin': 'in_transit',
    'manifested': 'in_transit',

    // Out for Delivery
    'out for delivery': 'out_for_delivery',
    'out for delivery (ofd)': 'out_for_delivery',
    'ofd': 'out_for_delivery',

    // Delivered
    'shipment delivered': 'delivered',
    'delivered': 'delivered',
    'delivery confirmed': 'delivered',

    // Delivery Failed (NDR)
    'delivery attempted': 'delivery_failed',
    'delivery attempted-consignee premises closed': 'delivery_failed',
    'delivery attempted - consignee premises closed': 'delivery_failed',
    'customer not available': 'delivery_failed',
    'address issue': 'delivery_failed',
    'non-delivery': 'delivery_failed',
    'non delivery': 'delivery_failed',
    'undelivered': 'delivery_failed',
    'delivery failed': 'delivery_failed',
    'unable to deliver': 'delivery_failed',
    'consignee refused': 'delivery_failed',
    'incorrect address': 'delivery_failed',
    'premises closed': 'delivery_failed',

    // RTO
    'return to hub': 'rto_initiated',
    'rto': 'rto_initiated',
    'rto initiated': 'rto_initiated',
    'return to origin': 'rto_initiated',
    'rto in transit': 'rto_in_transit',
    'rto shipment in transit': 'rto_in_transit',
    'rto delivered': 'rto_delivered',
    'returned to sender': 'rto_delivered',

    // On Hold
    'held': 'on_hold',
    'exception': 'on_hold',
    'on hold': 'on_hold',
    'shipment held': 'on_hold',
    'customs clearance': 'on_hold',

    // Cancelled
    'cancelled': 'cancelled',
    'canceled': 'cancelled',

    // Lost
    'lost': 'lost',
    'shipment lost': 'lost',
};

// DTDC raw status → normalized status mapping
const DTDC_STATUS_MAP: Record<string, TrackingStatus> = {
    // Booked
    'booked': 'booked',
    'manifested': 'booked',
    'softdata upload': 'booked',

    // Picked Up
    'picked up': 'picked_up',
    'pickup done': 'picked_up',

    // In Transit
    'in transit': 'in_transit',
    'dispatched': 'in_transit',
    'received at': 'in_transit',
    'in-transit': 'in_transit',
    'arrived at destination': 'in_transit',
    'departed from': 'in_transit',

    // Out for Delivery
    'out for delivery': 'out_for_delivery',

    // Delivered
    'delivered': 'delivered',
    'shipment delivered': 'delivered',

    // Delivery Failed
    'undelivered': 'delivery_failed',
    'not delivered': 'delivery_failed',
    'delivery attempted': 'delivery_failed',

    // RTO
    'rto': 'rto_initiated',
    'rto initiated': 'rto_initiated',
    'rto in-transit': 'rto_in_transit',
    'rto in transit': 'rto_in_transit',
    'rto delivered': 'rto_delivered',

    // Cancelled
    'cancelled': 'cancelled',

    // On Hold
    'on hold': 'on_hold',
    'held': 'on_hold',
};

/**
 * Normalize a raw courier tracking status to a TrackingStatus enum value.
 * Uses fuzzy partial matching when exact match fails.
 */
export function normalizeTrackingStatus(rawStatus: string, courier: string): TrackingStatus {
    if (!rawStatus) return 'booked';

    const statusLower = rawStatus.toLowerCase().trim();
    const map = courier === 'DTDC' ? DTDC_STATUS_MAP : BLUE_DART_STATUS_MAP;

    // Exact match
    if (map[statusLower]) return map[statusLower];

    // Partial match — check if raw status contains any known key
    for (const [key, value] of Object.entries(map)) {
        if (statusLower.includes(key) || key.includes(statusLower)) {
            return value;
        }
    }

    // Keyword fallback — detect from common words in the status
    if (statusLower.includes('deliver') && (statusLower.includes('attempt') || statusLower.includes('fail') || statusLower.includes('undeliver'))) return 'delivery_failed';
    if (statusLower.includes('delivered')) return 'delivered';
    if (statusLower.includes('out for delivery') || statusLower.includes('ofd')) return 'out_for_delivery';
    if (statusLower.includes('rto') && statusLower.includes('delivered')) return 'rto_delivered';
    if (statusLower.includes('rto') && statusLower.includes('transit')) return 'rto_in_transit';
    if (statusLower.includes('rto') || statusLower.includes('return')) return 'rto_initiated';
    if (statusLower.includes('transit') || statusLower.includes('dispatch') || statusLower.includes('arrived') || statusLower.includes('departed')) return 'in_transit';
    if (statusLower.includes('picked') || statusLower.includes('pickup')) return 'picked_up';
    if (statusLower.includes('cancel')) return 'cancelled';
    if (statusLower.includes('hold') || statusLower.includes('exception')) return 'on_hold';
    if (statusLower.includes('lost')) return 'lost';

    // Default: if we have an AWB, it's at least booked
    return 'in_transit';
}

/**
 * Get display config for a tracking status.
 * Falls back gracefully if status is unknown.
 */
export function getTrackingDisplay(status: TrackingStatus | string | undefined): TrackingStatusDisplay {
    if (!status) {
        return TRACKING_STATUS_DISPLAY.booked;
    }
    return TRACKING_STATUS_DISPLAY[status as TrackingStatus] || TRACKING_STATUS_DISPLAY.in_transit;
}

/**
 * Map old Shipment.status to a TrackingStatus for backward compatibility.
 * Used when trackingStatus is not yet populated.
 */
export function legacyStatusToTracking(status: string): TrackingStatus {
    switch (status) {
        case 'pending':
        case 'shopify_pending':
            return 'booked';
        case 'transit':
            return 'in_transit';
        case 'delivered':
            return 'delivered';
        case 'cancelled':
        case 'declined':
            return 'cancelled';
        default:
            return 'booked';
    }
}
