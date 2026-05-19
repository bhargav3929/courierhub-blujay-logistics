import { format, formatDistanceToNowStrict } from 'date-fns';
import type { AdminShipmentRow } from '@/types/b2b/admin';
import { FulfillmentBadge } from '../FulfillmentBadge';

// Information grid. No animation, no flair. Format: label · value.
// Dates render with both relative and absolute forms so support engineers
// don't have to compute "2 hours ago" → "what UTC time?".

export function SummaryCard({ shipment }: { shipment: AdminShipmentRow }) {
    return (
        <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Summary
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="Shipment ID" mono>{shipment.shipmentId}</Row>
                <Row label="External ref" mono>{shipment.externalRef ?? '—'}</Row>
                <Row label="Partner" mono>{shipment.partnerId}</Row>
                <Row label="Sub-client" mono>{shipment.clientId ?? '—'}</Row>
                <Row label="Source">{shipment.shipmentSource}</Row>
                <Row label="Mode">
                    <FulfillmentBadge
                        fulfillmentMode={shipment.fulfillmentMode}
                        trackingMode={shipment.trackingMode}
                    />
                </Row>
                <Row label="Courier">{shipment.courier.code ?? '—'}</Row>
                <Row label="AWB" mono>{shipment.courier.awb ?? '—'}</Row>
                <Row label="Service" mono>{shipment.courier.serviceCode ?? '—'}</Row>
                <Row label="Status reason">{shipment.statusReason ?? '—'}</Row>
                <Row label="Created">
                    <DateValue date={shipment.createdAt} />
                </Row>
                <Row label="Updated">
                    <DateValue date={shipment.updatedAt} />
                </Row>
                <Row label="Last event">
                    {shipment.lastEventAt ? <DateValue date={shipment.lastEventAt} /> : '—'}
                </Row>
            </dl>
        </section>
    );
}

function Row({
    label,
    children,
    mono,
}: {
    label: string;
    children: React.ReactNode;
    mono?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-2 border-b border-slate-50 py-1 last:border-b-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd
                className={`text-right text-sm text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}
            >
                {children}
            </dd>
        </div>
    );
}

function DateValue({ date }: { date: Date }) {
    return (
        <span title={format(date, 'yyyy-MM-dd HH:mm:ss xxx')}>
            {formatDistanceToNowStrict(date)} ago
        </span>
    );
}
