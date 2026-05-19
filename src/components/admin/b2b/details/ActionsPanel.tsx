'use client';

import { useState, useTransition } from 'react';
import { Ban, RefreshCw, ArrowRightLeft, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { AdminShipmentRow } from '@/types/b2b/admin';
import { ALL_CANCELLATION_REASONS, type CancellationReason } from '@/types/b2b/reasons';
import { ALL_SHIPMENT_STATUSES } from '@/types/b2b/shipment';
import {
    cancelShipmentAction,
    pushManualEventAction,
    triggerReconciliationAction,
    type ActionResult,
} from '@/app/(admin)/b2b/shipments/[id]/actions';

// Operator actions panel. Three small forms + one toggle button:
//   - Cancel       (with reason)
//   - Reconcile    (if awaiting)
//   - Push manual  (self_shipment / manual / hybrid only)
//
// Action results render inline. Errors stay visible until the next action.

const MANUAL_PUSH_STATUSES = [
    'ready_for_pickup',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'undelivered',
    'rto_initiated',
    'rto_in_transit',
    'rto_delivered',
    'lost',
    'damaged',
] as const satisfies readonly typeof ALL_SHIPMENT_STATUSES[number][];

export function ActionsPanel({ shipment }: { shipment: AdminShipmentRow }) {
    const allowManualPush =
        shipment.fulfillmentMode === 'self_shipment' ||
        shipment.trackingMode === 'manual' ||
        shipment.trackingMode === 'hybrid';

    return (
        <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Actions
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
                <CancelAction shipment={shipment} />
                <ReconciliationAction shipment={shipment} />
                {allowManualPush && <ManualEventAction shipment={shipment} />}
            </div>
        </section>
    );
}

// ─── Cancel ────────────────────────────────────────────────────────────

function CancelAction({ shipment }: { shipment: AdminShipmentRow }) {
    const [reason, setReason] = useState<CancellationReason>('partner_requested');
    const [result, setResult] = useState<ActionResult | null>(null);
    const [pending, startTransition] = useTransition();

    return (
        <ActionCard
            icon={<Ban className="size-4 text-red-600" />}
            title="Cancel shipment"
            description="Pre-pickup only. Post-pickup shipments must go through RTO."
        >
            <div className="flex items-center gap-2">
                <Select value={reason} onValueChange={(v) => setReason(v as CancellationReason)}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ALL_CANCELLATION_REASONS.map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                                {r.replace(/_/g, ' ')}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                        startTransition(async () => {
                            const r = await cancelShipmentAction({
                                shipmentId: shipment.shipmentId,
                                partnerId: shipment.partnerId,
                                reason,
                            });
                            setResult(r);
                        });
                    }}
                >
                    Cancel
                </Button>
            </div>
            <ResultLine result={result} />
        </ActionCard>
    );
}

// ─── Reconciliation ────────────────────────────────────────────────────

function ReconciliationAction({ shipment }: { shipment: AdminShipmentRow }) {
    const [result, setResult] = useState<ActionResult | null>(null);
    const [pending, startTransition] = useTransition();
    const disabled = !shipment.reconciliation.awaiting;

    return (
        <ActionCard
            icon={<RefreshCw className="size-4 text-amber-600" />}
            title="Trigger reconciliation"
            description={
                disabled
                    ? 'Shipment is not awaiting reconciliation.'
                    : `Currently awaiting (attempt ${shipment.reconciliation.attempts}). Force an immediate run.`
            }
        >
            <Button
                size="sm"
                variant="outline"
                disabled={disabled || pending}
                onClick={() => {
                    startTransition(async () => {
                        const r = await triggerReconciliationAction({
                            shipmentId: shipment.shipmentId,
                        });
                        setResult(r);
                    });
                }}
            >
                <ArrowRightLeft className="size-3.5" /> Run now
            </Button>
            <ResultLine result={result} />
        </ActionCard>
    );
}

// ─── Manual event push (admin → state machine via EventIngestor) ───────

function ManualEventAction({ shipment }: { shipment: AdminShipmentRow }) {
    const [status, setStatus] = useState<string>('in_transit');
    const [note, setNote] = useState('');
    const [result, setResult] = useState<ActionResult | null>(null);
    const [pending, startTransition] = useTransition();

    return (
        <ActionCard
            icon={<MessageSquare className="size-4 text-blue-600" />}
            title="Push manual event"
            description="Admin-driven status transition. Documented in audit log."
        >
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MANUAL_PUSH_STATUSES.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                    {s.replace(/_/g, ' ')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reason (audit-visible, ≥5 chars)"
                    className="h-8 text-xs"
                />
                <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={pending || note.length < 5}
                    onClick={() => {
                        startTransition(async () => {
                            const r = await pushManualEventAction({
                                shipmentId: shipment.shipmentId,
                                partnerId: shipment.partnerId,
                                status,
                                note,
                            });
                            setResult(r);
                            if (r.ok) setNote('');
                        });
                    }}
                >
                    Push event
                </Button>
            </div>
            <ResultLine result={result} />
        </ActionCard>
    );
}

// ─── shared layout ─────────────────────────────────────────────────────

function ActionCard({
    icon,
    title,
    description,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-md border border-slate-200 bg-slate-50/40 p-3">
            <div className="mb-1.5 flex items-center gap-2">
                {icon}
                <h3 className="text-sm font-medium text-slate-900">{title}</h3>
            </div>
            <p className="mb-2 text-xs text-slate-500">{description}</p>
            {children}
        </div>
    );
}

function ResultLine({ result }: { result: ActionResult | null }) {
    if (!result) return null;
    return (
        <p className={`mt-2 text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {result.message}
        </p>
    );
}
