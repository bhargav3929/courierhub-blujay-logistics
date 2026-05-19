import type {
    SagaCheckpoint,
    SagaCheckpointStore,
    SagaOutcome,
    SagaStep,
} from '@/types/b2b/saga';
import { getLogger } from '@/services/b2b/http/logger';

// Generic step-runner with checkpoint persistence + reverse compensation.
//
// Contract:
//   - Steps run sequentially. Each step's `run(state)` returns the next state.
//   - After each successful step, the runner writes a checkpoint.
//   - On step failure, the runner walks the already-completed steps in
//     reverse and calls `compensate(state)` on any that have one.
//   - The runner is safe to re-invoke with the same sagaId: it reloads
//     the checkpoint and resumes from the next un-executed step.
//   - The runner never throws to the caller — it returns a typed
//     SagaOutcome. Compensation failures are surfaced explicitly so the
//     caller can escalate.

const log = getLogger('b2b.saga');

export interface SagaRunInput<S> {
    readonly sagaId: string;
    readonly initialState: S;
    readonly steps: readonly SagaStep<S>[];
    readonly requestId?: string;
}

export class SagaRunner<S> {
    constructor(private readonly checkpointStore: SagaCheckpointStore<S>) {}

    async run(input: SagaRunInput<S>): Promise<SagaOutcome<S>> {
        const { sagaId, initialState, steps, requestId } = input;

        // Load or create the checkpoint.
        const { exists, checkpoint } = await this.checkpointStore.loadOrCreate(
            sagaId,
            initialState,
        );

        // If a previous run completed, replay the outcome.
        if (exists && checkpoint.status === 'completed') {
            log.info('saga already completed — replaying outcome', { requestId, sagaId });
            return { kind: 'completed', finalState: checkpoint.state };
        }
        // Previously compensated or compensation-failed — surface to caller.
        if (exists && checkpoint.status === 'compensated') {
            log.info('saga already compensated — replaying outcome', { requestId, sagaId });
            return {
                kind: 'compensated',
                lastState: checkpoint.state,
                failedStep: checkpoint.error ?? 'unknown',
                error: new Error(checkpoint.error ?? 'previously compensated'),
            };
        }

        let state = checkpoint.state;
        const completedStepIndices: number[] = [];

        // If resuming, mark already-executed steps as complete (their state
        // is already in `state` from the loaded checkpoint).
        for (let i = 0; i < checkpoint.stepIndex; i++) {
            completedStepIndices.push(i);
        }

        for (let i = checkpoint.stepIndex; i < steps.length; i++) {
            const step = steps[i];
            const startMs = Date.now();
            try {
                state = await step.run(state);
                completedStepIndices.push(i);
                const durationMs = Date.now() - startMs;
                log.debug('saga step ok', {
                    requestId, sagaId, stepName: step.name, stepIndex: i, durationMs,
                });
                await this.checkpointStore.save({
                    sagaId,
                    stepIndex: i + 1,
                    state,
                    status: 'in_progress',
                    compensatedSteps: [],
                    updatedAt: new Date(),
                });
            } catch (err) {
                const stepError = err instanceof Error ? err : new Error(String(err));
                log.warn('saga step failed — beginning compensation', {
                    requestId, sagaId, stepName: step.name, stepIndex: i,
                    error: stepError.message,
                });
                return await this.compensate(
                    sagaId,
                    steps,
                    completedStepIndices,
                    state,
                    step.name,
                    stepError,
                    requestId,
                );
            }
        }

        // All steps completed.
        await this.checkpointStore.save({
            sagaId,
            stepIndex: steps.length,
            state,
            status: 'completed',
            compensatedSteps: [],
            updatedAt: new Date(),
        });
        log.info('saga completed', { requestId, sagaId, steps: steps.length });
        return { kind: 'completed', finalState: state };
    }

    private async compensate(
        sagaId: string,
        steps: readonly SagaStep<S>[],
        completedStepIndices: readonly number[],
        state: S,
        failedStep: string,
        failureError: Error,
        requestId?: string,
    ): Promise<SagaOutcome<S>> {
        const compensated: string[] = [];
        // Reverse order — most-recently-completed first.
        for (let j = completedStepIndices.length - 1; j >= 0; j--) {
            const idx = completedStepIndices[j];
            const step = steps[idx];
            if (!step.compensate) continue;
            try {
                await step.compensate(state);
                compensated.push(step.name);
                log.debug('saga compensation ok', { requestId, sagaId, stepName: step.name });
            } catch (compErr) {
                const message = compErr instanceof Error ? compErr.message : String(compErr);
                log.error('saga compensation FAILED — manual intervention required', {
                    requestId, sagaId, stepName: step.name, error: message,
                });
                await this.checkpointStore.save({
                    sagaId,
                    stepIndex: idx,
                    state,
                    status: 'compensation_failed',
                    error: `compensation of '${step.name}' failed: ${message}`,
                    compensatedSteps: compensated,
                    updatedAt: new Date(),
                });
                return {
                    kind: 'compensation_failed',
                    lastState: state,
                    failedStep: step.name,
                    compensationError: compErr instanceof Error ? compErr : new Error(message),
                };
            }
        }

        await this.checkpointStore.save({
            sagaId,
            stepIndex: 0,
            state,
            status: 'compensated',
            error: `step '${failedStep}' failed: ${failureError.message}`,
            compensatedSteps: compensated,
            updatedAt: new Date(),
        });
        log.info('saga compensated', { requestId, sagaId, failedStep });
        return {
            kind: 'compensated',
            lastState: state,
            failedStep,
            error: failureError,
        };
    }
}

// Simple in-memory implementation of SagaCheckpointStore for tests and
// single-process dev. Production uses a Firestore-backed implementation
// (Phase 3 Step 2) so checkpoints survive crashes.
export class InMemorySagaCheckpointStore<S> implements SagaCheckpointStore<S> {
    private readonly store = new Map<string, SagaCheckpoint<S>>();

    async loadOrCreate(
        sagaId: string,
        initialState: S,
    ): Promise<{ exists: boolean; checkpoint: SagaCheckpoint<S> }> {
        const existing = this.store.get(sagaId);
        if (existing) return { exists: true, checkpoint: existing };
        const fresh: SagaCheckpoint<S> = {
            sagaId,
            stepIndex: 0,
            state: initialState,
            status: 'in_progress',
            compensatedSteps: [],
            updatedAt: new Date(),
        };
        this.store.set(sagaId, fresh);
        return { exists: false, checkpoint: fresh };
    }

    async save(checkpoint: SagaCheckpoint<S>): Promise<void> {
        this.store.set(checkpoint.sagaId, checkpoint);
    }

    // Test helper.
    _peek(sagaId: string): SagaCheckpoint<S> | undefined {
        return this.store.get(sagaId);
    }
}
