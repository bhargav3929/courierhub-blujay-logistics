import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import type { AdminShipmentRow } from '@/types/b2b/admin';
import { StatusChip } from './StatusChip';
import { CourierChip } from './CourierChip';
import { FulfillmentBadge } from './FulfillmentBadge';
import { IndicatorBadges } from './IndicatorBadges';

// Pure presentation. Server component — no client hooks. Click a row to
// drill into the details page.
//
// `linkBase` controls where row clicks navigate. Defaults to the admin
// detail route. Client/partner views pass their own base (e.g. /client-b2b-shipments).

export function ShipmentTable({
    rows,
    linkBase = '/b2b/shipments',
    hidePartnerColumn = false,
}: {
    rows: readonly AdminShipmentRow[];
    linkBase?: string;
    hidePartnerColumn?: boolean;
}) {
    if (rows.length === 0) {
        return (
            <div className="flex flex-1 items-center justify-center bg-slate-50 py-16">
                <p className="text-sm text-slate-500">
                    No shipments match the current filters.
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-slate-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2">Shipment</th>
                        {!hidePartnerColumn && <th className="px-3 py-2">Partner</th>}
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Courier · AWB</th>
                        <th className="px-3 py-2">Mode</th>
                        <th className="px-3 py-2">Last event</th>
                        <th className="px-3 py-2">Created</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.shipmentId}
                            className="border-b last:border-b-0 hover:bg-slate-50"
                        >
                            <td className="px-3 py-2 align-middle">
                                <IndicatorBadges row={row} />
                            </td>
                            <td className="px-3 py-2 align-middle font-mono text-xs">
                                <Link
                                    href={`${linkBase}/${row.shipmentId}`}
                                    className="text-slate-900 hover:underline"
                                >
                                    {row.shipmentId}
                                </Link>
                                {row.externalRef && (
                                    <div className="text-xs text-slate-400">
                                        ref: {row.externalRef}
                                    </div>
                                )}
                            </td>
                            {!hidePartnerColumn && (
                                <td className="px-3 py-2 align-middle font-mono text-xs text-slate-600">
                                    {row.partnerId}
                                    {row.clientId && (
                                        <div className="text-xs text-slate-400">
                                            / {row.clientId}
                                        </div>
                                    )}
                                </td>
                            )}
                            <td className="px-3 py-2 align-middle">
                                <StatusChip status={row.status} />
                                {row.statusReason && (
                                    <div className="mt-0.5 text-[11px] text-slate-400">
                                        {row.statusReason}
                                    </div>
                                )}
                            </td>
                            <td className="px-3 py-2 align-middle">
                                <div className="flex items-center gap-2">
                                    <CourierChip code={row.courier.code} />
                                    {row.courier.awb && (
                                        <span className="font-mono text-xs text-slate-700">
                                            {row.courier.awb}
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-3 py-2 align-middle">
                                <FulfillmentBadge
                                    fulfillmentMode={row.fulfillmentMode}
                                    trackingMode={row.trackingMode}
                                />
                            </td>
                            <td className="px-3 py-2 align-middle text-xs text-slate-600">
                                {row.lastEventAt
                                    ? `${formatDistanceToNowStrict(row.lastEventAt)} ago`
                                    : '—'}
                            </td>
                            <td className="px-3 py-2 align-middle text-xs text-slate-500">
                                {formatDistanceToNowStrict(row.createdAt)} ago
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
