import { describe, it, expect } from 'vitest';
import { TRANSITION_TABLE } from '../transitionTable';
import {
    ALL_SHIPMENT_STATUSES,
    TERMINAL_STATUSES,
} from '../../../../types/b2b/shipment';
import {
    ALL_INITIATOR_TYPES,
    ALL_TRANSITION_EFFECTS,
} from '../../../../types/b2b/state-machine';

// Structural integrity of the transition table.
// These tests catch most authoring mistakes at CI time, before they reach prod.

describe('TRANSITION_TABLE — structural integrity', () => {
    it('has no duplicate (from, command) keys', () => {
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const r of TRANSITION_TABLE) {
            const key = `${r.from}::${r.command}`;
            if (seen.has(key)) dupes.push(key);
            seen.add(key);
        }
        expect(dupes).toEqual([]);
    });

    it('every from and to references a known ShipmentStatus', () => {
        const valid = new Set<string>(ALL_SHIPMENT_STATUSES);
        for (const r of TRANSITION_TABLE) {
            expect(valid.has(r.from)).toBe(true);
            expect(valid.has(r.to)).toBe(true);
        }
    });

    it('every effect is a known TransitionEffect', () => {
        const valid = new Set<string>(ALL_TRANSITION_EFFECTS);
        for (const r of TRANSITION_TABLE) {
            for (const e of r.effects) {
                expect(valid.has(e)).toBe(true);
            }
        }
    });

    it('every initiator matcher references a known StateInitiatorType', () => {
        const valid = new Set<string>(ALL_INITIATOR_TYPES);
        for (const r of TRANSITION_TABLE) {
            for (const m of r.allow) {
                expect(valid.has(m.initiator)).toBe(true);
            }
        }
    });

    it('no rule originates from a terminal status', () => {
        for (const r of TRANSITION_TABLE) {
            expect(TERMINAL_STATUSES.has(r.from)).toBe(false);
        }
    });

    it('every non-terminal status (except draft is sink-only ... no wait, draft has outgoing) has at least one outgoing rule', () => {
        const allFrom = new Set(TRANSITION_TABLE.map(r => r.from));
        for (const s of ALL_SHIPMENT_STATUSES) {
            if (TERMINAL_STATUSES.has(s)) continue;
            // on_hold's release_hold exit is handled by the state machine, not the table.
            // But on_hold DOES have table-encoded exits (cancel, initiate_rto), so it should be present.
            expect(allFrom.has(s)).toBe(true);
        }
    });

    it('every rule has at least one allowed initiator', () => {
        for (const r of TRANSITION_TABLE) {
            expect(r.allow.length).toBeGreaterThan(0);
        }
    });

    it('partner_api on courier-driven edges is always mode-constrained', () => {
        // If an edge can be driven by courier_webhook, then partner_api on the
        // same edge must NOT be unconstrained — otherwise partners in pure
        // courier+automatic mode could fabricate carrier scans.
        const offenders: string[] = [];
        for (const r of TRANSITION_TABLE) {
            const hasCourier = r.allow.some(m => m.initiator === 'courier_webhook');
            if (!hasCourier) continue;
            const partnerMatchers = r.allow.filter(m => m.initiator === 'partner_api');
            for (const pm of partnerMatchers) {
                const constrained = (pm.fulfillmentMode && pm.fulfillmentMode.length > 0)
                    || (pm.trackingMode && pm.trackingMode.length > 0);
                if (!constrained) {
                    offenders.push(`${r.from}→${r.to} via ${r.command}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('cancel transitions to cancelled, mark_delivered transitions to delivered, etc.', () => {
        // Sanity: command verbs should match destination nouns for the most
        // common cases. Catches accidental swaps in the table.
        const expectations: Array<{ command: string; to: string }> = [
            { command: 'cancel', to: 'cancelled' },
            { command: 'mark_delivered', to: 'delivered' },
            { command: 'mark_in_transit', to: 'in_transit' },
            { command: 'mark_out_for_delivery', to: 'out_for_delivery' },
            { command: 'mark_picked_up', to: 'picked_up' },
            { command: 'mark_undelivered', to: 'undelivered' },
            { command: 'put_on_hold', to: 'on_hold' },
            { command: 'initiate_rto', to: 'rto_initiated' },
            { command: 'mark_rto_in_transit', to: 'rto_in_transit' },
            { command: 'mark_rto_delivered', to: 'rto_delivered' },
            { command: 'mark_lost', to: 'lost' },
            { command: 'mark_damaged', to: 'damaged' },
            { command: 'mark_ready_for_pickup', to: 'ready_for_pickup' },
            { command: 'book', to: 'booked' },
        ];
        for (const exp of expectations) {
            const offenders = TRANSITION_TABLE
                .filter(r => r.command === exp.command && r.to !== exp.to)
                .map(r => `${r.from}→${r.to} via ${r.command} (expected ${exp.to})`);
            expect(offenders).toEqual([]);
        }
    });

    it('terminal transitions carry billing/ops effects', () => {
        const terminalDestinations = new Set<string>(['delivered', 'rto_delivered', 'lost', 'damaged']);
        for (const r of TRANSITION_TABLE) {
            if (!terminalDestinations.has(r.to)) continue;
            // cancelled is also terminal but archives label rather than billing —
            // skipped from this rule.
            expect(r.effects).toContain('emit_partner_webhook');
            expect(r.effects).toContain('finalize_billing');
        }
    });
});
