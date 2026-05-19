'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CompensationFailedSagaItem } from '@/types/b2b/operations';
import { acknowledgeCompensationFailureAction } from '@/app/(admin)/b2b/operations/actions';
import { QueueSection } from './QueueSection';

// The most critical queue. Each item means: a booking saga tried to roll
// back side-effects and failed mid-rollback. State is inconsistent
// between Blujay and the carrier. NO automation will fix it.
//
// "Acknowledge" records ops awareness with a note — it does NOT clear
// the item. The item stays visible until manually corrected (via the
// shipment details page's `correct_status` admin override).

export function CompensationFailedQueue({
    items,
}: {
    items: readonly CompensationFailedSagaItem[];
}) {
    return (
        <QueueSection
            title="Compensation-failed sagas"
            severity={items.length > 0 ? 'critical' : 'nominal'}
            count={items.length}
            cappedAt={25}
            emptyMessage="No compensation-failed sagas. State is consistent."
        >
            <ul className="divide-y">
                {items.map((i) => (
                    <li key={i.sagaId} className="p-4">
                        <CompFailedRow item={i} />
                    </li>
                ))}
            </ul>
        </QueueSection>
    );
}

function CompFailedRow({ item }: { item: CompensationFailedSagaItem }) {
    const [openAck, setOpenAck] = useState(false);
    const [note, setNote] = useState(item.acknowledgedNote ?? '');
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-red-600" />
                    <span className="font-mono text-xs text-slate-900">{item.sagaId}</span>
                </div>
                <span className="text-xs text-slate-500">
                    {formatDistanceToNowStrict(item.updatedAt)} ago{' · '}
                    <span title={format(item.updatedAt, 'yyyy-MM-dd HH:mm:ss xxx')}>
                        {format(item.updatedAt, 'MMM d HH:mm')}
                    </span>
                </span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>step index: <strong>{item.stepIndex}</strong></span>
                {item.compensatedSteps.length > 0 && (
                    <span>
                        compensated:{' '}
                        <code className="font-mono text-slate-800">
                            {item.compensatedSteps.join(', ')}
                        </code>
                    </span>
                )}
                {item.partnerId && (
                    <span>partner: <code className="font-mono">{item.partnerId}</code></span>
                )}
            </div>

            {item.error && (
                <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                    {item.error}
                </p>
            )}

            {item.acknowledged && (
                <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    <strong>Acknowledged{item.acknowledgedAt && ` · ${formatDistanceToNowStrict(item.acknowledgedAt)} ago`}:</strong>{' '}
                    {item.acknowledgedNote}
                </p>
            )}

            {result && (
                <p className={`text-xs ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {result.message}
                </p>
            )}

            {openAck ? (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs text-amber-900">
                        Acknowledgement does <strong>not</strong> recover the saga.
                        It records ops awareness so this isn't re-triaged. Manual
                        correction happens on the shipment details page.
                    </p>
                    <Input
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Note (≥5 chars) — what's the plan?"
                        className="h-9 text-xs"
                    />
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={pending || note.trim().length < 5}
                            onClick={() =>
                                startTransition(async () => {
                                    const r = await acknowledgeCompensationFailureAction({
                                        sagaId: item.sagaId,
                                        note,
                                    });
                                    setResult(r);
                                    if (r.ok) setOpenAck(false);
                                })
                            }
                        >
                            {pending && <Loader2 className="size-3.5 animate-spin" />}
                            Save acknowledgement
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => setOpenAck(false)}
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
                        onClick={() => setOpenAck(true)}
                    >
                        {item.acknowledged ? 'Update note' : 'Acknowledge'}
                    </Button>
                    {item.partnerId && (
                        <Button size="sm" variant="ghost" className="h-8 text-xs" asChild>
                            <Link href={`/b2b/shipments?partnerId=${item.partnerId}`}>
                                <ExternalLink className="size-3.5" /> Partner shipments
                            </Link>
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
