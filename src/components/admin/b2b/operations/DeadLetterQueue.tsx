'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { Loader2, RefreshCw, Ban, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DeadLetterJobItem } from '@/types/b2b/operations';
import {
    dismissDeadLetterJobAction,
    retryDeadLetterJobAction,
} from '@/app/(admin)/b2b/operations/actions';
import { QueueSection } from './QueueSection';

export function DeadLetterQueue({ items }: { items: readonly DeadLetterJobItem[] }) {
    return (
        <QueueSection
            title="Dead-letter jobs"
            severity={items.length > 0 ? 'severe' : 'nominal'}
            count={items.length}
            cappedAt={25}
            emptyMessage="No dead-lettered jobs."
        >
            <ul className="divide-y">
                {items.map((i) => (
                    <li key={i.jobId} className="p-4">
                        <DeadLetterRow item={i} />
                    </li>
                ))}
            </ul>
        </QueueSection>
    );
}

function DeadLetterRow({ item }: { item: DeadLetterJobItem }) {
    const [dismissOpen, setDismissOpen] = useState(false);
    const [dismissReason, setDismissReason] = useState('');
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-slate-900">{item.topic}</span>
                    <span className="font-mono text-[11px] text-slate-400">{item.jobId.slice(0, 12)}…</span>
                </div>
                <span className="text-xs text-slate-500">
                    {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}
                    {item.enqueuedAt && ` · ${formatDistanceToNowStrict(item.enqueuedAt)} ago`}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                {item.partnerId && (
                    <span>partner: <span className="font-mono text-slate-800">{item.partnerId}</span></span>
                )}
                {item.shipmentId && (
                    <span>
                        shipment:{' '}
                        <Link
                            className="font-mono text-slate-800 hover:underline"
                            href={`/b2b/shipments/${item.shipmentId}`}
                        >
                            {item.shipmentId}
                        </Link>
                    </span>
                )}
            </div>

            {item.lastError && (
                <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                    {item.lastError}
                </p>
            )}

            {result && (
                <p className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {result.message}
                </p>
            )}

            {dismissOpen ? (
                <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-xs text-red-900">
                        Dismissing skips retry permanently. Document why.
                    </p>
                    <Input
                        autoFocus
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                        placeholder="Reason (≥5 chars)"
                        className="h-9 text-xs"
                    />
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            className="h-8 bg-red-600 text-xs hover:bg-red-700"
                            disabled={pending || dismissReason.trim().length < 5}
                            onClick={() =>
                                startTransition(async () => {
                                    const r = await dismissDeadLetterJobAction({
                                        jobId: item.jobId,
                                        reason: dismissReason,
                                    });
                                    setResult(r);
                                    if (r.ok) { setDismissOpen(false); setDismissReason(''); }
                                })
                            }
                        >
                            {pending && <Loader2 className="size-3.5 animate-spin" />}
                            Confirm dismiss
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => { setDismissOpen(false); setDismissReason(''); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={pending}
                        onClick={() =>
                            startTransition(async () => {
                                const r = await retryDeadLetterJobAction({ jobId: item.jobId });
                                setResult(r);
                            })
                        }
                    >
                        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                        Retry
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => setDismissOpen(true)}
                        disabled={pending}
                    >
                        <Ban className="size-3.5" /> Dismiss
                    </Button>
                    {item.shipmentId && (
                        <Button size="sm" variant="ghost" className="h-8 text-xs" asChild>
                            <Link href={`/b2b/shipments/${item.shipmentId}`}>
                                <ExternalLink className="size-3.5" /> View
                            </Link>
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
