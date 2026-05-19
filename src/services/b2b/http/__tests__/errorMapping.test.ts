import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    ingestErrorToApiError,
    mapIngestResult,
    zodErrorToApiError,
} from '../errorMapping';
import { EventId } from '../../../../../types/b2b/ids';
import type { IngestResult } from '../../../../../types/b2b/ingest';
import type { TransitionError } from '../../../../../types/b2b/state-machine';

describe('zodErrorToApiError', () => {
    const schema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
    });

    it('produces fieldErrors with dotted paths', () => {
        const result = schema.safeParse({ name: '', age: -1 });
        expect(result.success).toBe(false);
        if (!result.success) {
            const api = zodErrorToApiError(result.error);
            expect(api.code).toBe('invalid_request');
            expect(api.fieldErrors).toBeDefined();
            const fields = api.fieldErrors?.map(e => e.field) ?? [];
            expect(fields).toContain('name');
            expect(fields).toContain('age');
        }
    });

    it('handles nested paths correctly', () => {
        const nested = z.object({ user: z.object({ email: z.string().email() }) });
        const result = nested.safeParse({ user: { email: 'bad' } });
        if (!result.success) {
            const api = zodErrorToApiError(result.error);
            expect(api.fieldErrors?.[0].field).toBe('user.email');
        }
    });
});

describe('ingestErrorToApiError', () => {
    it('shipment_not_found → 404 not_found', () => {
        const r = ingestErrorToApiError({ code: 'shipment_not_found' });
        expect(r.httpStatus).toBe(404);
        expect(r.apiError.code).toBe('not_found');
    });

    it('initiator_source_mismatch → 400 invalid_request', () => {
        const r = ingestErrorToApiError({
            code: 'initiator_source_mismatch',
            initiator: 'partner_api',
            eventSource: 'bluedart',
        });
        expect(r.httpStatus).toBe(400);
        expect(r.apiError.code).toBe('invalid_request');
        expect(r.apiError.message).toMatch(/partner_api/);
    });

    it('future_event → 400 invalid_request with detail', () => {
        const r = ingestErrorToApiError({
            code: 'future_event',
            detail: '600000ms in future',
        });
        expect(r.httpStatus).toBe(400);
        expect(r.apiError.detail).toBe('600000ms in future');
    });

    it('state_transition_forbidden → 409 with descriptive message', () => {
        const transitionError: TransitionError = {
            code: 'forbidden_for_mode',
            fulfillmentMode: 'courier',
            trackingMode: 'automatic',
            reason: 'partner cannot drive this edge',
        };
        const r = ingestErrorToApiError({
            code: 'state_transition_forbidden',
            transitionError,
        });
        expect(r.httpStatus).toBe(409);
        expect(r.apiError.code).toBe('state_transition_forbidden');
        expect(r.apiError.message).toMatch(/fulfillmentMode=courier/);
    });
});

describe('mapIngestResult — recorded outcomes (200)', () => {
    it('applied → ok with from/to/effects', () => {
        const result: IngestResult = {
            outcome: 'applied',
            eventId: EventId('e_1'),
            from: 'picked_up',
            to: 'in_transit',
            effects: ['emit_partner_webhook'],
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(true);
        expect(mapped.status).toBe(200);
        if (mapped.ok) {
            expect(mapped.data.outcome).toBe('applied');
            expect(mapped.data.applied).toBe(true);
            expect(mapped.data.fromStatus).toBe('picked_up');
            expect(mapped.data.toStatus).toBe('in_transit');
            expect(mapped.data.effects).toEqual(['emit_partner_webhook']);
        }
    });

    it('duplicate → ok with applied=false', () => {
        const result: IngestResult = {
            outcome: 'duplicate',
            existingEventId: EventId('e_1'),
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(true);
        if (mapped.ok) {
            expect(mapped.data.outcome).toBe('duplicate');
            expect(mapped.data.applied).toBe(false);
        }
    });

    it('no_change/stale_by_rank → ok with outcome=stale_by_rank', () => {
        const result: IngestResult = {
            outcome: 'no_change',
            reason: 'stale_by_rank',
            recordedEventId: EventId('e_1'),
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(true);
        if (mapped.ok) {
            expect(mapped.data.outcome).toBe('stale_by_rank');
            expect(mapped.data.applied).toBe(false);
        }
    });

    it('authority_blocked → ok with reason carried', () => {
        const result: IngestResult = {
            outcome: 'authority_blocked',
            reason: 'beyond_courier_authority',
            recordedEventId: EventId('e_1'),
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(true);
        if (mapped.ok) {
            expect(mapped.data.outcome).toBe('authority_blocked');
            expect(mapped.data.authorityReason).toBe('beyond_courier_authority');
        }
    });

    it('illegal_recorded → ok with transitionErrorCode', () => {
        const result: IngestResult = {
            outcome: 'illegal_recorded',
            recordedEventId: EventId('e_1'),
            transitionError: { code: 'forbidden_transition', from: 'draft', command: 'mark_delivered' },
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(true);
        if (mapped.ok) {
            expect(mapped.data.outcome).toBe('illegal_recorded');
            expect(mapped.data.transitionErrorCode).toBe('forbidden_transition');
        }
    });

    it('projection_conflict → ok with applied=false', () => {
        const result: IngestResult = {
            outcome: 'projection_conflict',
            recordedEventId: EventId('e_1'),
            detail: 'version mismatch',
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(true);
        if (mapped.ok) {
            expect(mapped.data.outcome).toBe('projection_conflict');
        }
    });
});

describe('mapIngestResult — rejected (4xx)', () => {
    it('shipment_not_found → 404 not_found', () => {
        const result: IngestResult = {
            outcome: 'rejected',
            error: { code: 'shipment_not_found' },
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(false);
        if (!mapped.ok) {
            expect(mapped.status).toBe(404);
            expect(mapped.error.code).toBe('not_found');
        }
    });

    it('state_transition_forbidden → 409', () => {
        const result: IngestResult = {
            outcome: 'rejected',
            error: {
                code: 'state_transition_forbidden',
                transitionError: { code: 'forbidden_from_terminal', current: 'delivered' },
            },
        };
        const mapped = mapIngestResult(result);
        expect(mapped.ok).toBe(false);
        if (!mapped.ok) {
            expect(mapped.status).toBe(409);
            expect(mapped.error.code).toBe('state_transition_forbidden');
        }
    });
});
