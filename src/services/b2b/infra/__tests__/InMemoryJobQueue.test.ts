import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryJobQueue } from '../InMemoryJobQueue';

describe('InMemoryJobQueue', () => {
    let q: InMemoryJobQueue;
    beforeEach(() => { q = new InMemoryJobQueue(); });

    it('enqueues a job and returns enqueued=true', async () => {
        const r = await q.enqueue({ topic: 'b2b.test', payload: { hello: 'world' } });
        expect(r.enqueued).toBe(true);
        expect(q.jobs).toHaveLength(1);
        expect(q.jobs[0].topic).toBe('b2b.test');
    });

    it('dedupes by dedupKey — second enqueue returns enqueued=false', async () => {
        const r1 = await q.enqueue({ topic: 't', payload: { a: 1 }, dedupKey: 'k1' });
        const r2 = await q.enqueue({ topic: 't', payload: { a: 2 }, dedupKey: 'k1' });
        expect(r1.enqueued).toBe(true);
        expect(r2.enqueued).toBe(false);
        expect(r1.jobId).toBe('k1');
        expect(r2.jobId).toBe('k1');
    });

    it('first writer wins — payload is not overwritten on dedup', async () => {
        await q.enqueue({ topic: 't', payload: { a: 1 }, dedupKey: 'k1' });
        await q.enqueue({ topic: 't', payload: { a: 999 }, dedupKey: 'k1' });
        expect(q.jobs).toHaveLength(1);
        expect((q.jobs[0].payload as { a: number }).a).toBe(1);
    });

    it('different dedupKeys produce distinct jobs', async () => {
        await q.enqueue({ topic: 't', payload: {}, dedupKey: 'k1' });
        await q.enqueue({ topic: 't', payload: {}, dedupKey: 'k2' });
        await q.enqueue({ topic: 't', payload: {}, dedupKey: 'k3' });
        expect(q.jobs).toHaveLength(3);
    });

    it('jobs without dedupKey are never deduplicated', async () => {
        await q.enqueue({ topic: 't', payload: {} });
        await q.enqueue({ topic: 't', payload: {} });
        await q.enqueue({ topic: 't', payload: {} });
        expect(q.jobs).toHaveLength(3);
    });

    it('preserves topic and delaySeconds', async () => {
        await q.enqueue({
            topic: 'b2b.effect.emit_partner_webhook',
            payload: {},
            delaySeconds: 60,
        });
        expect(q.jobs[0].topic).toBe('b2b.effect.emit_partner_webhook');
        expect(q.jobs[0].delaySeconds).toBe(60);
    });

    it('clear() empties the queue and clears the dedup index', async () => {
        await q.enqueue({ topic: 't', payload: {}, dedupKey: 'k1' });
        q.clear();
        expect(q.jobs).toHaveLength(0);

        // After clear, the same dedupKey is acceptable again.
        const r = await q.enqueue({ topic: 't', payload: {}, dedupKey: 'k1' });
        expect(r.enqueued).toBe(true);
    });
});
