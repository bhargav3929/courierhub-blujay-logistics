import type { AdminShipmentRow } from '@/types/b2b/admin';

// Operational dots. Each color = a category of problem an operator might
// want to act on. Hover tooltip is intentionally not richer than the chip's
// own text — keep ops scannability over polish.

interface Indicator {
    readonly key: string;
    readonly color: string;
    readonly title: string;
}

function indicatorsFor(row: AdminShipmentRow): Indicator[] {
    const out: Indicator[] = [];

    if (row.reconciliation.awaiting) {
        out.push({
            key: 'reconcile',
            color: 'bg-amber-500',
            title: `Awaiting carrier reconciliation (attempt ${row.reconciliation.attempts})`,
        });
    }

    if (row.label.status === 'pending' && row.label.attempts >= 2) {
        out.push({
            key: 'label_retry',
            color: 'bg-yellow-500',
            title: `Label retry in progress (${row.label.attempts} attempts)`,
        });
    }

    if (row.label.status === 'failed') {
        out.push({
            key: 'label_failed',
            color: 'bg-red-500',
            title: 'Label retrieval failed — partner can re-request',
        });
    }

    if (row.status === 'lost' || row.status === 'damaged') {
        out.push({
            key: 'exception',
            color: 'bg-red-600',
            title: `Exception: ${row.status}${row.statusReason ? ` (${row.statusReason})` : ''}`,
        });
    }

    if (row.status === 'on_hold') {
        out.push({
            key: 'hold',
            color: 'bg-amber-600',
            title: `On hold${row.statusReason ? ` (${row.statusReason})` : ''}`,
        });
    }

    if (
        row.status === 'in_transit' &&
        row.lastEventAt &&
        Date.now() - row.lastEventAt.getTime() > 5 * 24 * 60 * 60 * 1000
    ) {
        out.push({
            key: 'stuck',
            color: 'bg-orange-500',
            title: 'In transit > 5 days without an event',
        });
    }

    return out;
}

export function IndicatorBadges({ row }: { row: AdminShipmentRow }) {
    const indicators = indicatorsFor(row);
    if (indicators.length === 0) {
        return <span className="text-slate-300 text-xs">—</span>;
    }
    return (
        <div className="flex items-center gap-1">
            {indicators.map((ind) => (
                <span
                    key={ind.key}
                    title={ind.title}
                    className={`inline-block size-2 rounded-full ${ind.color}`}
                    aria-label={ind.title}
                />
            ))}
        </div>
    );
}
