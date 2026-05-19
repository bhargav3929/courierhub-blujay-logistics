import type { CourierAdapter } from '@/types/b2b/courier-adapter';
import type { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type {
    Clock,
    DueReconciliation,
    ReconciliationDueQuery,
    ShipmentWriter,
} from '@/types/b2b/ports';
import type { CourierCode } from '@/types/b2b/shipment';
import { CarrierError } from '@/services/b2b/couriers/shared/carrierErrors';
import { CircuitOpenError } from '@/services/b2b/couriers/shared/circuitBreaker';
import { getLogger } from '@/services/b2b/http/logger';

// BookingReconciler — periodic worker that resolves indeterminate
// bookings.
//
// Trigger: cron, every 15 minutes (recommended). Vercel cron example:
//   { "path": "/api/cron/reconcile-bookings", "schedule": "*/15 * * * *" }
//
// Per shipment:
//   1. Call adapter.lookupByReference(shipmentId, partnerId)
//   2. If found:
//        - Call adapter.cancel(awb)            ← we already cancelled on
//          our side; honor that at the carrier
//        - On cancel success: clearReconciliation(resolvedWithAwb: awb)
//        - On cancel failure: log + alert. The shipment doc retains the
//          flag; next run retries.
//   3. If NOT found:
//        - Increment attempts. Schedule next attempt with backoff:
//          5min → 15min → 1h → 6h → 24h. Max 5 attempts.
//        - On max-attempts exceeded: clearReconciliation(null). Carrier
//          truly doesn't know about this shipment — safe to forget.
//   4. CircuitOpen → skip this carrier for the cycle, retry next run.
//
// The reconciler NEVER mutates shipment status directly. All status
// transitions (if any) come from the standard EventIngestor pathway.

const BACKOFF_MS = [
    5 * 60 * 1000,
    15 * 60 * 1000,
    60 * 60 * 1000,
    6 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
];
const MAX_ATTEMPTS = BACKOFF_MS.length;

const log = getLogger('b2b.booking.reconciler');

export interface BookingReconcilerDeps {
    readonly dueQuery: ReconciliationDueQuery;
    readonly shipmentWriter: ShipmentWriter;
    readonly clock: Clock;
    readonly getAdapter: (courier: CourierCode) => CourierAdapter | null;
}

export interface ReconcileRunOptions {
    readonly batchSize: number;
    readonly concurrency: number;
}

export interface ReconcileRunSummary {
    readonly examined: number;
    readonly recovered: number;          // AWB found + cancelled at carrier
    readonly abandoned: number;          // max attempts exceeded
    readonly retryScheduled: number;
    readonly missingAdapter: number;
    readonly circuitOpen: number;
    readonly errors: number;
}

export class BookingReconciler {
    constructor(private readonly deps: BookingReconcilerDeps) {}

    async runOnce(opts: ReconcileRunOptions): Promise<ReconcileRunSummary> {
        const now = this.deps.clock.now();
        const due = await this.deps.dueQuery.findDue({ limit: opts.batchSize, now });

        const summary: ReconcileRunSummary = {
            examined: due.length,
            recovered: 0,
            abandoned: 0,
            retryScheduled: 0,
            missingAdapter: 0,
            circuitOpen: 0,
            errors: 0,
        };
        // Mutable accumulator alias for clarity.
        const acc = summary as {
            -readonly [K in keyof ReconcileRunSummary]: ReconcileRunSummary[K]
        };

        const chunks = chunk([...due], Math.max(opts.concurrency, 1));
        for (const batch of chunks) {
            await Promise.all(batch.map((s) => this.processOne(s, acc)));
        }

        log.info('reconcile run complete', {
            examined: acc.examined,
            recovered: acc.recovered,
            abandoned: acc.abandoned,
            retryScheduled: acc.retryScheduled,
            missingAdapter: acc.missingAdapter,
            circuitOpen: acc.circuitOpen,
            errors: acc.errors,
        });
        return summary;
    }

    private async processOne(
        s: DueReconciliation,
        acc: {
            recovered: number;
            abandoned: number;
            retryScheduled: number;
            missingAdapter: number;
            circuitOpen: number;
            errors: number;
        },
    ): Promise<void> {
        const adapter = this.deps.getAdapter(s.courier);
        if (!adapter) {
            acc.missingAdapter += 1;
            log.warn('no adapter for reconciliation', {
                courier: s.courier,
                shipmentId: s.shipmentId,
            });
            return;
        }

        let existing: { awb: string } | null;
        try {
            existing = await adapter.lookupByReference(s.referenceNumber, s.partnerId);
        } catch (err) {
            if (err instanceof CircuitOpenError) {
                acc.circuitOpen += 1;
                return;
            }
            if (err instanceof CarrierError) {
                // Permanent → "carrier doesn't know this reference". Treat as not-found.
                if (err.category === 'permanent') {
                    existing = null;
                } else {
                    // Transient: schedule retry without consuming a heavier penalty
                    acc.errors += 1;
                    await this.scheduleRetry(s, `lookup transient: ${err.rawMessage ?? ''}`);
                    acc.retryScheduled += 1;
                    return;
                }
            } else {
                acc.errors += 1;
                log.error('lookupByReference unexpected error', {
                    courier: s.courier,
                    shipmentId: s.shipmentId,
                    error: err instanceof Error ? err.message : String(err),
                });
                await this.scheduleRetry(s, 'unexpected lookup error');
                acc.retryScheduled += 1;
                return;
            }
        }

        if (existing) {
            // AWB was created at the carrier. Cancel it; the shipment is
            // already in a non-active state on our side.
            try {
                await adapter.cancel(existing.awb, s.partnerId);
                await this.deps.shipmentWriter.clearReconciliation({
                    partnerId: s.partnerId,
                    shipmentId: s.shipmentId,
                    resolvedWithAwb: existing.awb,
                });
                acc.recovered += 1;
                log.info('reconciler cancelled orphan AWB', {
                    courier: s.courier,
                    shipmentId: s.shipmentId,
                    awb: existing.awb,
                });
            } catch (err) {
                acc.errors += 1;
                log.error('reconciler cancel failed — MANUAL CARRIER CANCEL REQUIRED', {
                    courier: s.courier,
                    shipmentId: s.shipmentId,
                    awb: existing.awb,
                    error: err instanceof Error ? err.message : String(err),
                });
                // Keep the flag set so we retry next run.
                await this.scheduleRetry(s, `cancel failed: ${err instanceof Error ? err.message : String(err)}`);
                acc.retryScheduled += 1;
            }
            return;
        }

        // Not found. Either schedule retry or give up.
        if (s.attempts >= MAX_ATTEMPTS) {
            await this.deps.shipmentWriter.clearReconciliation({
                partnerId: s.partnerId,
                shipmentId: s.shipmentId,
                resolvedWithAwb: null,
            });
            acc.abandoned += 1;
            log.warn('reconciler abandoning shipment after max attempts', {
                courier: s.courier,
                shipmentId: s.shipmentId,
                attempts: s.attempts,
            });
            return;
        }
        await this.scheduleRetry(s, 'not found at carrier');
        acc.retryScheduled += 1;
    }

    private async scheduleRetry(s: DueReconciliation, lastError: string): Promise<void> {
        const nextAttempt = s.attempts + 1;
        const backoffIndex = Math.min(nextAttempt - 1, BACKOFF_MS.length - 1);
        const nextAt = new Date(this.deps.clock.now().getTime() + BACKOFF_MS[backoffIndex]);
        await this.deps.shipmentWriter.markAwaitingReconciliation({
            partnerId: s.partnerId,
            shipmentId: s.shipmentId,
            courier: s.courier,
            referenceNumber: s.referenceNumber,
            attempts: nextAttempt,
            nextAttemptAt: nextAt,
            lastError,
        });
    }
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
