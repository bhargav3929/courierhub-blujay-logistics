import type { CarrierHealthRow, Severity } from '@/types/b2b/operations';
import { QueueSection } from './QueueSection';

// Carrier health is derived from durable signals, not introspected from
// the in-memory circuit breaker (which is per-process and would be
// misleading to surface). Indicators:
//   - stuck in_transit  ≥3 days no event
//   - awaiting reconciliation
//   - pending labels
//   - failed labels
//
// Severity rolls up: 0 elevated = nominal · 1 = warning · 2+ = severe.

const SEVERITY_DOT: Record<Severity, string> = {
    critical: 'bg-red-600',
    severe: 'bg-red-500',
    warning: 'bg-amber-500',
    degraded: 'bg-amber-400',
    nominal: 'bg-emerald-500',
};

const SEVERITY_LABEL: Record<Severity, string> = {
    critical: 'Critical',
    severe: 'Severe',
    warning: 'Warning',
    degraded: 'Degraded',
    nominal: 'Nominal',
};

export function CarrierHealthPanel({ rows }: { rows: readonly CarrierHealthRow[] }) {
    const elevated = rows.filter((r) => r.severity !== 'nominal').length;
    return (
        <QueueSection
            title="Carrier health"
            severity={elevated > 0 ? 'warning' : 'nominal'}
            count={rows.length}
            emptyMessage="No carriers registered."
        >
            <ul className="divide-y">
                {rows.map((row) => <CarrierRow key={row.courier} row={row} />)}
            </ul>
            <p className="border-t bg-slate-50/40 px-4 py-2 text-xs text-slate-500">
                Derived from durable signals (stuck shipments, reconciliation queue, label state).
                Live carrier API circuit-breaker state is per-process and not surfaced here.
            </p>
        </QueueSection>
    );
}

function CarrierRow({ row }: { row: CarrierHealthRow }) {
    return (
        <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div className="flex min-w-[120px] items-center gap-2">
                <span
                    aria-hidden
                    className={`inline-block size-2.5 rounded-full ${SEVERITY_DOT[row.severity]}`}
                />
                <span className="text-sm font-medium capitalize text-slate-900">
                    {row.courier}
                </span>
                <span className="text-xs text-slate-500">{SEVERITY_LABEL[row.severity]}</span>
            </div>

            <Metric
                label="Stuck (≥3d)"
                value={row.stuckInTransitCount}
                threshold={5}
            />
            <Metric
                label="Awaiting reconcile"
                value={row.awaitingReconciliationCount}
                threshold={3}
            />
            <Metric
                label="Pending labels"
                value={row.pendingLabelsCount}
                threshold={10}
            />
            <Metric
                label="Failed labels"
                value={row.failedLabelsCount}
                threshold={3}
            />
        </li>
    );
}

function Metric({
    label,
    value,
    threshold,
}: {
    label: string;
    value: number;
    threshold: number;
}) {
    const elevated = value >= threshold;
    return (
        <div className="flex items-baseline gap-1.5 text-sm">
            <span className="text-xs text-slate-500">{label}</span>
            <span className={`font-semibold ${elevated ? 'text-amber-700' : 'text-slate-900'}`}>
                {value}
            </span>
        </div>
    );
}
