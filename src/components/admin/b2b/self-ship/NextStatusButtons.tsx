'use client';

import { useState, useTransition } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    listAllowedTransitions,
    type AllowedTransition,
} from '@/lib/allowedTransitions';
import { progressSelfShipmentAction } from '@/app/(admin)/b2b/self-ship/actions';
import type {
    FulfillmentMode,
    ShipmentStatus,
    TrackingMode,
} from '@/types/b2b/shipment';

// Renders one big button per legal next transition. Tap a button →
// optional confirm/note input for corrections → submit → result inline.
//
// "Progression" transitions (booked → picked_up → in_transit → delivered)
// submit in one tap. "Correction" or "terminal" transitions
// (mark_lost / mark_damaged / cancel) require a note before submitting.
//
// Allowed list is computed from canTransition() in the existing transition
// table — no hand-rolled mapping that can drift.

interface Props {
    readonly shipmentId: string;
    readonly partnerId: string;
    readonly currentStatus: ShipmentStatus;
    readonly fulfillmentMode: FulfillmentMode;
    readonly trackingMode: TrackingMode;
}

export function NextStatusButtons({
    shipmentId,
    partnerId,
    currentStatus,
    fulfillmentMode,
    trackingMode,
}: Props) {
    const allowed = listAllowedTransitions({
        from: currentStatus,
        fulfillmentMode,
        trackingMode,
        initiator: 'admin_user',
    });

    const [pendingFor, setPendingFor] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [confirming, setConfirming] = useState<AllowedTransition | null>(null);
    const [note, setNote] = useState('');

    if (allowed.length === 0) {
        return (
            <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-600">
                No transitions available from <strong>{currentStatus}</strong>. Use the
                Actions panel in the details page for admin overrides.
            </div>
        );
    }

    async function submit(t: AllowedTransition, withNote: string | undefined) {
        setPendingFor(t.command);
        setResult(null);
        startTransition(async () => {
            const r = await progressSelfShipmentAction({
                shipmentId,
                partnerId,
                status: t.to,
                note: withNote,
            });
            if (r.ok) {
                setResult({ ok: true, message: `Status: ${r.to}` });
            } else {
                setResult({ ok: false, message: r.message });
            }
            setPendingFor(null);
            setConfirming(null);
            setNote('');
        });
    }

    function handleClick(t: AllowedTransition) {
        if (t.kind === 'progression') {
            void submit(t, undefined);
        } else {
            setConfirming(t);
            setNote('');
        }
    }

    return (
        <div className="space-y-3">
            {result && (
                <div
                    className={`rounded-md border px-3 py-2 text-sm ${
                        result.ok
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                >
                    {result.message}
                </div>
            )}

            {confirming ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
                        <AlertTriangle className="size-4" />
                        Confirm: {confirming.label}
                    </div>
                    <p className="mb-3 text-xs text-amber-800">
                        This is a {confirming.kind} action. Document the reason in the audit log.
                    </p>
                    <Input
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Reason (≥5 chars)"
                        className="mb-3 h-11"
                    />
                    <div className="flex gap-2">
                        <Button
                            className="h-11 flex-1"
                            disabled={pendingFor !== null || note.trim().length < 5}
                            onClick={() => void submit(confirming, note.trim())}
                        >
                            {pendingFor === confirming.command && (
                                <Loader2 className="size-4 animate-spin" />
                            )}
                            Confirm {confirming.label}
                        </Button>
                        <Button
                            className="h-11"
                            variant="ghost"
                            disabled={pendingFor !== null}
                            onClick={() => { setConfirming(null); setNote(''); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {allowed.map((t) => (
                        <button
                            key={t.command}
                            type="button"
                            onClick={() => handleClick(t)}
                            disabled={pendingFor !== null}
                            className={`flex h-14 items-center justify-between rounded-md border px-4 text-left text-sm font-medium transition-colors ${
                                t.kind === 'progression'
                                    ? 'border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 active:bg-blue-200'
                                    : t.kind === 'correction'
                                        ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                        : 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100'
                            } disabled:opacity-50`}
                        >
                            <span>{t.label}</span>
                            {pendingFor === t.command ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <span className="text-xs opacity-70">→ {t.to}</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
