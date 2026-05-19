import type { FulfillmentMode, TrackingMode } from '@/types/b2b/shipment';

// Combined fulfillment + tracking mode chip. Compact because the table has
// a lot of columns and these two attributes are usually consulted together.

const FULFILLMENT_LABEL: Record<FulfillmentMode, string> = {
    courier: 'courier',
    self_shipment: 'self',
    pickup_only: 'pickup',
};

const TRACKING_LABEL: Record<TrackingMode, string> = {
    automatic: 'auto',
    manual: 'manual',
    hybrid: 'hybrid',
};

export function FulfillmentBadge({
    fulfillmentMode,
    trackingMode,
}: {
    fulfillmentMode: FulfillmentMode;
    trackingMode: TrackingMode;
}) {
    return (
        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
            <span className="rounded bg-slate-100 px-1.5 py-0.5">
                {FULFILLMENT_LABEL[fulfillmentMode]}
            </span>
            <span className="text-slate-400">·</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5">
                {TRACKING_LABEL[trackingMode]}
            </span>
        </span>
    );
}
