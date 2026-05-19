import type { Firestore } from 'firebase-admin/firestore';
import { EventId } from '@/types/b2b/ids';
import type { AppendEventInput, AppendEventResult, EventStore } from '@/types/b2b/ports';
import { COLLECTIONS } from './collections';
import { isAlreadyExistsError } from './firestoreErrors';
import { serializeEvent } from './serialization';

// Stores events at shipments/{shipmentId}/events/{dedupKey}.
//
// We use `create()` (not `set()`) so dedup is enforced atomically by
// Firestore: a second create with the same dedupKey throws ALREADY_EXISTS,
// which we map to `{ stored: false, existingEventId: dedupKey }`. There's
// no read-then-write race window.
//
// EventId is defined to equal dedupKey by construction. This is intentional:
// the dedupKey is already a sha256 hash, globally unique within a shipment,
// and stable across retries. Keeping them identical avoids a second id
// space to reason about.

export class FirestoreEventStore implements EventStore {
    constructor(private readonly db: Firestore) {}

    async appendOrFindDuplicate(input: AppendEventInput): Promise<AppendEventResult> {
        const ref = this.db
            .collection(COLLECTIONS.SHIPMENTS)
            .doc(input.shipmentId)
            .collection(COLLECTIONS.SHIPMENT_EVENTS)
            .doc(input.event.dedupKey);

        const doc = serializeEvent(input.event, {
            partnerId: input.partnerId,
            applied: input.applied,
            appliedReason: input.appliedReason,
            statusTransition: input.statusTransition,
            recordedAt: new Date(),
        });

        try {
            await ref.create(doc);
            return { stored: true, eventId: EventId(input.event.dedupKey) };
        } catch (err) {
            if (isAlreadyExistsError(err)) {
                return { stored: false, existingEventId: EventId(input.event.dedupKey) };
            }
            throw err;
        }
    }
}
