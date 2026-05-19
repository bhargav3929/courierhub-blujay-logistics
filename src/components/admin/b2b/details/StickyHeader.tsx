import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { AdminShipmentRow } from '@/types/b2b/admin';
import { StatusChip } from '../StatusChip';
import { CourierChip } from '../CourierChip';

// Sticky operational header. Always visible while scrolling. Carries the
// minimum an operator needs to keep oriented while inspecting deep into
// the page: shipment id, partner, status chip, courier+AWB, back link.

export function StickyHeader({ shipment }: { shipment: AdminShipmentRow }) {
    return (
        <header className="sticky top-0 z-10 border-b bg-white px-4 py-3 md:py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                    href="/b2b/shipments"
                    className="inline-flex items-center text-xs text-slate-500 hover:text-slate-700"
                >
                    <ChevronLeft className="size-3.5" /> Shipments
                </Link>

                <span className="font-mono text-sm font-medium text-slate-900">
                    {shipment.shipmentId}
                </span>

                <StatusChip status={shipment.status} />

                {shipment.courier.awb && (
                    <div className="flex items-center gap-1.5">
                        <CourierChip code={shipment.courier.code} />
                        <span className="font-mono text-xs text-slate-700">
                            {shipment.courier.awb}
                        </span>
                    </div>
                )}

                <span className="font-mono text-xs text-slate-500">
                    partner:&nbsp;{shipment.partnerId}
                </span>

                {shipment.statusReason && (
                    <span className="text-xs text-amber-700">
                        reason: {shipment.statusReason}
                    </span>
                )}
            </div>
        </header>
    );
}
