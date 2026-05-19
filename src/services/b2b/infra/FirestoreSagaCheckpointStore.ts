import {
    FieldValue,
    Timestamp,
    type Firestore,
} from 'firebase-admin/firestore';
import type {
    SagaCheckpoint,
    SagaCheckpointStore,
    SagaStatus,
} from '@/types/b2b/saga';
import { COLLECTIONS } from './collections';

// Saga state stored at b2b_sagas/{sagaId}.
//
// State payload is JSON-stringified into `stateJson`. Top-level fields
// (status, stepIndex, updatedAt, error, compensatedSteps) stay as proper
// Firestore fields so ops can query "compensation_failed sagas in last
// 24h" without parsing JSON.
//
// Dates inside the saga state survive the round-trip because JSON.stringify
// converts Date → ISO string and JSON.parse leaves it as a string. The
// SagaState type knows which fields are Dates and revives them on load
// (the revive function below).

interface StoredSaga {
    sagaId: string;
    status: SagaStatus;
    stepIndex: number;
    stateJson: string;
    error: string | null;
    compensatedSteps: string[];
    updatedAt: Timestamp;
    createdAt: Timestamp;
}

export interface DateField {
    readonly key: string;          // dot-notation path inside the state
}

export class FirestoreSagaCheckpointStore<S> implements SagaCheckpointStore<S> {
    constructor(
        private readonly db: Firestore,
        // List of dot-paths in S that hold Date values. After JSON.parse,
        // these fields are strings; the loader revives them. Caller supplies
        // this when constructing the store so the generic remains pure.
        private readonly dateFields: readonly string[] = [],
    ) {}

    async loadOrCreate(
        sagaId: string,
        initialState: S,
    ): Promise<{ exists: boolean; checkpoint: SagaCheckpoint<S> }> {
        const ref = this.db.collection(COLLECTIONS.B2B_SAGAS).doc(sagaId);
        const snap = await ref.get();

        if (snap.exists) {
            const data = snap.data() as StoredSaga;
            const state = this.reviveState(JSON.parse(data.stateJson) as S);
            return {
                exists: true,
                checkpoint: {
                    sagaId: data.sagaId,
                    stepIndex: data.stepIndex,
                    state,
                    status: data.status,
                    error: data.error ?? undefined,
                    compensatedSteps: data.compensatedSteps,
                    updatedAt: data.updatedAt.toDate(),
                },
            };
        }

        const now = Timestamp.now();
        const fresh: SagaCheckpoint<S> = {
            sagaId,
            stepIndex: 0,
            state: initialState,
            status: 'in_progress',
            compensatedSteps: [],
            updatedAt: now.toDate(),
        };

        try {
            await ref.create({
                sagaId,
                status: 'in_progress',
                stepIndex: 0,
                stateJson: JSON.stringify(initialState),
                error: null,
                compensatedSteps: [],
                createdAt: now,
                updatedAt: now,
            } satisfies StoredSaga);
            return { exists: false, checkpoint: fresh };
        } catch (err) {
            // A concurrent loadOrCreate just won. Re-read.
            const re = await ref.get();
            if (re.exists) {
                const data = re.data() as StoredSaga;
                const state = this.reviveState(JSON.parse(data.stateJson) as S);
                return {
                    exists: true,
                    checkpoint: {
                        sagaId: data.sagaId,
                        stepIndex: data.stepIndex,
                        state,
                        status: data.status,
                        error: data.error ?? undefined,
                        compensatedSteps: data.compensatedSteps,
                        updatedAt: data.updatedAt.toDate(),
                    },
                };
            }
            throw err;
        }
    }

    async save(checkpoint: SagaCheckpoint<S>): Promise<void> {
        const ref = this.db.collection(COLLECTIONS.B2B_SAGAS).doc(checkpoint.sagaId);
        await ref.set(
            {
                sagaId: checkpoint.sagaId,
                status: checkpoint.status,
                stepIndex: checkpoint.stepIndex,
                stateJson: JSON.stringify(checkpoint.state),
                error: checkpoint.error ?? null,
                compensatedSteps: [...checkpoint.compensatedSteps],
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
        );
    }

    // Walks the dateFields list and converts string → Date on the loaded state.
    private reviveState(state: S): S {
        if (this.dateFields.length === 0) return state;
        const obj = state as unknown as Record<string, unknown>;
        for (const path of this.dateFields) {
            setDeep(obj, path, parseDate(getDeep(obj, path)));
        }
        return obj as S;
    }
}

function getDeep(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

function setDeep(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const next = cur[part];
        if (next === null || next === undefined || typeof next !== 'object') return;
        cur = next as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
}

function parseDate(v: unknown): unknown {
    if (v instanceof Date) return v;
    if (typeof v === 'string') {
        const d = new Date(v);
        if (Number.isFinite(d.getTime())) return d;
    }
    return v;
}

// Booking-saga-specific date paths. Centralized here so callers don't
// re-derive them; pass to the constructor:
//
//   new FirestoreSagaCheckpointStore<BookingSagaState>(db, BOOKING_DATE_FIELDS)
export const BOOKING_SAGA_DATE_FIELDS: readonly string[] = [
    'pricing.quotedAt',
    'labelArtifact.retrievedAt',
];
