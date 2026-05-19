import type { EnqueueRequest, EnqueueResult, JobQueue } from '@/types/b2b/job-queue';

// Dev / test implementation. Records every enqueue in process memory; dedupes
// by `dedupKey`. NOT suitable for production — process restart erases all
// jobs. Use FirestoreJobQueue (durable) or a CloudTasksJobQueue
// implementation (later) in production.

export interface InMemoryJob<T = unknown> {
    readonly jobId: string;
    readonly topic: string;
    readonly payload: T;
    readonly delaySeconds: number;
    readonly enqueuedAt: Date;
}

export class InMemoryJobQueue implements JobQueue {
    public readonly jobs: InMemoryJob[] = [];
    private readonly byKey = new Map<string, InMemoryJob>();
    private counter = 0;

    async enqueue<T>(req: EnqueueRequest<T>): Promise<EnqueueResult> {
        if (req.dedupKey !== undefined) {
            const existing = this.byKey.get(req.dedupKey);
            if (existing) {
                return { jobId: existing.jobId, enqueued: false };
            }
        }
        const jobId = req.dedupKey ?? `mem_${++this.counter}`;
        const job: InMemoryJob<T> = {
            jobId,
            topic: req.topic,
            payload: req.payload,
            delaySeconds: req.delaySeconds ?? 0,
            enqueuedAt: new Date(),
        };
        this.jobs.push(job as InMemoryJob);
        if (req.dedupKey !== undefined) {
            this.byKey.set(req.dedupKey, job as InMemoryJob);
        }
        return { jobId, enqueued: true };
    }

    // Test helper: clear the queue between cases.
    clear(): void {
        this.jobs.length = 0;
        this.byKey.clear();
        this.counter = 0;
    }
}
