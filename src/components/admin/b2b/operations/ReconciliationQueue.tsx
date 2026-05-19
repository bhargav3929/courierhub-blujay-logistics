'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReconciliationQueueItem } from '@/types/b2b/operations';
import { triggerReconciliationAction } from '@/app/(admin)/b2b/shipments/[id]/actions';
import { QueueSection } from './QueueSection';

// Indeterminate-booking recovery queue. Each row carries the shipment id,
// carrier, attempt count, and next scheduled retry. The "Trigger now"
// button reuses the same Server Action the details page uses.

export function ReconciliationQueue({ items }: { items: readonly ReconciliationQueueItem[] }) {
    return (
        <QueueSection
            title="Reconciliation queue"
            severity={items.length > 0 ? 'warning' : 'nominal'}
            count={items.length}
            cappedAt={25}
            emptyMessage="No shipments awaiting carrier reconciliation."
        >
            <div className="hidden md:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-4 py-2">Shipment</th>
                            <th className="px-4 py-2">Carrier</th>
                            <th className="px-4 py-2">Attempts</th>
                            <th className="px-4 py-2">Next retry</th>
                            <th className="px-4 py-2">Last error</th>
                            <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((i) => <ReconcileRow key={i.shipmentId} item={i} />)}
                    </tbody>
                </table>
            </div>
            <ul className="divide-y md:hidden">
                {items.map((i) => (
                    <li key={i.shipmentId} className="p-4">
                        <ReconcileCard item={i} />
                    </li>
                ))}
            </ul>
        </QueueSection>
    );
}

function ReconcileRow({ item }: { item: ReconciliationQueueItem }) {
    return (
        <tr className="border-b last:border-b-0 hover:bg-slate-50/50">
            <td className="px-4 py-2 align-middle font-mono text-xs">
                <Link href={`/b2b/shipments/${item.shipmentId}`} className="hover:underline">
                    {item.shipmentId}
                </Link>
                <div className="text-[11px] text-slate-400">{item.partnerId}</div>
            </td>
            <td className="px-4 py-2 align-middle text-sm">{item.courier}</td>
            <td className="px-4 py-2 align-middle text-sm">{item.attempts} / 5</td>
            <td className="px-4 py-2 align-middle text-xs text-slate-600">
                <NextRetry at={item.nextAttemptAt} />
            </td>
            <td className="px-4 py-2 align-middle">
                <ErrorText text={item.lastError} />
            </td>
            <td className="px-4 py-2 align-middle text-right">
                <TriggerButton shipmentId={item.shipmentId} />
            </td>
        </tr>
    );
}

function ReconcileCard({ item }: { item: ReconciliationQueueItem }) {
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
                <Link href={`/b2b/shipments/${item.shipmentId}`} className="font-mono text-xs hover:underline">
                    {item.shipmentId}
                </Link>
                <span className="text-xs text-slate-500">{item.attempts} / 5</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>{item.partnerId}</span>
                <span>·</span>
                <span>{item.courier}</span>
                <span>·</span>
                <span><NextRetry at={item.nextAttemptAt} /></span>
            </div>
            <ErrorText text={item.lastError} />
            <TriggerButton shipmentId={item.shipmentId} />
        </div>
    );
}

function TriggerButton({ shipmentId }: { shipmentId: string }) {
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {result && (
                <span className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {result.message}
                </span>
            )}
            <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={pending}
                onClick={() =>
                    startTransition(async () => {
                        const r = await triggerReconciliationAction({ shipmentId });
                        setResult(r);
                    })
                }
            >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Trigger now
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" asChild>
                <Link href={`/b2b/shipments/${shipmentId}`}>
                    <ExternalLink className="size-3.5" /> View
                </Link>
            </Button>
        </div>
    );
}

function NextRetry({ at }: { at: Date | null }) {
    if (!at) return <span>—</span>;
    const future = at.getTime() > Date.now();
    return (
        <span title={at.toISOString()}>
            {future ? `in ${formatDistanceToNowStrict(at)}` : `${formatDistanceToNowStrict(at)} ago`}
        </span>
    );
}

function ErrorText({ text }: { text: string | null }) {
    if (!text) return <span className="text-xs text-slate-400">—</span>;
    return (
        <span className="line-clamp-1 max-w-md text-xs text-amber-800" title={text}>
            {text}
        </span>
    );
}
