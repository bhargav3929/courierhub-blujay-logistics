'use client';

import { useState } from 'react';
import { ChevronRight, Copy } from 'lucide-react';
import type { StoredEventViewLite } from '@/types/b2b/admin-detail';

// Raw event inspector — the "what did the carrier actually send?" view.
// Default: collapsed rows showing dedup key + type + source. Expand to
// reveal: full normalized fields + carrier payload JSON (truncated by
// default with a "show full" toggle).
//
// All client-side — toggle state is local.

const PAYLOAD_PREVIEW_CHARS = 500;

export function RawEvents({ events }: { events: readonly StoredEventViewLite[] }) {
    if (events.length === 0) {
        return (
            <section className="rounded-lg border bg-white p-4">
                <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Raw events
                </h2>
                <p className="mt-2 text-sm text-slate-500">No raw events available.</p>
            </section>
        );
    }
    return (
        <section className="rounded-lg border bg-white">
            <div className="border-b px-4 py-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Raw events ({events.length})
                </h2>
            </div>
            <ul className="divide-y divide-slate-100">
                {events.map((ev) => (
                    <RawEventRow key={ev.eventId} event={ev} />
                ))}
            </ul>
        </section>
    );
}

function RawEventRow({ event }: { event: StoredEventViewLite }) {
    const [open, setOpen] = useState(false);
    const [showFull, setShowFull] = useState(false);

    const payloadStr = event.payload ? safeStringify(event.payload) : null;
    const preview =
        payloadStr && payloadStr.length > PAYLOAD_PREVIEW_CHARS
            ? payloadStr.slice(0, PAYLOAD_PREVIEW_CHARS) + '\n…'
            : payloadStr ?? '';

    return (
        <li>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50"
            >
                <ChevronRight
                    className={`size-3.5 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
                />
                <span className="font-mono text-xs text-slate-400">{event.eventId.slice(0, 12)}…</span>
                <span className="font-mono text-xs text-slate-900">{event.type}</span>
                <span className="text-xs text-slate-500">{event.source}</span>
                {event.rawCode && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                        {event.rawCode}
                    </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                    {event.applied ? 'applied' : event.appliedReason.replace(/_/g, ' ')}
                </span>
            </button>

            {open && (
                <div className="space-y-3 border-t bg-slate-50/40 px-4 py-3 text-xs">
                    <FieldGrid event={event} />

                    {payloadStr ? (
                        <div>
                            <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs text-slate-500">
                                    Carrier payload {showFull ? '' : `(showing ${PAYLOAD_PREVIEW_CHARS} of ${payloadStr.length})`}
                                </span>
                                <div className="flex gap-2">
                                    {payloadStr.length > PAYLOAD_PREVIEW_CHARS && (
                                        <button
                                            type="button"
                                            onClick={() => setShowFull((v) => !v)}
                                            className="text-xs text-slate-500 hover:text-slate-700"
                                        >
                                            {showFull ? 'Collapse' : 'Show full'}
                                        </button>
                                    )}
                                    <CopyJsonButton json={payloadStr} />
                                </div>
                            </div>
                            <pre className="overflow-x-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px] leading-snug text-slate-800">
                                {showFull ? payloadStr : preview}
                            </pre>
                        </div>
                    ) : (
                        <p className="text-xs italic text-slate-400">No carrier payload stored.</p>
                    )}
                </div>
            )}
        </li>
    );
}

function FieldGrid({ event }: { event: StoredEventViewLite }) {
    return (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <Field label="dedupKey" mono>{event.dedupKey}</Field>
            <Field label="source">{event.source}</Field>
            <Field label="type" mono>{event.type}</Field>
            <Field label="rawCode" mono>{event.rawCode || '—'}</Field>
            <Field label="occurredAt" mono>{event.occurredAt.toISOString()}</Field>
            <Field label="receivedAt" mono>{event.receivedAt.toISOString()}</Field>
            <Field label="impliedStatus">{event.impliedStatus ?? '—'}</Field>
            <Field label="impliedReason">{event.impliedReason ?? '—'}</Field>
            <Field label="location">{event.location.raw ?? '—'}</Field>
            <Field label="facility">{event.facility ?? '—'}</Field>
            <Field label="applied">{event.applied ? 'true' : 'false'}</Field>
            <Field label="appliedReason">{event.appliedReason.replace(/_/g, ' ')}</Field>
            {event.statusTransition && (
                <Field label="transition" mono>
                    {event.statusTransition.from} → {event.statusTransition.to}
                </Field>
            )}
        </dl>
    );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex items-baseline gap-2">
            <dt className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className={`text-xs text-slate-800 ${mono ? 'font-mono' : ''}`}>{children}</dd>
        </div>
    );
}

function CopyJsonButton({ json }: { json: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(json);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                } catch {
                    /* ignore */
                }
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
            <Copy className="size-3" /> {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

function safeStringify(v: unknown): string {
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
}
