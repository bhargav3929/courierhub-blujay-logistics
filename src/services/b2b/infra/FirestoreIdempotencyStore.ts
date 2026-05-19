import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type {
    IdempotencyCommitInput,
    IdempotencyReserveInput,
    IdempotencyReserveResult,
    IdempotencyStore,
} from '@/types/b2b/ports';
import { COLLECTIONS } from './collections';
import { isAlreadyExistsError } from './firestoreErrors';

// Idempotency persistence at `shipment_idempotency/{partnerId}__{key}`.
//
// Document state machine:
//
//   (absent) ──create()──▶ in_progress ──commit()──▶ committed
//                              │
//                              └── (TTL expiry → absent)
//
// `create()` is atomic; the race between two concurrent reserves of the
// same key is decided at the Firestore level — exactly one becomes
// in_progress, the other reads the existing record and returns the
// appropriate state.

interface StoredIdempotency {
    partnerId: string;
    key: string;
    requestHash: string;
    status: 'in_progress' | 'committed' | 'failed';
    httpStatus?: number;
    responseBody?: unknown;
    expiresAt: Timestamp;
    createdAt: Timestamp;
    committedAt?: Timestamp;
}

function docId(partnerId: string, key: string): string {
    // `__` is the separator. Pattern is also enforced by validateIdempotencyKey()
    // upstream — the key cannot contain `__` because the validator rejects it.
    return `${partnerId}__${key}`;
}

export class FirestoreIdempotencyStore implements IdempotencyStore {
    constructor(private readonly db: Firestore) {}

    async reserve(input: IdempotencyReserveInput): Promise<IdempotencyReserveResult> {
        const ref = this.db
            .collection(COLLECTIONS.SHIPMENT_IDEMPOTENCY)
            .doc(docId(input.partnerId, input.key));

        const now = Timestamp.now();
        const expiresAt = Timestamp.fromMillis(now.toMillis() + input.ttlSeconds * 1000);

        try {
            await ref.create({
                partnerId: input.partnerId,
                key: input.key,
                requestHash: input.requestHash,
                status: 'in_progress',
                createdAt: now,
                expiresAt,
            });
            return { state: 'reserved' };
        } catch (err) {
            if (!isAlreadyExistsError(err)) throw err;

            // Existing record — inspect it.
            const snap = await ref.get();
            if (!snap.exists) {
                // Vanishingly rare race: doc was deleted between create() and
                // get(). Safest to surface as in_progress so the caller retries.
                return { state: 'in_progress' };
            }
            const data = snap.data() as StoredIdempotency;
            if (data.requestHash !== input.requestHash) {
                return { state: 'mismatch' };
            }
            if (data.status === 'committed') {
                return {
                    state: 'committed',
                    response: {
                        httpStatus: data.httpStatus ?? 200,
                        body: data.responseBody,
                    },
                };
            }
            // status === 'in_progress' (or 'failed' — also surfaced as in_progress
            // for retry safety; the original caller will eventually commit or TTL).
            return { state: 'in_progress' };
        }
    }

    async commit(input: IdempotencyCommitInput): Promise<void> {
        const ref = this.db
            .collection(COLLECTIONS.SHIPMENT_IDEMPOTENCY)
            .doc(docId(input.partnerId, input.key));
        await ref.update({
            status: 'committed',
            httpStatus: input.response.httpStatus,
            responseBody: input.response.body,
            committedAt: FieldValue.serverTimestamp(),
        });
    }
}
