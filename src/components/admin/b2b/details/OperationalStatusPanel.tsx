import { AlertTriangle, CheckCircle2, CircleDashed, Clock, XCircle } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type { ShipmentDetailView } from '@/types/b2b/admin-detail';
import { TERMINAL_STATUSES } from '@/types/b2b/shipment';

// Problem-state surface. Each row is a discrete question an operator
// might ask while triaging a stuck shipment.
//
// Status icons:
//   ✓ ok      — all clear
//   ◌ inactive — concept doesn't apply (e.g. label for self-shipment pending state)
//   ⏱ pending — work scheduled / in flight
//   ⚠ warning — needs attention
//   ✗ failed  — requires action

export function OperationalStatusPanel({ detail }: { detail: ShipmentDetailView }) {
    const { shipment, saga, idempotency } = detail;
    const rows = [
        bookingRow(detail),
        sagaRow(saga),
        reconciliationRow(shipment),
        labelRow(shipment),
        idempotencyRow(idempotency),
        circuitHintRow(detail),
    ];

    return (
        <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Operational status
            </h2>
            <ul className="space-y-1.5 text-sm">
                {rows.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0">{r.icon}</span>
                        <span className="text-slate-900">
                            <span className="font-medium">{r.label}</span>
                            {r.detail && (
                                <span className="text-slate-500">
                                    {' — '}
                                    {r.detail}
                                </span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

interface StatusRow {
    icon: React.ReactNode;
    label: string;
    detail: React.ReactNode;
}

function bookingRow(detail: ShipmentDetailView): StatusRow {
    const { shipment } = detail;
    if (shipment.status === 'draft') {
        return { icon: pendingIcon, label: 'Booking', detail: 'Draft — not yet committed' };
    }
    if (shipment.fulfillmentMode === 'self_shipment') {
        return { icon: okIcon, label: 'Booking', detail: 'Self-shipment (no carrier call)' };
    }
    if (shipment.courier.awb) {
        return {
            icon: okIcon, label: 'Booking',
            detail: `Carrier accepted (${shipment.courier.code} · ${shipment.courier.awb})`,
        };
    }
    return {
        icon: warnIcon, label: 'Booking',
        detail: 'No AWB recorded — see saga + reconciliation below',
    };
}

function sagaRow(saga: ShipmentDetailView['saga']): StatusRow {
    if (!saga) {
        return {
            icon: inactiveIcon, label: 'Saga',
            detail: 'No checkpoint (pre-Phase 3 booking or never started)',
        };
    }
    switch (saga.status) {
        case 'completed':
            return {
                icon: okIcon, label: 'Saga',
                detail: `Completed (${saga.stepIndex} steps · ${formatDistanceToNowStrict(saga.updatedAt)} ago)`,
            };
        case 'in_progress':
            return {
                icon: pendingIcon, label: 'Saga',
                detail: `In progress at step ${saga.stepIndex} (${formatDistanceToNowStrict(saga.updatedAt)} ago)`,
            };
        case 'compensated':
            return {
                icon: warnIcon, label: 'Saga',
                detail: `Compensated · ${saga.compensatedSteps.length} step(s) rolled back. ${saga.error ?? ''}`,
            };
        case 'compensation_failed':
            return {
                icon: failIcon, label: 'Saga',
                detail: `COMPENSATION FAILED — manual ops review required. ${saga.error ?? ''}`,
            };
        case 'failed':
            return { icon: failIcon, label: 'Saga', detail: saga.error ?? 'Failed' };
        default:
            return { icon: inactiveIcon, label: 'Saga', detail: saga.status };
    }
}

function reconciliationRow(shipment: ShipmentDetailView['shipment']): StatusRow {
    if (!shipment.reconciliation.awaiting) {
        return { icon: inactiveIcon, label: 'Reconciliation', detail: 'Not awaiting' };
    }
    const next = shipment.reconciliation.nextAttemptAt;
    return {
        icon: warnIcon, label: 'Reconciliation',
        detail: `Awaiting carrier lookup · attempt ${shipment.reconciliation.attempts}` +
            (next ? ` · next ${formatDistanceToNowStrict(next)} ${next > new Date() ? 'from now' : 'ago'}` : ''),
    };
}

function labelRow(shipment: ShipmentDetailView['shipment']): StatusRow {
    const { status, attempts } = shipment.label;
    if (!status) {
        return { icon: inactiveIcon, label: 'Label', detail: 'Not generated yet' };
    }
    switch (status) {
        case 'available':
            return { icon: okIcon, label: 'Label', detail: `Available (${attempts} attempt${attempts !== 1 ? 's' : ''})` };
        case 'pending':
            return { icon: pendingIcon, label: 'Label', detail: `Retry in progress · ${attempts} attempt${attempts !== 1 ? 's' : ''}` };
        case 'failed':
            return { icon: failIcon, label: 'Label', detail: `Failed after ${attempts} attempts` };
        case 'archived':
            return { icon: inactiveIcon, label: 'Label', detail: 'Archived' };
    }
}

function idempotencyRow(idem: ShipmentDetailView['idempotency']): StatusRow {
    if (!idem) {
        return { icon: inactiveIcon, label: 'Idempotency', detail: 'No record (expired or pre-API booking)' };
    }
    if (idem.status === 'committed') {
        const httpStatus = idem.httpStatus ?? '?';
        const when = idem.committedAt ? format(idem.committedAt, 'yyyy-MM-dd HH:mm:ss') : '';
        return { icon: okIcon, label: 'Idempotency', detail: `Committed · HTTP ${httpStatus} · ${when}` };
    }
    if (idem.status === 'in_progress') {
        return { icon: pendingIcon, label: 'Idempotency', detail: 'In progress — earlier request not yet committed' };
    }
    return { icon: inactiveIcon, label: 'Idempotency', detail: idem.status };
}

function circuitHintRow(detail: ShipmentDetailView): StatusRow {
    // Circuit state is in-process and not stored. We surface a hint based on
    // status: a shipment stuck in_transit > 5 days with a courier-driven flow
    // likely means the courier API is degraded — recommend ops check
    // /b2b/operations (Step 4.5).
    const { shipment } = detail;
    const isTerminal = (TERMINAL_STATUSES as ReadonlySet<string>).has(shipment.status);
    if (isTerminal) {
        return { icon: okIcon, label: 'Carrier', detail: 'Terminal state · no further calls expected' };
    }
    if (shipment.lastEventAt && shipment.fulfillmentMode === 'courier') {
        const ageMs = Date.now() - shipment.lastEventAt.getTime();
        const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        if (days >= 5) {
            return {
                icon: warnIcon, label: 'Carrier',
                detail: `No events for ${days} days — check operations dashboard for circuit/outage`,
            };
        }
    }
    return { icon: inactiveIcon, label: 'Carrier', detail: 'No outage indicators' };
}

// ─── icons ──────────────────────────────────────────────────────────────

const okIcon = <CheckCircle2 className="size-4 text-emerald-600" />;
const warnIcon = <AlertTriangle className="size-4 text-amber-600" />;
const failIcon = <XCircle className="size-4 text-red-600" />;
const pendingIcon = <Clock className="size-4 text-blue-600" />;
const inactiveIcon = <CircleDashed className="size-4 text-slate-300" />;
