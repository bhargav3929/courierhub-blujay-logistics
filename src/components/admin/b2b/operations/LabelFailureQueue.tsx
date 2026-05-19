'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LabelFailureQueueItem } from '@/types/b2b/operations';
import { retryLabelAction } from '@/app/(admin)/b2b/shipments/[id]/actions';
import { QueueSection } from './QueueSection';

export function LabelFailureQueue({ items }: { items: readonly LabelFailureQueueItem[] }) {
    return (
        <QueueSection
            title="Label failure queue"
            severity={items.length > 0 ? 'degraded' : 'nominal'}
            count={items.length}
            cappedAt={25}
            emptyMessage="No pending or failed labels."
        >
            <div className="hidden md:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-4 py-2">Shipment</th>
                            <th className="px-4 py-2">Carrier · AWB</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Attempts</th>
                            <th className="px-4 py-2">Created</th>
                            <th className="px-4 py-2">Last error</th>
                            <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((i) => <LabelRow key={i.shipmentId} item={i} />)}
                    </tbody>
                </table>
            </div>
            <ul className="divide-y md:hidden">
                {items.map((i) => (
                    <li key={i.shipmentId} className="p-4">
                        <LabelCard item={i} />
                    </li>
                ))}
            </ul>
        </QueueSection>
    );
}

function LabelRow({ item }: { item: LabelFailureQueueItem }) {
    return (
        <tr className="border-b last:border-b-0 hover:bg-slate-50/50">
            <td className="px-4 py-2 align-middle font-mono text-xs">
                <Link href={`/b2b/shipments/${item.shipmentId}`} className="hover:underline">
                    {item.shipmentId}
                </Link>
                <div className="text-[11px] text-slate-400">{item.partnerId}</div>
            </td>
            <td className="px-4 py-2 align-middle text-sm">
                {item.courier ?? '—'}
                {item.awb && <span className="ml-1 font-mono text-xs text-slate-500">{item.awb}</span>}
            </td>
            <td className="px-4 py-2 align-middle">
                <StatusPill status={item.labelStatus} />
            </td>
            <td className="px-4 py-2 align-middle text-sm">{item.attempts} / 5</td>
            <td className="px-4 py-2 align-middle text-xs text-slate-500">
                {formatDistanceToNowStrict(item.createdAt)} ago
            </td>
            <td className="px-4 py-2 align-middle">
                <ErrorText text={item.lastError} />
            </td>
            <td className="px-4 py-2 align-middle text-right">
                <RetryButton item={item} />
            </td>
        </tr>
    );
}

function LabelCard({ item }: { item: LabelFailureQueueItem }) {
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
                <Link href={`/b2b/shipments/${item.shipmentId}`} className="font-mono text-xs hover:underline">
                    {item.shipmentId}
                </Link>
                <StatusPill status={item.labelStatus} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                <span>{item.partnerId}</span>
                {item.courier && <><span>·</span><span>{item.courier}</span></>}
                {item.awb && <><span>·</span><span className="font-mono">{item.awb}</span></>}
                <span>·</span>
                <span>{item.attempts} / 5</span>
            </div>
            <ErrorText text={item.lastError} />
            <RetryButton item={item} />
        </div>
    );
}

function RetryButton({ item }: { item: LabelFailureQueueItem }) {
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
    const canRetry = item.attempts < 5 && item.courier !== null && item.awb !== null;

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
                disabled={!canRetry || pending}
                onClick={() =>
                    startTransition(async () => {
                        const r = await retryLabelAction({
                            shipmentId: item.shipmentId,
                            partnerId: item.partnerId,
                        });
                        setResult(r);
                    })
                }
            >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Retry
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" asChild>
                <Link href={`/b2b/shipments/${item.shipmentId}`}>
                    <ExternalLink className="size-3.5" /> View
                </Link>
            </Button>
        </div>
    );
}

function StatusPill({ status }: { status: 'pending' | 'failed' }) {
    const cls = status === 'failed'
        ? 'bg-red-100 text-red-800 border-red-300'
        : 'bg-amber-100 text-amber-800 border-amber-300';
    return (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
            {status}
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
