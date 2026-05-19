import { CheckCircle2 } from 'lucide-react';
import type { Severity } from '@/types/b2b/operations';

// Shared section wrapper. Header bar with severity dot + title + count.
// Empty-state shows a green "all clear" panel. Children render below.

const DOT_BY_SEVERITY: Record<Severity, string> = {
    critical: 'bg-red-600 ring-red-200',
    severe: 'bg-red-500 ring-red-200',
    warning: 'bg-amber-500 ring-amber-200',
    degraded: 'bg-amber-400 ring-amber-200',
    nominal: 'bg-emerald-500 ring-emerald-200',
};

interface Props {
    readonly title: string;
    readonly severity: Severity;
    readonly count: number;
    readonly cappedAt?: number;
    readonly emptyMessage?: string;
    readonly children: React.ReactNode;
    readonly headerExtra?: React.ReactNode;
}

export function QueueSection({
    title,
    severity,
    count,
    cappedAt,
    emptyMessage,
    children,
    headerExtra,
}: Props) {
    const hasMore = cappedAt !== undefined && count >= cappedAt;
    return (
        <section className="rounded-lg border bg-white">
            <header className="flex items-center justify-between border-b bg-slate-50/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <span
                        aria-hidden
                        className={`inline-block size-2.5 rounded-full ring-2 ${DOT_BY_SEVERITY[severity]}`}
                    />
                    <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                    <span
                        className={`rounded-full px-1.5 py-0.5 text-xs ${
                            count === 0
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                    >
                        {count}
                        {hasMore ? '+' : ''}
                    </span>
                </div>
                {headerExtra}
            </header>

            {count === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-emerald-700">
                    <CheckCircle2 className="size-4" />
                    {emptyMessage ?? 'All clear.'}
                </div>
            ) : (
                children
            )}
        </section>
    );
}
