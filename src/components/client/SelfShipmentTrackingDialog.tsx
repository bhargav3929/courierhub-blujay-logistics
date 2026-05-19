'use client';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Shipment } from '@/types/types';
import { SelfShipmentTimeline } from './SelfShipmentTimeline';
import { Package, MapPin, Phone, Calendar, FileText, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
    shipment: Shipment | null;
    onClose: () => void;
}

/**
 * Simplified, customer-facing tracking view for self-shipments.
 *
 * Intentionally hides:
 *   - raw event log
 *   - retry attempts
 *   - internal status codes
 *   - saga diagnostics
 *   - operational identifiers (client doc id, partner id, etc.)
 *
 * Surfaces only what a customer needs to know about their package:
 *   - where it is in the journey (timeline)
 *   - origin + destination
 *   - tracking number (copyable)
 *   - expected delivery (if entered at booking time)
 *   - notes (if entered at booking time)
 */
export function SelfShipmentTrackingDialog({ shipment, onClose }: Props) {
    const [copied, setCopied] = useState(false);
    if (!shipment) return null;

    const trackingId = shipment.courierTrackingId || shipment.awbNo || '';

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(trackingId);
            setCopied(true);
            toast.success('Tracking number copied');
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error('Could not copy');
        }
    };

    return (
        <Dialog open={!!shipment} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md bg-white p-0 overflow-hidden [&>button:last-child]:hidden">
                <div className="px-5 pt-5 pb-4 border-b bg-gradient-to-b from-violet-50/60 to-white">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                                Self Shipment
                            </div>
                            <h2 className="text-base font-bold text-slate-900 mt-0.5">Track your package</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
                            aria-label="Close"
                        >
                            <span className="text-lg leading-none">&times;</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={copy}
                        className="mt-3 flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 transition-colors group"
                    >
                        <Package className="h-4 w-4 text-violet-500 shrink-0" />
                        <span className="text-xs text-slate-500">Tracking</span>
                        <span className="text-sm font-mono font-semibold text-slate-900 flex-1 truncate">
                            {trackingId || '—'}
                        </span>
                        {copied ? (
                            <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                            <Copy className="h-4 w-4 text-slate-400 group-hover:text-violet-500" />
                        )}
                    </button>
                </div>

                <div className="px-5 py-5 bg-white">
                    <SelfShipmentTimeline status={shipment.status} />
                </div>

                <div className="px-5 pb-5 space-y-3 text-sm">
                    <Row icon={MapPin} label="From">
                        <div className="text-slate-900 font-medium">{shipment.senderName || shipment.origin?.name || '—'}</div>
                        <div className="text-slate-500 text-xs">
                            {shipment.origin?.city || ''} {shipment.origin?.pincode || shipment.pickupPincode || ''}
                        </div>
                    </Row>
                    <Row icon={MapPin} label="To">
                        <div className="text-slate-900 font-medium">{shipment.receiverName || shipment.destination?.name || '—'}</div>
                        <div className="text-slate-500 text-xs">
                            {shipment.destination?.city || ''} {shipment.destination?.pincode || ''}
                        </div>
                    </Row>
                    {shipment.receiverMobile && (
                        <Row icon={Phone} label="Contact">
                            <div className="text-slate-900 font-medium">{shipment.receiverMobile}</div>
                        </Row>
                    )}
                    {shipment.expectedDeliveryDate && (
                        <Row icon={Calendar} label="Expected delivery">
                            <div className="text-slate-900 font-medium">
                                {new Date(shipment.expectedDeliveryDate).toLocaleDateString()}
                            </div>
                        </Row>
                    )}
                    {shipment.notes && (
                        <Row icon={FileText} label="Notes">
                            <div className="text-slate-700 text-xs">{shipment.notes}</div>
                        </Row>
                    )}
                </div>

                <div className="px-5 py-3 bg-slate-50 border-t text-[11px] text-slate-500 text-center">
                    Status updates are entered manually by the sender.
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Row({
    icon: Icon,
    label,
    children,
}: {
    icon: typeof Package;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
                {children}
            </div>
        </div>
    );
}
