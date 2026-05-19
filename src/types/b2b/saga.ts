// Generic saga primitives. Domain-agnostic; the booking saga is one
// instance, but the same runner can drive cancellation, RTO initiation,
// or anything else that needs ordered steps with compensating actions.

// A saga is a list of named steps. Each step:
//   - run(state)        — performs the forward action, returns the next state
//   - compensate(state) — optional reverse action (omit for pure steps)
//
// On any step failure (including retries exhausted), the runner walks the
// completed steps in reverse and calls `compensate` on each one. State at
// time of compensation reflects everything successful up to (but not
// including) the failed step.

export interface SagaStep<S> {
    readonly name: string;
    run(state: S): Promise<S>;
    compensate?(state: S): Promise<void>;
}

// Persisted between steps so a crash-and-restart can resume from the last
// successful checkpoint. The store impl owns serialization (Firestore doc,
// JSON file, etc.).
export interface SagaCheckpoint<S> {
    readonly sagaId: string;
    readonly stepIndex: number;          // index of next step to run
    readonly state: S;
    readonly status: SagaStatus;
    readonly error?: string;
    readonly compensatedSteps: readonly string[];
    readonly updatedAt: Date;
}

export type SagaStatus =
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'compensated'
    | 'compensation_failed';

export interface SagaCheckpointStore<S> {
    // Atomic load-or-create. On first call returns { exists: false, state: initialState }.
    // On subsequent calls returns the persisted state and step index.
    loadOrCreate(
        sagaId: string,
        initialState: S,
    ): Promise<{ exists: boolean; checkpoint: SagaCheckpoint<S> }>;

    save(checkpoint: SagaCheckpoint<S>): Promise<void>;
}

// The runner's terminal outcome. A `completed` saga produced final state;
// a `compensated` saga rolled back successfully; a `compensation_failed`
// saga partially rolled back — operator intervention required.

export type SagaOutcome<S> =
    | { kind: 'completed'; finalState: S }
    | { kind: 'compensated'; lastState: S; failedStep: string; error: Error }
    | { kind: 'compensation_failed'; lastState: S; failedStep: string; compensationError: Error };
