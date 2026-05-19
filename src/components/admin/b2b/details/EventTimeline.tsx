import { format, formatDistanceToNowStrict } from 'date-fns';
import type { StoredEventViewLite } from '@/types/b2b/admin-detail';

// Normalized event timeline — the "what happened?" view.
// Events are server-fetched newest-first; UI flips order so the read
// reads top-to-bottom as oldest → newest (more natural for a timeline).
//
// Per-row layout: pip on the left rail, time + source, then event type
// and any status transition. Annotations (applied=false reason, implied
// reason) sit below in subdued text.

export function EventTimeline({
    events,
    hasMore,
    loadMoreHref,
}: {
    events: readonly StoredEventViewLite[];
    hasMore: boolean;
    loadMoreHref?: string | null;
}) {
    if (events.length === 0) {
        return (
            <section className="rounded-lg border bg-white p-4">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Timeline
                </h2>
                <p className="text-sm text-slate-500">No events recorded yet.</p>
            </section>
        );
    }

    // Display oldest-first.
    const ordered = [...events].sort(
        (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );

    return (
        <section className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Timeline ({events.length}{hasMore ? '+' : ''})
                </h2>
                {hasMore && loadMoreHref && (
                    <a className="text-xs text-slate-500 hover:text-slate-700" href={loadMoreHref}>
                        Load more →
                    </a>
                )}
            </div>

            <ol className="relative border-l border-slate-200 pl-4">
                {ordered.map((ev) => (
                    <li key={ev.eventId} className="relative pb-3 last:pb-0">
                        <span
                            className={`absolute -left-[7px] mt-1 inline-block size-2.5 rounded-full ring-2 ring-white ${
                                ev.applied ? 'bg-blue-500' : 'bg-slate-300'
                            }`}
                            aria-hidden
                        />
                        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                            <span
                                className="font-mono text-xs text-slate-500"
                                title={format(ev.occurredAt, 'yyyy-MM-dd HH:mm:ss xxx')}
                            >
                                {formatDistanceToNowStrict(ev.occurredAt)} ago
                            </span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-xs text-slate-600">{ev.source}</span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="font-mono text-xs text-slate-900">{ev.type}</span>
                            {ev.statusTransition && (
                                <span className="text-xs text-slate-700">
                                    {ev.statusTransition.from} → <strong className="font-semibold">{ev.statusTransition.to}</strong>
                                </span>
                            )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                            {ev.description && <span className="line-clamp-2 max-w-2xl">{ev.description}</span>}
                            {ev.location.raw && <span>📍 {ev.location.raw}</span>}
                            {ev.impliedReason && <span>reason: {ev.impliedReason}</span>}
                            {!ev.applied && (
                                <span className="text-amber-700">
                                    not applied — {ev.appliedReason.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}
