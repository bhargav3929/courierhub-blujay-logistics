import type { PartnerId, ShipmentId } from '@/types/b2b/ids';
import type { CourierCode, ShipmentStatus } from '@/types/b2b/shipment';
import type { Clock } from '@/types/b2b/ports';
import type { CourierAdapter } from '@/types/b2b/courier-adapter';
import type { EventIngestor } from '@/services/b2b/tracking/EventIngestor';
import { CarrierError } from '@/services/b2b/couriers/shared/carrierErrors';
import { CircuitOpenError } from '@/services/b2b/couriers/shared/circuitBreaker';
import { getLogger } from '@/services/b2b/http/logger';
import { planFor } from './PollingPlan';

// PollingWorker — cron-driven adaptive tracking sync.
//
// Contract:
//   - A scheduled job (Cloud Scheduler / Vercel cron) calls runOnce() at
//     a fixed interval (every 5 minutes is reasonable).
//   - runOnce() picks the "next due" batch via PollingDueQuery, calls
//     adapter.pollStatus(awb) for each, normalizes events, and feeds them
//     to EventIngestor.ingest().
//   - The worker NEVER writes status directly. All projection updates
//     flow through the ingestor → state machine.
//
// What this file does NOT implement:
//   - The actual Firestore query for "due" shipments. That's the
//     PollingDueQuery port — implementation lives in
//     services/b2b/infra/FirestorePollingDueQuery.ts (when needed; one
//     line for the route handler / cron entry to construct it).

export interface DueShipment {
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
    readonly courier: CourierCode;
    readonly awb: string;
    readonly status: ShipmentStatus;
    readonly lastEventAt: Date | null;
}

export interface PollingDueQuery {
    // Returns shipments whose tracking.lastEventAt is older than
    // (now - planFor(status).pollEveryMinutes), capped at `limit`.
    findDue(input: {
        limit: number;
        now: Date;
    }): Promise<readonly DueShipment[]>;
}

export interface PollingWorkerDeps {
    readonly dueQuery: PollingDueQuery;
    readonly ingestor: EventIngestor;
    readonly clock: Clock;
    // Adapter lookup: a function so we don't import the registry directly.
    readonly getAdapter: (courier: CourierCode) => CourierAdapter | null;
}

export interface PollingRunOptions {
    readonly batchSize: number;
    readonly concurrency: number;
}

export interface PollingRunSummary {
    readonly polled: number;
    readonly eventsIngested: number;
    readonly applied: number;
    readonly stale: number;            // skipped due to staleAfterDays
    readonly carrierFailures: number;
    readonly circuitOpen: number;
    readonly missingAdapter: number;
}

const log = getLogger('b2b.tracking.polling');

export class PollingWorker {
    constructor(private readonly deps: PollingWorkerDeps) {}

    async runOnce(opts: PollingRunOptions): Promise<PollingRunSummary> {
        const now = this.deps.clock.now();
        const due = await this.deps.dueQuery.findDue({ limit: opts.batchSize, now });

        const summary: PollingRunSummary = {
            polled: 0,
            eventsIngested: 0,
            applied: 0,
            stale: 0,
            carrierFailures: 0,
            circuitOpen: 0,
            missingAdapter: 0,
        };
        // Mutable accumulator (the returned object is the same reference).
        const acc = summary as {
            -readonly [K in keyof PollingRunSummary]: PollingRunSummary[K]
        };

        // Bounded parallelism — chunk the due list to honor concurrency.
        const chunks = chunkArray([...due], Math.max(opts.concurrency, 1));
        for (const chunk of chunks) {
            await Promise.all(chunk.map(s => this.processOne(s, now, acc)));
        }

        log.info('polling run complete', {
            polled: acc.polled,
            applied: acc.applied,
            stale: acc.stale,
            carrierFailures: acc.carrierFailures,
            circuitOpen: acc.circuitOpen,
            missingAdapter: acc.missingAdapter,
            eventsIngested: acc.eventsIngested,
        });
        return summary;
    }

    private async processOne(
        s: DueShipment,
        now: Date,
        acc: {
            polled: number;
            eventsIngested: number;
            applied: number;
            stale: number;
            carrierFailures: number;
            circuitOpen: number;
            missingAdapter: number;
        },
    ): Promise<void> {
        const plan = planFor(s.status);
        if (!plan) return;                  // terminal/held — should not be in the result set anyway

        // Stale-after-days: emit a structured alert and skip. Ops can use
        // correct_status manually if needed.
        if (s.lastEventAt) {
            const ageMs = now.getTime() - s.lastEventAt.getTime();
            if (ageMs > plan.staleAfterDays * 24 * 60 * 60 * 1000) {
                acc.stale += 1;
                log.warn('shipment is stale — not polling', {
                    shipmentId: s.shipmentId,
                    partnerId: s.partnerId,
                    courier: s.courier,
                    status: s.status,
                    lastEventAt: s.lastEventAt.toISOString(),
                    staleAfterDays: plan.staleAfterDays,
                });
                return;
            }
        }

        const adapter = this.deps.getAdapter(s.courier);
        if (!adapter) {
            acc.missingAdapter += 1;
            log.warn('no adapter registered for courier', {
                courier: s.courier, shipmentId: s.shipmentId,
            });
            return;
        }

        acc.polled += 1;

        let rawEvents;
        try {
            rawEvents = await adapter.pollStatus(s.awb, s.partnerId);
        } catch (err) {
            if (err instanceof CircuitOpenError) {
                acc.circuitOpen += 1;
                // Don't log per-shipment when the circuit is open — that's
                // already noisy. The breaker state itself is the alert.
                return;
            }
            if (err instanceof CarrierError) {
                acc.carrierFailures += 1;
                log.warn('carrier pollStatus failed', {
                    courier: s.courier,
                    shipmentId: s.shipmentId,
                    awb: s.awb,
                    category: err.category,
                    httpStatus: err.httpStatus,
                });
                return;
            }
            // Unexpected — surface but don't crash the worker.
            acc.carrierFailures += 1;
            log.error('polling threw unexpected error', {
                courier: s.courier,
                shipmentId: s.shipmentId,
                error: err instanceof Error ? err.message : String(err),
            });
            return;
        }

        // Feed each event through the ingestor. Dedup handles overlap
        // with webhooks; the ingestor's outcomes drive our counters.
        const receivedAt = this.deps.clock.now();
        for (const raw of rawEvents) {
            const normalized = adapter.normalize(raw, s.shipmentId, receivedAt);
            try {
                const result = await this.deps.ingestor.ingest({
                    event: normalized,
                    initiator: { type: 'courier_poll', courier: s.courier },
                    shipmentId: s.shipmentId,
                    partnerId: s.partnerId,
                });
                acc.eventsIngested += 1;
                if (result.outcome === 'applied') acc.applied += 1;
            } catch (err) {
                // Ingestor itself does not normally throw (it returns typed
                // outcomes), but a corrupt event or a Firestore outage can.
                log.error('ingestor threw during polling', {
                    shipmentId: s.shipmentId,
                    dedupKey: normalized.dedupKey,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }
}

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        out.push(arr.slice(i, i + chunkSize));
    }
    return out;
}
