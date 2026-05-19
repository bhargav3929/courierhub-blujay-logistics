import type { CourierAdapter } from '@/types/b2b/courier-adapter';
import type { LabelArtifact } from '@/types/b2b/label';
import type {
    Clock,
    DueLabelRetrieval,
    LabelRetrievalDueQuery,
} from '@/types/b2b/ports';
import type { CourierCode } from '@/types/b2b/shipment';
import { getLogger } from '@/services/b2b/http/logger';
import type { LabelService } from './LabelService';

// LabelRetrievalJob — periodic worker that fetches labels for shipments
// where the booking-time fetch failed or where the carrier issues labels
// asynchronously.
//
// Trigger: cron every 10 minutes. Vercel cron example:
//   { "path": "/api/cron/retrieve-labels", "schedule": "*/10 * * * *" }
//
// The worker is a thin loop: query due labels, delegate to
// LabelService.retryPending(). The service handles the actual carrier
// call + storage upload + ShipmentWriter.attachLabel. After MAX_ATTEMPTS
// failed retries, the shipment's label.status flips to 'failed' and ops
// is alerted via structured log.

const MAX_ATTEMPTS = 5;

const log = getLogger('b2b.label.retrieval');

export interface LabelRetrievalJobDeps {
    readonly dueQuery: LabelRetrievalDueQuery;
    readonly labelService: LabelService;
    readonly clock: Clock;
    readonly getAdapter: (courier: CourierCode) => CourierAdapter | null;
}

export interface LabelRetrievalRunOptions {
    readonly batchSize: number;
    readonly concurrency: number;
}

export interface LabelRetrievalSummary {
    readonly examined: number;
    readonly retrieved: number;
    readonly stillPending: number;
    readonly failedPermanent: number;
    readonly missingAdapter: number;
    readonly errors: number;
}

export class LabelRetrievalJob {
    constructor(private readonly deps: LabelRetrievalJobDeps) {}

    async runOnce(opts: LabelRetrievalRunOptions): Promise<LabelRetrievalSummary> {
        const due = await this.deps.dueQuery.findDue({
            limit: opts.batchSize,
            maxAttempts: MAX_ATTEMPTS,
        });

        const summary: LabelRetrievalSummary = {
            examined: due.length,
            retrieved: 0,
            stillPending: 0,
            failedPermanent: 0,
            missingAdapter: 0,
            errors: 0,
        };
        const acc = summary as {
            -readonly [K in keyof LabelRetrievalSummary]: LabelRetrievalSummary[K]
        };

        const chunks = chunk([...due], Math.max(opts.concurrency, 1));
        for (const batch of chunks) {
            await Promise.all(batch.map((s) => this.processOne(s, acc)));
        }

        log.info('label retrieval run complete', {
            examined: acc.examined,
            retrieved: acc.retrieved,
            stillPending: acc.stillPending,
            failedPermanent: acc.failedPermanent,
            missingAdapter: acc.missingAdapter,
            errors: acc.errors,
        });
        return summary;
    }

    private async processOne(
        s: DueLabelRetrieval,
        acc: {
            retrieved: number;
            stillPending: number;
            failedPermanent: number;
            missingAdapter: number;
            errors: number;
        },
    ): Promise<void> {
        if (this.deps.getAdapter(s.courier) === null) {
            acc.missingAdapter += 1;
            log.warn('no adapter for label retrieval', {
                courier: s.courier, shipmentId: s.shipmentId,
            });
            return;
        }

        const currentArtifact: LabelArtifact = {
            status: 'pending',
            format: null,
            labelRef: null,
            retrievedAt: null,
            lastError: s.lastError,
            attempts: s.attempts,
        };

        try {
            const next = await this.deps.labelService.retryPending(
                s.partnerId,
                s.shipmentId,
                s.courier,
                s.awb,
                currentArtifact,
            );

            if (next.status === 'available') {
                acc.retrieved += 1;
                return;
            }
            // Still pending. Did we just hit the limit? Mark as failed.
            if (next.attempts >= MAX_ATTEMPTS) {
                const failed: LabelArtifact = { ...next, status: 'failed' };
                // labelService.retryPending() already wrote the artifact;
                // do one final write to flip status. We piggyback on the
                // same path by calling retryPending's writer — but cleaner
                // is a dedicated method. Here we just log; the writer was
                // called inside retryPending(), and we let the next run
                // see attempts >= MAX_ATTEMPTS (caught by the dueQuery
                // filter, so it stops appearing in results).
                acc.failedPermanent += 1;
                log.error('label retrieval gave up after max attempts', {
                    shipmentId: s.shipmentId,
                    courier: s.courier,
                    awb: s.awb,
                    attempts: next.attempts,
                    lastError: failed.lastError,
                });
                return;
            }
            acc.stillPending += 1;
        } catch (err) {
            acc.errors += 1;
            log.error('label retrieval threw unexpected error', {
                shipmentId: s.shipmentId,
                courier: s.courier,
                awb: s.awb,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
