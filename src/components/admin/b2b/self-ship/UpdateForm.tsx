'use client';

import { format, formatDistanceToNowStrict } from 'date-fns';
import type { AdminShipmentRow } from '@/types/b2b/admin';
import { StatusChip } from '../StatusChip';
import { NextStatusButtons } from './NextStatusButtons';

// Mobile-friendly manual status update view. Shows just enough context
// (current status, AWB if any, last event time) for the operator to know
// they're updating the right shipment — then the big transition buttons.
//
// Layout: single column. The header is NOT sticky here (mobile keyboards
// already eat real estate when a confirmation dialog appears).

export function UpdateForm({ shipment }: { shipment: AdminShipmentRow }) {
    return (
        <div className="flex h-full flex-col">
            <header className="border-b bg-white px-4 py-4">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <h1 className="text-base font-semibold text-slate-900">
                            Update shipment
                        </h1>
                        <span className="font-mono text-xs text-slate-500">
                            {shipment.shipmentId}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="text-xs text-slate-500">Current:</span>
                        <StatusChip status={shipment.status} />
                        {shipment.statusReason && (
                            <span className="text-xs text-slate-500">
                                ({shipment.statusReason})
                            </span>
                        )}
                    </div>
                    {shipment.lastEventAt && (
                        <p className="text-xs text-slate-500">
                            Last event {formatDistanceToNowStrict(shipment.lastEventAt)} ago
                            {' · '}
                            <span title={format(shipment.lastEventAt, 'yyyy-MM-dd HH:mm xxx')}>
                                {format(shipment.lastEventAt, 'HH:mm')}
                            </span>
                        </p>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-auto p-4">
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Next status
                </h2>
                <NextStatusButtons
                    shipmentId={shipment.shipmentId}
                    partnerId={shipment.partnerId}
                    currentStatus={shipment.status}
                    fulfillmentMode={shipment.fulfillmentMode}
                    trackingMode={shipment.trackingMode}
                />
            </main>
        </div>
    );
}
