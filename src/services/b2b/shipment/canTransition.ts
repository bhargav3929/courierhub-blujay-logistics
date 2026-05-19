import type {
    InitiatorMatcher,
    StateInitiatorType,
    TransitionCommandKind,
    TransitionEffect,
    TransitionError,
} from '@/types/b2b/state-machine';
import type {
    FulfillmentMode,
    ShipmentStatus,
    TrackingMode,
} from '@/types/b2b/shipment';
import { TRANSITION_TABLE, type TransitionRule } from './transitionTable';

// Build lookup index once at module load.
// Key = `${from}::${command}` → unique rule (max one `to` per command from a given state).
// Throws at load time if any (from, command) pair is duplicated in the table —
// this is a fail-fast guard so contradictions cannot exist in production.
const RULE_INDEX: ReadonlyMap<string, TransitionRule> = (() => {
    const map = new Map<string, TransitionRule>();
    for (const rule of TRANSITION_TABLE) {
        const key = `${rule.from}::${rule.command}`;
        if (map.has(key)) {
            throw new Error(
                `transitionTable: duplicate rule for (from=${rule.from}, command=${rule.command}). ` +
                `Each (from, command) must have at most one destination state.`,
            );
        }
        map.set(key, rule);
    }
    return map;
})();

function indexKey(from: ShipmentStatus, command: TransitionCommandKind): string {
    return `${from}::${command}`;
}

function matcherMatches(
    m: InitiatorMatcher,
    initiator: StateInitiatorType,
    fulfillmentMode: FulfillmentMode,
    trackingMode: TrackingMode,
): boolean {
    if (m.initiator !== initiator) return false;
    if (m.fulfillmentMode && !m.fulfillmentMode.includes(fulfillmentMode)) return false;
    if (m.trackingMode && !m.trackingMode.includes(trackingMode)) return false;
    return true;
}

export interface CanTransitionInput {
    from: ShipmentStatus;
    command: TransitionCommandKind;
    initiator: StateInitiatorType;
    fulfillmentMode: FulfillmentMode;
    trackingMode: TrackingMode;
}

export type CanTransitionResult =
    | { ok: true; to: ShipmentStatus; effects: readonly TransitionEffect[] }
    | { ok: false; error: TransitionError };

// Pure, deterministic. The state machine consults this for table-driven
// transitions. release_hold and correct_status bypass this function entirely
// because their target state is dynamic, not table-encoded.
export function canTransition(input: CanTransitionInput): CanTransitionResult {
    const { from, command, initiator, fulfillmentMode, trackingMode } = input;

    const rule = RULE_INDEX.get(indexKey(from, command));
    if (!rule) {
        return {
            ok: false,
            error: { code: 'forbidden_transition', from, command },
        };
    }

    if (rule.allow.some(m => matcherMatches(m, initiator, fulfillmentMode, trackingMode))) {
        return { ok: true, to: rule.to, effects: rule.effects };
    }

    // Diagnose why no matcher fired: is the initiator listed at all?
    const initiatorListed = rule.allow.some(m => m.initiator === initiator);
    if (!initiatorListed) {
        return { ok: false, error: { code: 'forbidden_for_initiator', initiator } };
    }

    // Initiator is listed but the current modes don't satisfy any of its matchers.
    return {
        ok: false,
        error: {
            code: 'forbidden_for_mode',
            fulfillmentMode,
            trackingMode,
            reason:
                `Initiator '${initiator}' may drive ${from}→${rule.to} only in specific modes; ` +
                `current fulfillment=${fulfillmentMode}, tracking=${trackingMode}.`,
        },
    };
}

// Diagnostic helper for tests and admin UI. Returns the destination status
// for a (from, command) if the edge exists, ignoring initiator/mode gates.
export function destinationOf(
    from: ShipmentStatus,
    command: TransitionCommandKind,
): ShipmentStatus | null {
    return RULE_INDEX.get(indexKey(from, command))?.to ?? null;
}
