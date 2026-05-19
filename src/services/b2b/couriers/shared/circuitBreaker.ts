// Three-state in-memory circuit breaker.
//
//   closed   → calls pass through. Failures within the rolling window are
//              counted. When the count crosses `failureThreshold`, the
//              breaker opens.
//   open     → calls fail fast with a CircuitOpenError. After
//              `openDurationMs`, the next call probes (half-open).
//   half_open → one probe call is allowed. Success → closed; failure → open.
//
// Per-instance. For multi-process coordination, a separate Redis-backed
// implementation should hold shared state — but a process-local breaker
// already protects most outage scenarios (one bad instance opens its own
// breaker; healthy instances keep serving).

import { CarrierError } from './carrierErrors';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
    readonly failureThreshold: number;     // failures within window to open
    readonly rollingWindowMs: number;
    readonly openDurationMs: number;        // before transitioning to half-open
    readonly halfOpenProbeCount: number;    // consecutive probe successes to close
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    rollingWindowMs: 60_000,
    openDurationMs: 30_000,
    halfOpenProbeCount: 2,
};

export class CircuitOpenError extends Error {
    constructor(public readonly key: string, public readonly openUntilMs: number) {
        super(`circuit open for '${key}' until ${new Date(openUntilMs).toISOString()}`);
        this.name = 'CircuitOpenError';
    }
}

interface CircuitData {
    state: CircuitState;
    failures: number[];          // unix-ms of recent failures
    openedAtMs: number;
    halfOpenSuccesses: number;
}

export class CircuitBreaker {
    private readonly state = new Map<string, CircuitData>();
    constructor(private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG) {}

    private getOrInit(key: string): CircuitData {
        let s = this.state.get(key);
        if (!s) {
            s = { state: 'closed', failures: [], openedAtMs: 0, halfOpenSuccesses: 0 };
            this.state.set(key, s);
        }
        return s;
    }

    stateOf(key: string): CircuitState {
        return this.state.get(key)?.state ?? 'closed';
    }

    async exec<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const s = this.getOrInit(key);
        const now = Date.now();

        // Lazy transition: open → half_open after openDurationMs.
        if (s.state === 'open' && now - s.openedAtMs >= this.config.openDurationMs) {
            s.state = 'half_open';
            s.halfOpenSuccesses = 0;
        }

        if (s.state === 'open') {
            throw new CircuitOpenError(key, s.openedAtMs + this.config.openDurationMs);
        }

        // Half-open allows one call at a time in spirit (no internal lock —
        // a few concurrent probes are tolerable for an in-memory breaker;
        // either they all succeed or they all fail together).
        try {
            const result = await fn();
            this.recordSuccess(s);
            return result;
        } catch (err) {
            if (this.shouldCountAsFailure(err)) {
                this.recordFailure(s, now);
            }
            throw err;
        }
    }

    private shouldCountAsFailure(err: unknown): boolean {
        // Only count CarrierErrors (transient/unknown/auth). A programmer
        // bug (TypeError, RangeError) shouldn't trip the carrier circuit.
        if (err instanceof CarrierError) {
            // 'permanent' carrier errors are pricing/payload problems —
            // not a carrier outage. Don't count them.
            return err.category === 'transient' || err.category === 'unknown';
        }
        return false;
    }

    private recordSuccess(s: CircuitData): void {
        if (s.state === 'half_open') {
            s.halfOpenSuccesses += 1;
            if (s.halfOpenSuccesses >= this.config.halfOpenProbeCount) {
                s.state = 'closed';
                s.failures = [];
                s.halfOpenSuccesses = 0;
            }
        } else {
            // closed — clear any stale failures
            const cutoff = Date.now() - this.config.rollingWindowMs;
            s.failures = s.failures.filter(t => t >= cutoff);
        }
    }

    private recordFailure(s: CircuitData, now: number): void {
        if (s.state === 'half_open') {
            // probe failed — back to open
            s.state = 'open';
            s.openedAtMs = now;
            s.halfOpenSuccesses = 0;
            return;
        }
        const cutoff = now - this.config.rollingWindowMs;
        s.failures = s.failures.filter(t => t >= cutoff);
        s.failures.push(now);
        if (s.failures.length >= this.config.failureThreshold) {
            s.state = 'open';
            s.openedAtMs = now;
        }
    }

    // Test helper. Do not call from production code.
    _reset(): void {
        this.state.clear();
    }
}

// Module-level singleton — one breaker instance per process. Each
// (courier, operation) gets its own key.
export const DEFAULT_BREAKER = new CircuitBreaker();
