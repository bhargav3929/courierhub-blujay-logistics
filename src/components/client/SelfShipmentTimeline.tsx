'use client';

import { Package, Truck, MapPin, CheckCircle2, XCircle } from 'lucide-react';

// Map a legacy Shipment.status onto the 4-stage client-facing timeline.
// Anything off the happy path (cancelled / declined) renders a separate
// terminal state instead of the linear stepper.
type ClientStage = 'booked' | 'picked_up' | 'in_transit' | 'delivered';
type Terminal = 'cancelled' | 'declined' | null;

interface Props {
    status: string | undefined;
}

const STAGES: { key: ClientStage; label: string; icon: typeof Package }[] = [
    { key: 'booked',     label: 'Booked',     icon: Package },
    { key: 'picked_up',  label: 'Picked Up',  icon: Truck },
    { key: 'in_transit', label: 'In Transit', icon: MapPin },
    { key: 'delivered',  label: 'Delivered',  icon: CheckCircle2 },
];

function reduce(raw: string | undefined): { stage: ClientStage; terminal: Terminal } {
    const s = (raw ?? '').toLowerCase();
    if (s === 'cancelled') return { stage: 'booked', terminal: 'cancelled' };
    if (s === 'declined') return { stage: 'booked', terminal: 'declined' };
    if (s === 'delivered') return { stage: 'delivered', terminal: null };
    // Legacy maps 'transit' to in-transit; we surface picked_up if data
    // permits, but the legacy collection collapses both into 'transit'.
    if (s === 'transit' || s === 'in_transit') return { stage: 'in_transit', terminal: null };
    if (s === 'picked_up') return { stage: 'picked_up', terminal: null };
    return { stage: 'booked', terminal: null };
}

export function SelfShipmentTimeline({ status }: Props) {
    const { stage, terminal } = reduce(status);

    if (terminal) {
        return (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <XCircle className="h-5 w-5 text-rose-500 shrink-0" />
                <div>
                    <div className="text-sm font-semibold text-slate-900 capitalize">{terminal}</div>
                    <div className="text-xs text-slate-500">This shipment is no longer in transit.</div>
                </div>
            </div>
        );
    }

    const currentIdx = STAGES.findIndex(s => s.key === stage);

    return (
        <div className="w-full">
            <ol className="flex items-start justify-between gap-1 sm:gap-2">
                {STAGES.map((s, i) => {
                    const Icon = s.icon;
                    const reached = i <= currentIdx;
                    const isCurrent = i === currentIdx;
                    return (
                        <li key={s.key} className="flex-1 flex flex-col items-center gap-1.5 relative">
                            {i > 0 && (
                                <div
                                    className={`absolute top-4 sm:top-5 right-1/2 left-[-50%] h-0.5 ${
                                        reached ? 'bg-violet-500' : 'bg-slate-200'
                                    }`}
                                    aria-hidden
                                />
                            )}
                            <div
                                className={`relative z-10 h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center transition-all ${
                                    reached
                                        ? 'bg-violet-500 text-white shadow-md shadow-violet-500/30'
                                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                                } ${isCurrent ? 'ring-4 ring-violet-200' : ''}`}
                            >
                                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                            </div>
                            <div className="text-[10px] sm:text-xs font-semibold text-center leading-tight">
                                <span className={reached ? 'text-slate-900' : 'text-slate-400'}>{s.label}</span>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
