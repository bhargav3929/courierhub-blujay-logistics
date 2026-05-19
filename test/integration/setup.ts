// Integration suite builder + seed/cleanup helpers.
//
// Pattern:
//
//   describe('something', () => {
//       const suite = makeSuite();
//       beforeAll(suite.setup);
//       afterAll(suite.teardown);
//       it('test', async () => {
//           const ctx = await suite.freshContext();
//           // ... use ctx.partnerId, ctx.bookingService, ctx.mockCarrier, ...
//       });
//   });

import { randomBytes } from 'node:crypto';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { adminApp } from '../../src/lib/firebaseAdmin';
import {
    buildBookingReconciler,
    buildBookingService,
    buildFirestoreEventIngestor,
    buildLabelRetrievalJob,
    buildPollingWorker,
    COLLECTIONS,
    InMemoryJobQueue,
    SystemClock,
} from '../../src/services/b2b/infra';
import {
    _resetCourierAdapterRegistry,
    _resetCourierWebhookRegistry,
    registerCourierAdapter,
    registerCourierWebhookHandler,
} from '../../src/services/b2b/couriers';
import type { CourierWebhookHandler, SignatureCheck } from '../../src/services/b2b/couriers/CourierWebhookHandler';
import { _resetCarrierRegistration } from '../../src/services/b2b/couriers/register';
import type { CredentialsResolver } from '../../src/types/b2b/courier-adapter';
import { ApiKeyId, PartnerId, ShipmentId } from '../../src/types/b2b/ids';
import type { BookingRequest } from '../../src/types/b2b/booking';
import type { AddressInput, ParcelInput } from '../../src/types/b2b/address';
import type { ShipmentLookup } from '../../src/types/b2b/ports';
import { FirestoreShipmentReader } from '../../src/services/b2b/infra';
import { MockCourierAdapter } from './mocks/MockCourierAdapter';

// ─── per-test context ──────────────────────────────────────────────────

export interface TestContext {
    readonly partnerId: PartnerId;
    readonly mockCarrier: MockCourierAdapter;
    readonly bookingService: ReturnType<typeof buildBookingService>;
    readonly bookingReconciler: ReturnType<typeof buildBookingReconciler>;
    readonly eventIngestor: ReturnType<typeof buildFirestoreEventIngestor>;
    readonly labelRetrievalJob: ReturnType<typeof buildLabelRetrievalJob>;
    readonly pollingWorker: ReturnType<typeof buildPollingWorker>;
    readonly db: Firestore;
    readonly jobQueue: InMemoryJobQueue;
    readonly clock: { now(): Date };
}

// ─── credentials resolver (test) ──────────────────────────────────────

function staticCredentialsResolver(): CredentialsResolver {
    return {
        async resolve() {
            return {
                loginId: 'test',
                licenseKey: 'test',
                customerCode: 'TEST',
                areaCode: 'BLR',
                baseUrl: 'http://localhost:0',     // never called; mock bypasses HTTP
                webhookSecret: 'test-webhook-secret',
            };
        },
    };
}

// ─── mock webhook handler ─────────────────────────────────────────────

class MockWebhookHandler implements CourierWebhookHandler {
    readonly courier;
    constructor(
        private readonly adapter: MockCourierAdapter,
        private readonly shipmentLookup: ShipmentLookup,
    ) {
        this.courier = adapter.courier;
    }
    async verifySignature(): Promise<SignatureCheck> { return { ok: true }; }
    parseEvents(body: unknown) { return this.adapter.parseWebhook(body); }
    async resolveShipment(event: { payload?: Readonly<Record<string, unknown>> }) {
        const awb = event.payload && typeof event.payload === 'object'
            ? (event.payload as { awb?: string }).awb
            : null;
        if (!awb) return null;
        return this.shipmentLookup.findByAwb(this.courier, awb);
    }
    normalize(raw: Parameters<typeof this.adapter.normalize>[0], shipmentId: ShipmentId, receivedAt: Date) {
        return this.adapter.normalize(raw, shipmentId, receivedAt);
    }
}

// ─── suite ─────────────────────────────────────────────────────────────

export function makeSuite() {
    const seededPartnerIds: string[] = [];
    let mockCarrier: MockCourierAdapter;

    async function setup() {
        // Register a single mock carrier for the whole suite. Reset is
        // called between tests to clear behavior + counters.
        _resetCarrierRegistration();
        _resetCourierAdapterRegistry();
        _resetCourierWebhookRegistry();

        const db = getFirestore(adminApp);
        mockCarrier = new MockCourierAdapter('bluedart');
        const reader = new FirestoreShipmentReader(db);
        registerCourierAdapter(mockCarrier);
        registerCourierWebhookHandler(new MockWebhookHandler(mockCarrier, reader));
    }

    async function freshContext(): Promise<TestContext> {
        // Each test gets a unique partnerId. Cleanup is per-suite, not
        // per-test, for speed; isolation is via the unique id.
        const partnerId = PartnerId(`test_partner_${randomBytes(4).toString('hex')}`);
        seededPartnerIds.push(partnerId);

        const db = getFirestore(adminApp);
        const jobQueue = new InMemoryJobQueue();

        // Reset mock state between tests.
        mockCarrier.reset();

        return {
            partnerId,
            mockCarrier,
            bookingService: buildBookingService(db),
            bookingReconciler: buildBookingReconciler(db),
            eventIngestor: buildFirestoreEventIngestor(db),
            labelRetrievalJob: buildLabelRetrievalJob(db),
            pollingWorker: buildPollingWorker(db),
            db,
            jobQueue,
            clock: new SystemClock(),
        };
    }

    async function teardown() {
        // Delete all docs created by this suite. Uses partnerId prefix
        // to isolate from any other suite that might be running.
        const db = getFirestore(adminApp);
        for (const partnerId of seededPartnerIds) {
            await deletePartnerData(db, partnerId);
        }
    }

    return { setup, teardown, freshContext, get mockCarrier() { return mockCarrier; } };
}

// ─── data-shape helpers ────────────────────────────────────────────────

let bookingCounter = 0;

export function makeBookingRequest(opts: {
    partnerId: PartnerId;
    idempotencyKey?: string;
    fulfillmentMode?: 'courier' | 'self_shipment' | 'pickup_only';
    preferredCourier?: 'bluedart' | 'delhivery' | 'dtdc';
    isCod?: boolean;
}): BookingRequest {
    return {
        partnerId: opts.partnerId,
        idempotencyKey: opts.idempotencyKey ?? `idem-${++bookingCounter}-${randomBytes(4).toString('hex')}`,
        apiKeyId: 'test-api-key',
        externalRef: `ext-${bookingCounter}`,
        fulfillmentMode: opts.fulfillmentMode ?? 'courier',
        trackingMode: opts.fulfillmentMode === 'self_shipment' ? 'manual' : 'automatic',
        preferredCourier: opts.preferredCourier ?? 'bluedart',
        origin: TEST_ORIGIN,
        destination: TEST_DESTINATION,
        parcel: opts.isCod
            ? { ...TEST_PARCEL, isCod: true, codAmountPaise: 50_000 }
            : TEST_PARCEL,
    };
}

export const TEST_ORIGIN: AddressInput = {
    name: 'Test Sender',
    phone: '+919876543210',
    line1: '12 MG Road',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560001',
    country: 'IN',
};

export const TEST_DESTINATION: AddressInput = {
    name: 'Test Receiver',
    phone: '+919876500000',
    line1: '1 Connaught Place',
    city: 'New Delhi',
    state: 'DL',
    pincode: '110001',
    country: 'IN',
};

export const TEST_PARCEL: ParcelInput = {
    weightGrams: 500,
    dimensionsCm: { length: 20, width: 15, height: 10 },
    declaredValuePaise: 50_000,
    contents: 'Test',
    isCod: false,
    codAmountPaise: 0,
};

// ─── partner data cleanup ──────────────────────────────────────────────

async function deletePartnerData(db: Firestore, partnerId: string): Promise<void> {
    // Delete all collections that the partner could have touched.
    await Promise.all([
        deleteByQuery(db.collection(COLLECTIONS.SHIPMENTS).where('partnerId', '==', partnerId)),
        deleteByQuery(db.collection(COLLECTIONS.B2B_SHIPMENT_IDEMPOTENCY_INDEX).where('partnerId', '==', partnerId)),
        deleteByQuery(db.collection(COLLECTIONS.SHIPMENT_IDEMPOTENCY).where('partnerId', '==', partnerId)),
        deleteByQuery(db.collection(COLLECTIONS.B2B_SAGAS)),    // sagas not partner-indexed; we rely on the suite being short
        deleteByQuery(db.collection(COLLECTIONS.B2B_JOBS)),
    ]);
}

async function deleteByQuery(q: FirebaseFirestore.Query): Promise<void> {
    const snap = await q.get();
    if (snap.empty) return;
    const batch = q.firestore.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
}

// ─── api key seed helper (for HTTP-layer tests if needed) ─────────────

import crypto from 'node:crypto';

export async function seedB2BApiKey(
    db: Firestore,
    partnerId: PartnerId,
): Promise<{ apiKeyId: string; rawKey: string }> {
    const rawKey = 'bj_' + crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const ref = await db.collection('clientApiKeys').add({
        scope: 'b2b_partner',
        partnerId,
        hash,
        keyPrefix: rawKey.slice(0, 11),
        label: 'integration-test',
        environment: 'sandbox',
        createdAt: Timestamp.now(),
        createdBy: 'integration-test',
        disabled: false,
    });
    return { apiKeyId: ref.id, rawKey };
}

// Re-export the API-key brand for tests that need to construct branded ids.
export { ApiKeyId };
