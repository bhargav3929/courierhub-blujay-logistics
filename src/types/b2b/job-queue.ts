import type { EventId, PartnerId, ShipmentId } from './ids';
import type { ShipmentStatus } from './shipment';
import type { TransitionEffect } from './state-machine';

// Provider-agnostic queue port. Concrete implementations: InMemoryJobQueue
// (dev/tests), FirestoreJobQueue (prod starter), CloudTasksJobQueue (later).

export interface EnqueueRequest<T = unknown> {
    readonly topic: string;
    readonly payload: T;
    // Idempotency key. When provided, the queue MUST dedupe: re-enqueue
    // with the same key returns `{ enqueued: false }` without re-running.
    readonly dedupKey?: string;
    readonly delaySeconds?: number;
}

export interface EnqueueResult {
    readonly jobId: string;
    readonly enqueued: boolean;
}

export interface JobQueue {
    enqueue<T>(req: EnqueueRequest<T>): Promise<EnqueueResult>;
}

// What QueuedEffectDispatcher writes per effect. The worker reads this and
// performs the actual side-effect (call partner webhook, run COD settle,
// etc.). One envelope per effect for retry isolation: a failed
// `emit_partner_webhook` retry does not re-run `finalize_billing`.

export interface EffectEnvelope {
    readonly version: 1;
    readonly effect: TransitionEffect;
    readonly shipmentId: ShipmentId;
    readonly partnerId: PartnerId;
    readonly eventId: EventId;
    readonly from: ShipmentStatus;
    readonly to: ShipmentStatus;
    readonly dedupKey: string;          // = `${eventId}::${effect}`
    readonly enqueuedAt: string;        // ISO-8601
}

// What FirestoreJobQueue stores at b2b_jobs/{jobId}. The worker is free to
// add fields beyond this (e.g. `claimedBy`, `lockExpiresAt`).

export const ALL_JOB_STATUSES = [
    'pending',
    'in_progress',
    'completed',
    'failed',
    'dead_lettered',
] as const;
export type JobStatus = typeof ALL_JOB_STATUSES[number];

export interface JobRecord<T = unknown> {
    readonly jobVersion: 1;
    readonly jobId: string;
    readonly topic: string;
    readonly payload: T;
    readonly status: JobStatus;
    readonly attempts: number;
    readonly enqueuedAt: Date;
    readonly runAt: Date | null;
    readonly lastError: string | null;
    readonly deadLetter: boolean;
}
