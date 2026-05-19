'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

// On-screen label preview + printable label. The hand-rolled PDF from
// SelfShipmentLabelGenerator is the archival artifact (downloadable
// elsewhere on this page). This component is the operator's quick visual
// + print path.
//
// Print stylesheet hides everything outside `.print-area` so the browser
// print dialog produces a clean label without page chrome.

interface Props {
    readonly trackingNumber: string;
    readonly shipmentId: string;
    readonly sender: { name: string; line1: string; city: string; state: string; pincode: string; phone: string };
    readonly receiver: { name: string; line1: string; city: string; state: string; pincode: string; phone: string };
    readonly weightGrams: number;
    readonly contents: string;
    readonly cod: { isCod: boolean; amountPaise: number };
}

export function PrintableLabel(props: Props) {
    return (
        <div>
            {/* Print-only stylesheet — hides everything except .print-area */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        padding: 0;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div className="flex items-center justify-between border-b bg-white px-4 py-3 no-print">
                <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Label preview
                </h2>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                >
                    <Printer className="size-3.5" /> Print
                </Button>
            </div>

            <div className="print-area bg-white p-4">
                <div className="mx-auto max-w-sm border-2 border-slate-900 p-4 text-slate-900">
                    {/* Brand row */}
                    <div className="mb-2 flex items-baseline justify-between border-b border-slate-300 pb-2">
                        <span className="text-lg font-bold tracking-tight">
                            BLUJAY LOGISTICS
                        </span>
                        <span className="text-xs text-slate-500">self-shipment</span>
                    </div>

                    {/* Tracking number — the big one */}
                    <div className="mb-3 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                            Tracking number
                        </p>
                        <p className="font-mono text-2xl font-bold">{props.trackingNumber}</p>
                    </div>

                    {/* From / To grid */}
                    <div className="grid gap-3 border-y border-slate-300 py-3">
                        <AddressBlock label="FROM" addr={props.sender} />
                        <AddressBlock label="TO" addr={props.receiver} />
                    </div>

                    {/* Parcel meta */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-slate-500">Weight:</span>{' '}
                            <span className="font-semibold">{props.weightGrams}g</span>
                        </div>
                        <div className="text-right">
                            <span className="text-slate-500">COD:</span>{' '}
                            <span className="font-semibold">
                                {props.cod.isCod ? `₹${(props.cod.amountPaise / 100).toFixed(2)}` : 'No'}
                            </span>
                        </div>
                        <div className="col-span-2 truncate">
                            <span className="text-slate-500">Contents:</span>{' '}
                            <span>{props.contents}</span>
                        </div>
                    </div>

                    {/* Shipment id (small, for refs) */}
                    <p className="mt-3 text-center font-mono text-[9px] text-slate-400">
                        {props.shipmentId}
                    </p>
                </div>
            </div>
        </div>
    );
}

function AddressBlock({
    label,
    addr,
}: {
    label: string;
    addr: { name: string; line1: string; city: string; state: string; pincode: string; phone: string };
}) {
    return (
        <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {label}
            </p>
            <p className="mt-0.5 text-sm font-semibold">{addr.name}</p>
            <p className="text-xs">{addr.line1}</p>
            <p className="text-xs">
                {addr.city}, {addr.state} {addr.pincode}
            </p>
            <p className="text-xs text-slate-600">📞 {addr.phone}</p>
        </div>
    );
}
