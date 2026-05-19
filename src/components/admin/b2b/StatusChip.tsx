import type { ShipmentStatus } from '@/types/b2b/shipment';

// Status colors map to operational meaning, not aesthetic preference.
//   green   = done, happy path
//   blue    = in motion, expected
//   amber   = needs attention but not urgent (undelivered, on_hold)
//   red     = problem (lost, damaged)
//   slate   = pre-flight (draft, booked, ready_for_pickup)
//   purple  = RTO flow (distinct from happy path)

const COLOR: Record<ShipmentStatus, string> = {
    draft:            'bg-slate-100 text-slate-700 border-slate-200',
    booked:           'bg-slate-100 text-slate-800 border-slate-300',
    ready_for_pickup: 'bg-slate-200 text-slate-800 border-slate-300',
    picked_up:        'bg-blue-50 text-blue-700 border-blue-200',
    in_transit:       'bg-blue-100 text-blue-800 border-blue-300',
    out_for_delivery: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    undelivered:      'bg-amber-100 text-amber-800 border-amber-300',
    delivered:        'bg-emerald-100 text-emerald-800 border-emerald-300',
    rto_initiated:    'bg-purple-50 text-purple-700 border-purple-200',
    rto_in_transit:   'bg-purple-100 text-purple-800 border-purple-300',
    rto_delivered:    'bg-purple-200 text-purple-900 border-purple-400',
    cancelled:        'bg-slate-200 text-slate-700 border-slate-300',
    lost:             'bg-red-100 text-red-800 border-red-300',
    damaged:          'bg-red-100 text-red-800 border-red-300',
    on_hold:          'bg-amber-100 text-amber-900 border-amber-300',
};

const LABEL: Record<ShipmentStatus, string> = {
    draft:            'Draft',
    booked:           'Booked',
    ready_for_pickup: 'Ready',
    picked_up:        'Picked up',
    in_transit:       'In transit',
    out_for_delivery: 'Out for delivery',
    undelivered:      'Undelivered',
    delivered:        'Delivered',
    rto_initiated:    'RTO initiated',
    rto_in_transit:   'RTO in transit',
    rto_delivered:    'RTO delivered',
    cancelled:        'Cancelled',
    lost:             'Lost',
    damaged:          'Damaged',
    on_hold:          'On hold',
};

export function StatusChip({ status }: { status: ShipmentStatus }) {
    return (
        <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${COLOR[status]}`}
        >
            {LABEL[status]}
        </span>
    );
}
