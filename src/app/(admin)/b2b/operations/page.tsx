/**
 * Admin → B2B → Operations.
 *
 * Single-page operational dashboard. Five queues stacked by urgency.
 * Server Component does parallel reads; per-section failures are
 * isolated so one bad query doesn't break the whole page.
 */
import {
    fetchCarrierHealth,
    fetchCompensationFailedSagas,
    fetchDeadLetterJobs,
    fetchLabelFailureQueue,
    fetchReconciliationQueue,
} from '@/services/server/b2bOperationsService';
import { CarrierHealthPanel } from '@/components/admin/b2b/operations/CarrierHealthPanel';
import { CompensationFailedQueue } from '@/components/admin/b2b/operations/CompensationFailedQueue';
import { DeadLetterQueue } from '@/components/admin/b2b/operations/DeadLetterQueue';
import { LabelFailureQueue } from '@/components/admin/b2b/operations/LabelFailureQueue';
import { ReconciliationQueue } from '@/components/admin/b2b/operations/ReconciliationQueue';
import { RefreshControl } from '@/components/admin/b2b/operations/RefreshControl';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
    const fetchedAt = new Date();
    const [
        compensationFailed,
        deadLetter,
        reconciliation,
        labelFailures,
        carrierHealth,
    ] = await Promise.all([
        fetchCompensationFailedSagas().catch(() => []),
        fetchDeadLetterJobs().catch(() => []),
        fetchReconciliationQueue().catch(() => []),
        fetchLabelFailureQueue().catch(() => []),
        fetchCarrierHealth().catch(() => []),
    ]);

    const totalAttention =
        compensationFailed.length + deadLetter.length + reconciliation.length + labelFailures.length;
    const hasCritical = compensationFailed.length > 0 || deadLetter.length > 0;

    return (
        <div className="flex h-full flex-col">
            <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span
                                aria-hidden
                                className={`inline-block size-2.5 rounded-full ${
                                    hasCritical ? 'bg-red-600' : totalAttention > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                            />
                            <h1 className="text-base font-semibold text-slate-900">Operations</h1>
                        </div>
                        <p className="text-xs text-slate-500">
                            {totalAttention === 0
                                ? 'All clear across all queues.'
                                : `${totalAttention} item${totalAttention !== 1 ? 's' : ''} need${totalAttention === 1 ? 's' : ''} attention`}
                            {hasCritical && ' · critical items present'}
                        </p>
                    </div>
                    <RefreshControl fetchedAt={fetchedAt} />
                </div>
            </header>

            <main className="flex-1 space-y-4 overflow-auto p-4">
                {/* Ordered by intervention urgency, top-down */}
                <CompensationFailedQueue items={compensationFailed} />
                <DeadLetterQueue items={deadLetter} />
                <ReconciliationQueue items={reconciliation} />
                <LabelFailureQueue items={labelFailures} />
                <CarrierHealthPanel rows={carrierHealth} />
            </main>
        </div>
    );
}
