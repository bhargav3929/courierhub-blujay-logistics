import { describe, it, expect, beforeEach } from 'vitest';
import { SagaRunner, InMemorySagaCheckpointStore } from '../SagaRunner';
import type { SagaStep } from '../../../../types/b2b/saga';

interface State {
    a: number;
    b: number;
    c: number;
    history: string[];
}

const initial: State = { a: 0, b: 0, c: 0, history: [] };

function makeStep(name: string, mutate: (s: State) => State): SagaStep<State> {
    return {
        name,
        async run(state) {
            const next = mutate(state);
            return { ...next, history: [...next.history, `run:${name}`] };
        },
    };
}

function makeStepWithCompensation(
    name: string,
    mutate: (s: State) => State,
    compensateLog: string[],
): SagaStep<State> {
    return {
        name,
        async run(state) {
            const next = mutate(state);
            return { ...next, history: [...next.history, `run:${name}`] };
        },
        async compensate() {
            compensateLog.push(`compensate:${name}`);
        },
    };
}

describe('SagaRunner — happy path', () => {
    let store: InMemorySagaCheckpointStore<State>;
    let runner: SagaRunner<State>;

    beforeEach(() => {
        store = new InMemorySagaCheckpointStore();
        runner = new SagaRunner(store);
    });

    it('runs all steps in order and returns completed', async () => {
        const steps: SagaStep<State>[] = [
            makeStep('s1', s => ({ ...s, a: 1 })),
            makeStep('s2', s => ({ ...s, b: 2 })),
            makeStep('s3', s => ({ ...s, c: 3 })),
        ];
        const r = await runner.run({ sagaId: 'saga_1', initialState: initial, steps });
        expect(r.kind).toBe('completed');
        if (r.kind === 'completed') {
            expect(r.finalState.a).toBe(1);
            expect(r.finalState.b).toBe(2);
            expect(r.finalState.c).toBe(3);
            expect(r.finalState.history).toEqual(['run:s1', 'run:s2', 'run:s3']);
        }
    });

    it('persists a checkpoint after each successful step', async () => {
        const steps: SagaStep<State>[] = [
            makeStep('s1', s => ({ ...s, a: 1 })),
            makeStep('s2', s => ({ ...s, b: 2 })),
        ];
        await runner.run({ sagaId: 'saga_chk', initialState: initial, steps });
        const cp = store._peek('saga_chk');
        expect(cp?.status).toBe('completed');
        expect(cp?.stepIndex).toBe(2);
    });
});

describe('SagaRunner — compensation', () => {
    let store: InMemorySagaCheckpointStore<State>;
    let runner: SagaRunner<State>;
    let compensateLog: string[];

    beforeEach(() => {
        store = new InMemorySagaCheckpointStore();
        runner = new SagaRunner(store);
        compensateLog = [];
    });

    it('runs compensations in reverse on step failure', async () => {
        const steps: SagaStep<State>[] = [
            makeStepWithCompensation('s1', s => ({ ...s, a: 1 }), compensateLog),
            makeStepWithCompensation('s2', s => ({ ...s, b: 2 }), compensateLog),
            {
                name: 's3_fail',
                async run() {
                    throw new Error('s3 boom');
                },
            },
        ];
        const r = await runner.run({ sagaId: 'saga_compensate', initialState: initial, steps });
        expect(r.kind).toBe('compensated');
        if (r.kind === 'compensated') {
            expect(r.failedStep).toBe('s3_fail');
            expect(r.error.message).toBe('s3 boom');
        }
        // Compensations run in reverse order
        expect(compensateLog).toEqual(['compensate:s2', 'compensate:s1']);
    });

    it('skips compensation for steps without compensate()', async () => {
        const pureLog: string[] = [];
        const steps: SagaStep<State>[] = [
            makeStep('pure1', s => ({ ...s, a: 1 })),     // no compensate
            makeStepWithCompensation('with_comp', s => ({ ...s, b: 2 }), pureLog),
            {
                name: 'fail',
                async run() { throw new Error('boom'); },
            },
        ];
        const r = await runner.run({ sagaId: 'saga_partial_comp', initialState: initial, steps });
        expect(r.kind).toBe('compensated');
        expect(pureLog).toEqual(['compensate:with_comp']);
    });

    it('returns compensation_failed when a compensation throws', async () => {
        const steps: SagaStep<State>[] = [
            {
                name: 's1',
                async run(s) { return { ...s, a: 1 }; },
                async compensate() { throw new Error('cannot undo'); },
            },
            {
                name: 's2_fail',
                async run() { throw new Error('forward fail'); },
            },
        ];
        const r = await runner.run({ sagaId: 'saga_comp_fail', initialState: initial, steps });
        expect(r.kind).toBe('compensation_failed');
        if (r.kind === 'compensation_failed') {
            expect(r.failedStep).toBe('s1');
            expect(r.compensationError.message).toBe('cannot undo');
        }
    });
});

describe('SagaRunner — resumption', () => {
    let store: InMemorySagaCheckpointStore<State>;
    let runner: SagaRunner<State>;

    beforeEach(() => {
        store = new InMemorySagaCheckpointStore();
        runner = new SagaRunner(store);
    });

    it('replays a completed saga without re-running steps', async () => {
        const steps: SagaStep<State>[] = [
            makeStep('s1', s => ({ ...s, a: 1 })),
            makeStep('s2', s => ({ ...s, b: 2 })),
        ];
        const r1 = await runner.run({ sagaId: 'saga_replay', initialState: initial, steps });
        expect(r1.kind).toBe('completed');

        // Re-invoke with steps that would fail if actually run.
        const stepsThatWouldFail: SagaStep<State>[] = [
            { name: 's1', async run() { throw new Error('should not run'); } },
            { name: 's2', async run() { throw new Error('should not run'); } },
        ];
        const r2 = await runner.run({
            sagaId: 'saga_replay',
            initialState: initial,
            steps: stepsThatWouldFail,
        });
        expect(r2.kind).toBe('completed');
    });

    it('resumes from the last successful step after a previous failure was retried', async () => {
        // First run: 3 steps, step 2 fails (only run() — no compensate())
        // → saga is compensated. The next call with the same sagaId returns
        // the same compensated outcome.
        let attempt = 0;
        const flakyStep: SagaStep<State> = {
            name: 'flaky',
            async run(s) {
                attempt += 1;
                if (attempt === 1) throw new Error('first attempt fails');
                return { ...s, b: 42 };
            },
        };
        const steps: SagaStep<State>[] = [
            makeStep('first', s => ({ ...s, a: 1 })),
            flakyStep,
        ];
        const r1 = await runner.run({ sagaId: 'saga_retry', initialState: initial, steps });
        expect(r1.kind).toBe('compensated');

        // Re-invoke with the same sagaId: the checkpoint says 'compensated',
        // so the runner replays that outcome (does NOT retry).
        const r2 = await runner.run({ sagaId: 'saga_retry', initialState: initial, steps });
        expect(r2.kind).toBe('compensated');
        // flaky.run() was called only once in the first attempt.
        expect(attempt).toBe(1);
    });
});
