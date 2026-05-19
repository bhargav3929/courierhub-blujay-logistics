import type { Firestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import type { BookingSagaState } from '@/types/b2b/booking';
import {
    getCourierAdapter,
    listRegisteredAdapters,
} from '@/services/b2b/couriers';
import { BookingReconciler } from '@/services/b2b/booking/BookingReconciler';
import { BookingService } from '@/services/b2b/booking/BookingService';
import { LabelRetrievalJob } from '@/services/b2b/label/LabelRetrievalJob';
import { LabelService } from '@/services/b2b/label/LabelService';
import { SelfShipmentLabelGenerator } from '@/services/b2b/label/SelfShipmentLabelGenerator';
import { PollingWorker } from '@/services/b2b/tracking/PollingWorker';
import { QuoteEngine } from '@/services/b2b/quote/QuoteEngine';
import { CancellationService } from '@/services/b2b/cancel/CancellationService';
import { buildFirestoreEventIngestor } from './index';
import { FirebaseLabelStore } from './FirebaseLabelStore';
import { FirestoreIdempotencyStore } from './FirestoreIdempotencyStore';
import { FirestoreLabelRetrievalDueQuery } from './FirestoreLabelRetrievalDueQuery';
import { FirestorePollingDueQuery } from './FirestorePollingDueQuery';
import { FirestoreRateCardStore } from './FirestoreRateCardStore';
import { FirestoreReconciliationDueQuery } from './FirestoreReconciliationDueQuery';
import {
    BOOKING_SAGA_DATE_FIELDS,
    FirestoreSagaCheckpointStore,
} from './FirestoreSagaCheckpointStore';
import { FirestoreShipmentReader } from './FirestoreShipmentReader';
import { FirestoreShipmentWriter } from './FirestoreShipmentWriter';
import { FirestoreServiceabilityChecker } from './ServiceabilityCheckers';
import { SystemClock } from './SystemClock';

// Production wiring factories. Each route handler calls the factory for
// the service it needs. Per-request, but the underlying Firestore and
// Storage clients are pooled by the admin SDK — no real overhead.

export function buildBookingService(db: Firestore): BookingService {
    const shipmentWriter = new FirestoreShipmentWriter(db);
    const labelStore = new FirebaseLabelStore(adminApp);
    const eventIngestor = buildFirestoreEventIngestor(db);
    const rateCardStore = new FirestoreRateCardStore(db);
    const idempotencyStore = new FirestoreIdempotencyStore(db);
    const checkpointStore = new FirestoreSagaCheckpointStore<BookingSagaState>(
        db,
        BOOKING_SAGA_DATE_FIELDS,
    );
    const selfShipmentLabelGenerator = new SelfShipmentLabelGenerator();

    return new BookingService({
        idempotencyStore,
        shipmentWriter,
        rateCardStore,
        getAdapter: getCourierAdapter,
        eventIngestor,
        labelStore,
        clock: new SystemClock(),
        checkpointStore,
        selfShipmentLabelGenerator,
    });
}

export function buildQuoteEngine(db: Firestore): QuoteEngine {
    return new QuoteEngine({
        getAdapter: getCourierAdapter,
        listAdapters: listRegisteredAdapters,
        rateCardStore: new FirestoreRateCardStore(db),
        serviceabilityChecker: new FirestoreServiceabilityChecker(db),
    });
}

export function buildCancellationService(db: Firestore): CancellationService {
    return new CancellationService({
        shipmentReader: new FirestoreShipmentReader(db),
        eventIngestor: buildFirestoreEventIngestor(db),
        getAdapter: getCourierAdapter,
    });
}

export function buildLabelService(db: Firestore): LabelService {
    return new LabelService({
        shipmentReader: new FirestoreShipmentReader(db),
        shipmentWriter: new FirestoreShipmentWriter(db),
        labelStore: new FirebaseLabelStore(adminApp),
        getAdapter: getCourierAdapter,
    });
}

export function buildBookingReconciler(db: Firestore): BookingReconciler {
    return new BookingReconciler({
        dueQuery: new FirestoreReconciliationDueQuery(db),
        shipmentWriter: new FirestoreShipmentWriter(db),
        clock: new SystemClock(),
        getAdapter: getCourierAdapter,
    });
}

export function buildLabelRetrievalJob(db: Firestore): LabelRetrievalJob {
    return new LabelRetrievalJob({
        dueQuery: new FirestoreLabelRetrievalDueQuery(db),
        labelService: buildLabelService(db),
        clock: new SystemClock(),
        getAdapter: getCourierAdapter,
    });
}

export function buildPollingWorker(db: Firestore): PollingWorker {
    return new PollingWorker({
        dueQuery: new FirestorePollingDueQuery(db),
        ingestor: buildFirestoreEventIngestor(db),
        clock: new SystemClock(),
        getAdapter: getCourierAdapter,
    });
}
