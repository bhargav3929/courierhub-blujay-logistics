import { format, formatDistanceToNowStrict } from 'date-fns';
import { CheckCircle2, CircleDashed, MinusCircle, XCircle } from 'lucide-react';
import type { SagaSnapshot } from '@/types/b2b/admin-detail';

// Saga diagnostics — the centerpiece of "did the carrier accept the booking?".
//
// Renders:
//   - Sagas status banner with error if any
//   - The 8 booking steps with status icon for each (completed / current /
//     pending / compensated)
//   - State preview: the most operationally-relevant fields from the
//     persisted state (shipmentId, AWB, indeterminate flag, etc.)

// Step list mirrors buildBookingSteps() in BookingSaga.ts.
const BOOKING_STEPS = [
    'persist_draft',
    'resolve_pricing',
    'book_courier',
    'mark_booked',
    'generate_label',
    'commit_pricing',
    'enqueue_partner_webhook',
    'commit_idempotency',
] as const;

// Keys we render prominently from state. Other state goes in the
// "Show raw state" toggle.
const HIGHLIGHTED_STATE_KEYS = [
    'shipmentId',
    'awb',
    'selectedCourier',
    'selectedServiceCode',
    'draftCreated',
    'shipmentMarkedBooked',
    'awaitingCarrierReconciliation',
    'outboundWebhookEnqueued',
    'idempotencyCommitted',
] as const;

export function SagaDiagnostics({ saga }: { saga: SagaSnapshot | null }) {
    if (!saga) {
        return (
            <section className="rounded-lg border bg-white p-4">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Saga diagnostics
                </h2>
                <p className="text-sm text-slate-500">
                    No saga checkpoint found. The shipment may pre-date Phase 3 booking, or
                    the saga never started.
                </p>
            </section>
        );
    }

    const compensatedSet = new Set(saga.compensatedSteps);

    return (
        <section className="rounded-lg border bg-white">
            <div className="border-b px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Saga diagnostics
                    </h2>
                    <SagaStatusPill status={saga.status} />
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{saga.sagaId}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                    Updated {formatDistanceToNowStrict(saga.updatedAt)} ago
                    <span title={format(saga.updatedAt, 'yyyy-MM-dd HH:mm:ss xxx')}>
                        {' · '}
                        {format(saga.updatedAt, 'yyyy-MM-dd HH:mm')}
                    </span>
                </p>
                {saga.error && (
                    <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                        Error: {saga.error}
                    </p>
                )}
            </div>

            <div className="grid gap-4 p-4 md:grid-cols-2">
                <div>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Steps
                    </h3>
                    <ol className="space-y-1.5 text-sm">
                        {BOOKING_STEPS.map((step, i) => {
                            const status = stepStatus(i, saga.stepIndex, saga.status, compensatedSet.has(step));
                            return (
                                <li key={step} className="flex items-center gap-2">
                                    <StepIcon kind={status} />
                                    <span className={`font-mono text-xs ${status === 'pending' ? 'text-slate-400' : 'text-slate-900'}`}>
                                        {step}
                                    </span>
                                    {status === 'compensated' && (
                                        <span className="text-xs text-amber-600">compensated</span>
                                    )}
                                    {status === 'current' && (
                                        <span className="text-xs text-blue-600">in progress</span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                </div>

                <div>
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        State
                    </h3>
                    <dl className="space-y-1 text-xs">
                        {HIGHLIGHTED_STATE_KEYS.map((k) => (
                            <div key={k} className="flex items-baseline justify-between gap-2">
                                <dt className="text-slate-500">{k}</dt>
                                <dd className="font-mono text-slate-900 truncate text-right max-w-[60%]">
                                    {renderStateValue(saga.state[k])}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </section>
    );
}

type StepStatusKind = 'done' | 'current' | 'pending' | 'compensated';

function stepStatus(
    index: number,
    stepIndex: number,
    sagaStatus: string,
    compensated: boolean,
): StepStatusKind {
    if (compensated) return 'compensated';
    if (index < stepIndex) return 'done';
    if (index === stepIndex && sagaStatus === 'in_progress') return 'current';
    if (sagaStatus === 'completed') return 'done';
    return 'pending';
}

function StepIcon({ kind }: { kind: StepStatusKind }) {
    switch (kind) {
        case 'done':
            return <CheckCircle2 className="size-4 text-emerald-600" />;
        case 'current':
            return <CircleDashed className="size-4 animate-pulse text-blue-600" />;
        case 'pending':
            return <CircleDashed className="size-4 text-slate-300" />;
        case 'compensated':
            return <MinusCircle className="size-4 text-amber-600" />;
    }
}

function SagaStatusPill({ status }: { status: string }) {
    const color =
        status === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
        : status === 'in_progress' ? 'bg-blue-100 text-blue-800 border-blue-300'
        : status === 'compensated' ? 'bg-amber-100 text-amber-800 border-amber-300'
        : status === 'compensation_failed' ? 'bg-red-100 text-red-800 border-red-300'
        : 'bg-slate-100 text-slate-700 border-slate-300';
    return (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}>
            {status.replace(/_/g, ' ')}
        </span>
    );
}

function renderStateValue(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return v.toString();
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

// Suppress unused — exported icons used inline above.
void XCircle;
