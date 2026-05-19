import { describe, it, expect, beforeEach } from 'vitest';
import { QueuedEffectDispatcher } from '../QueuedEffectDispatcher';
import { InMemoryJobQueue } from '../InMemoryJobQueue';
import type { EffectEnvelope } from '../../../../types/b2b/job-queue';
import { EventId, PartnerId, ShipmentId } from '../../../../types/b2b/ids';
import type { TransitionEffect } from '../../../../types/b2b/state-machine';

const SHIP = ShipmentId('ship_1');
const PARTNER = PartnerId('p_1');
const EVT = EventId('evt_xyz');

describe('QueuedEffectDispatcher', () => {
    let queue: InMemoryJobQueue;
    let dispatcher: QueuedEffectDispatcher;

    beforeEach(() => {
        queue = new InMemoryJobQueue();
        dispatcher = new QueuedEffectDispatcher(queue);
    });

    it('enqueues one job per effect', async () => {
        const effects: readonly TransitionEffect[] = ['emit_partner_webhook', 'finalize_billing'];
        await dispatcher.dispatch({
            shipmentId: SHIP, partnerId: PARTNER, eventId: EVT,
            effects,
            from: 'out_for_delivery', to: 'delivered',
        });
        expect(queue.jobs).toHaveLength(2);
        const topics = queue.jobs.map(j => j.topic).sort();
        expect(topics).toEqual([
            'b2b.effect.emit_partner_webhook',
            'b2b.effect.finalize_billing',
        ]);
    });

    it('uses {eventId}::{effect} as the queue dedupKey', async () => {
        await dispatcher.dispatch({
            shipmentId: SHIP, partnerId: PARTNER, eventId: EVT,
            effects: ['emit_partner_webhook'],
            from: 'picked_up', to: 'in_transit',
        });
        const env = queue.jobs[0].payload as EffectEnvelope;
        expect(env.dedupKey).toBe('evt_xyz::emit_partner_webhook');
        // The queue stores the job at that jobId
        expect(queue.jobs[0].jobId).toBe('evt_xyz::emit_partner_webhook');
    });

    it('redispatching the same event is idempotent (no double-fire)', async () => {
        const input = {
            shipmentId: SHIP, partnerId: PARTNER, eventId: EVT,
            effects: ['emit_partner_webhook', 'settle_cod', 'finalize_billing'] as readonly TransitionEffect[],
            from: 'out_for_delivery' as const, to: 'delivered' as const,
        };
        await dispatcher.dispatch(input);
        await dispatcher.dispatch(input);
        await dispatcher.dispatch(input);
        // 3 effects × 3 dispatches → would be 9 if not deduped.
        expect(queue.jobs).toHaveLength(3);
    });

    it('envelope payload carries the full transition context', async () => {
        await dispatcher.dispatch({
            shipmentId: SHIP, partnerId: PARTNER, eventId: EVT,
            effects: ['emit_partner_webhook'],
            from: 'picked_up', to: 'in_transit',
        });
        const env = queue.jobs[0].payload as EffectEnvelope;
        expect(env.version).toBe(1);
        expect(env.effect).toBe('emit_partner_webhook');
        expect(env.shipmentId).toBe(SHIP);
        expect(env.partnerId).toBe(PARTNER);
        expect(env.eventId).toBe(EVT);
        expect(env.from).toBe('picked_up');
        expect(env.to).toBe('in_transit');
        expect(env.enqueuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('empty effects array enqueues nothing', async () => {
        await dispatcher.dispatch({
            shipmentId: SHIP, partnerId: PARTNER, eventId: EVT,
            effects: [],
            from: 'picked_up', to: 'in_transit',
        });
        expect(queue.jobs).toHaveLength(0);
    });

    it('two distinct events produce distinct envelopes', async () => {
        await dispatcher.dispatch({
            shipmentId: SHIP, partnerId: PARTNER, eventId: EventId('evt_a'),
            effects: ['emit_partner_webhook'],
            from: 'picked_up', to: 'in_transit',
        });
        await dispatcher.dispatch({
            shipmentId: SHIP, partnerId: PARTNER, eventId: EventId('evt_b'),
            effects: ['emit_partner_webhook'],
            from: 'in_transit', to: 'out_for_delivery',
        });
        expect(queue.jobs).toHaveLength(2);
        expect(queue.jobs[0].jobId).toBe('evt_a::emit_partner_webhook');
        expect(queue.jobs[1].jobId).toBe('evt_b::emit_partner_webhook');
    });
});
