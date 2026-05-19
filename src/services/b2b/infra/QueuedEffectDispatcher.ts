import type { EffectDispatcher, EffectDispatchInput } from '@/types/b2b/ports';
import type { EffectEnvelope, JobQueue } from '@/types/b2b/job-queue';

// Fans out a single state-machine transition into one queued envelope per
// effect. Per-effect isolation means a failed `emit_partner_webhook` retry
// does NOT re-fire `finalize_billing` — each effect is its own job with
// its own attempts/retries/dead-letter lifecycle.
//
// Each envelope's dedupKey is `${eventId}::${effect}`. If the ingestor is
// somehow re-invoked for the same event (e.g. dead-letter replay), the
// queue dedupes — effects fire exactly once per (event, effect) pair.

export class QueuedEffectDispatcher implements EffectDispatcher {
    constructor(private readonly queue: JobQueue) {}

    async dispatch(input: EffectDispatchInput): Promise<void> {
        const enqueuedAt = new Date().toISOString();
        await Promise.all(
            input.effects.map((effect) => {
                const envelope: EffectEnvelope = {
                    version: 1,
                    effect,
                    shipmentId: input.shipmentId,
                    partnerId: input.partnerId,
                    eventId: input.eventId,
                    from: input.from,
                    to: input.to,
                    dedupKey: `${input.eventId}::${effect}`,
                    enqueuedAt,
                };
                return this.queue.enqueue({
                    topic: `b2b.effect.${effect}`,
                    payload: envelope,
                    dedupKey: envelope.dedupKey,
                });
            }),
        );
    }
}
