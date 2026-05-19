import type { Firestore } from 'firebase-admin/firestore';
import { EventIngestor } from '../tracking/EventIngestor';
import { FirestoreEventStore } from './FirestoreEventStore';
import { FirestoreJobQueue } from './FirestoreJobQueue';
import { FirestoreProjectionWriter } from './FirestoreProjectionWriter';
import { FirestoreShipmentReader } from './FirestoreShipmentReader';
import { QueuedEffectDispatcher } from './QueuedEffectDispatcher';
import { SystemClock } from './SystemClock';

// ─── re-exports ─────────────────────────────────────────────────────────

export { COLLECTIONS } from './collections';
export type { CollectionName } from './collections';
export { isAlreadyExistsError, isNotFoundError } from './firestoreErrors';
export { FirebaseLabelStore } from './FirebaseLabelStore';
export type { FirebaseLabelStoreOptions } from './FirebaseLabelStore';
export { FirestoreEventReader } from './FirestoreEventReader';
export { FirestoreEventStore } from './FirestoreEventStore';
export { FirestoreIdempotencyStore } from './FirestoreIdempotencyStore';
export { FirestoreJobQueue } from './FirestoreJobQueue';
export { FirestoreProjectionWriter } from './FirestoreProjectionWriter';
export { FirestoreRateCardStore } from './FirestoreRateCardStore';
export {
    BOOKING_SAGA_DATE_FIELDS,
    FirestoreSagaCheckpointStore,
} from './FirestoreSagaCheckpointStore';
export { FirestoreShipmentReader } from './FirestoreShipmentReader';
export { FirestoreShipmentWriter } from './FirestoreShipmentWriter';
export { InMemoryJobQueue } from './InMemoryJobQueue';
export type { InMemoryJob } from './InMemoryJobQueue';
export { QueuedEffectDispatcher } from './QueuedEffectDispatcher';
export {
    CURRENT_EVENT_VERSION,
    deserializeEvent,
    serializeEvent,
} from './serialization';
export type { SerializeOpts, StoredEventDoc } from './serialization';
export {
    FirestoreServiceabilityChecker,
    InMemoryServiceabilityChecker,
} from './ServiceabilityCheckers';
export { SystemClock } from './SystemClock';

// Phase 3 Step 3 additions:
export { FirestoreLabelRetrievalDueQuery } from './FirestoreLabelRetrievalDueQuery';
export { FirestorePollingDueQuery } from './FirestorePollingDueQuery';
export { FirestoreReconciliationDueQuery } from './FirestoreReconciliationDueQuery';
export {
    buildBookingReconciler,
    buildBookingService,
    buildCancellationService,
    buildLabelRetrievalJob,
    buildLabelService,
    buildPollingWorker,
    buildQuoteEngine,
} from './factories';

// ─── wiring factory ─────────────────────────────────────────────────────

// Convenience for HTTP routes (Phase 2 step 4):
//
//     import { getFirestore } from 'firebase-admin/firestore';
//     import { adminApp } from '@/lib/firebaseAdmin';
//     import { buildFirestoreEventIngestor } from '@/services/b2b/infra';
//
//     const ingestor = buildFirestoreEventIngestor(getFirestore(adminApp));
//     await ingestor.ingest({ event, initiator, shipmentId, partnerId });

export function buildFirestoreEventIngestor(db: Firestore): EventIngestor {
    return new EventIngestor({
        shipmentReader: new FirestoreShipmentReader(db),
        eventStore: new FirestoreEventStore(db),
        projectionWriter: new FirestoreProjectionWriter(db),
        effectDispatcher: new QueuedEffectDispatcher(new FirestoreJobQueue(db)),
        clock: new SystemClock(),
    });
}
