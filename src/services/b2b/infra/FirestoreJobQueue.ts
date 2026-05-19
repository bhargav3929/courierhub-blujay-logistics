import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { EnqueueRequest, EnqueueResult, JobQueue } from '@/types/b2b/job-queue';
import { COLLECTIONS } from './collections';
import { isAlreadyExistsError } from './firestoreErrors';

// Production-starter durable queue: writes jobs to `b2b_jobs/{jobId}`.
// A separate worker process (cron-pull or onWrite Cloud Function — not
// part of this step) consumes pending jobs.
//
// Why Firestore instead of Cloud Tasks now: zero new infra dependency.
// When throughput or retry semantics demand it, swap to Cloud Tasks by
// implementing the same JobQueue interface — nothing in the ingestor or
// dispatcher changes.
//
// Dedup: the jobId equals the supplied dedupKey when present. `create()`
// is atomic-or-fail. ALREADY_EXISTS → enqueued: false (idempotent enqueue).

export class FirestoreJobQueue implements JobQueue {
    constructor(private readonly db: Firestore) {}

    async enqueue<T>(req: EnqueueRequest<T>): Promise<EnqueueResult> {
        const jobId = req.dedupKey ?? randomUUID();
        const ref = this.db.collection(COLLECTIONS.B2B_JOBS).doc(jobId);

        const runAt = req.delaySeconds && req.delaySeconds > 0
            ? Timestamp.fromMillis(Date.now() + req.delaySeconds * 1000)
            : Timestamp.now();

        try {
            await ref.create({
                jobVersion: 1,
                jobId,
                topic: req.topic,
                payload: req.payload,
                status: 'pending',
                attempts: 0,
                enqueuedAt: FieldValue.serverTimestamp(),
                runAt,
                lastError: null,
                deadLetter: false,
            });
            return { jobId, enqueued: true };
        } catch (err) {
            if (isAlreadyExistsError(err)) {
                return { jobId, enqueued: false };
            }
            throw err;
        }
    }
}
