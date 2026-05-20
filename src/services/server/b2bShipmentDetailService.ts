// Single-pass parallel fetch for the shipment details page.
//
// Reads:
//   1. shipments/{id}                                   ← summary, courier, label artifact
//   2. shipments/{id}/events/?orderBy=occurredAt desc   ← timeline + raw inspector
//   3. b2b_sagas/book::{partnerId}::{idempotencyKey}    ← saga diagnostics
//   4. shipment_idempotency/{partnerId}__{key}          ← HTTP idempotency record
//   5. LabelStore.sign(labelRef)                        ← signed URL for download
//
// All five resolve in parallel inside the page render. Any individual
// failure is captured per-section so the rest of the page still renders.

import {
    getFirestore,
    Timestamp,
    type Firestore,
    type DocumentData,
    type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { COLLECTIONS, FirebaseLabelStore } from '@/services/b2b/infra';
import type {
    IdempotencyRecordSnapshot,
    SagaSnapshot,
    ShipmentDetailView,
    StoredEventViewLite,
} from '@/types/b2b/admin-detail';
import {
    isCourierCode,
    isFulfillmentMode,
    isShipmentStatus,
    isTrackingMode,
} from '@/types/b2b/shipment';
import type { AdminShipmentRow } from '@/types/b2b/admin';

const DEFAULT_EVENT_LIMIT = 100;
const MAX_EVENT_LIMIT = 500;
const LABEL_URL_TTL_SECONDS = 60 * 60;     // 1h — fresh signed URL on each page load

const db = (): Firestore => getFirestore(adminApp);

export interface FetchShipmentDetailInput {
    readonly shipmentId: string;
    readonly eventLimit?: number;
}

export async function fetchShipmentDetail(
    input: FetchShipmentDetailInput,
): Promise<ShipmentDetailView | null> {
    const eventLimit = clamp(input.eventLimit ?? DEFAULT_EVENT_LIMIT, 1, MAX_EVENT_LIMIT);
    const shipmentRef = db().collection(COLLECTIONS.SHIPMENTS).doc(input.shipmentId);

    // Phase 1: read the shipment doc (and events in parallel). Saga + idempotency
    // are keyed on (partnerId, idempotencyKey) which we get from the shipment doc.
    const [shipmentSnap, eventsSnap] = await Promise.all([
        shipmentRef.get(),
        shipmentRef
            .collection(COLLECTIONS.SHIPMENT_EVENTS)
            .orderBy('occurredAt', 'desc')
            .limit(eventLimit + 1)
            .get(),
    ]);

    if (!shipmentSnap.exists) return null;
    const rawDoc = shipmentSnap.data() as Record<string, unknown>;
    const partnerId = (rawDoc.partnerId as string | undefined) ?? null;
    const idempotencyKey = (rawDoc.idempotencyKey as string | undefined) ?? null;

    const sagaId = partnerId && idempotencyKey ? `book::${partnerId}::${idempotencyKey}` : null;
    const idempotencyDocId = partnerId && idempotencyKey ? `${partnerId}__${idempotencyKey}` : null;

    // Phase 2: parallel fetch of saga + idempotency + label URL.
    const labelRef = pickLabelRef(rawDoc);

    const [sagaSnap, idemSnap, signedUrlOutcome] = await Promise.all([
        sagaId
            ? db().collection(COLLECTIONS.B2B_SAGAS).doc(sagaId).get().catch(() => null)
            : Promise.resolve(null),
        idempotencyDocId
            ? db().collection(COLLECTIONS.SHIPMENT_IDEMPOTENCY).doc(idempotencyDocId).get().catch(() => null)
            : Promise.resolve(null),
        labelRef ? signLabel(labelRef) : Promise.resolve({ url: null, error: null }),
    ]);

    const eventDocs = eventsSnap.docs.slice(0, eventLimit);
    const hasMore = eventsSnap.docs.length > eventLimit;

    return {
        shipment: rowFromShipmentDoc(shipmentSnap.id, rawDoc),
        rawShipmentDoc: rawDoc,
        events: eventDocs.map(projectEvent),
        hasMoreEvents: hasMore,
        saga: sagaSnap && sagaSnap.exists ? projectSaga(sagaSnap) : null,
        idempotency: idemSnap && idemSnap.exists ? projectIdempotency(idemSnap) : null,
        initialLabelUrl: signedUrlOutcome.url,
        initialLabelUrlError: signedUrlOutcome.error,
    };
}

// ─── label url helper ──────────────────────────────────────────────────

async function signLabel(labelRef: string): Promise<{ url: string | null; error: string | null }> {
    try {
        const store = new FirebaseLabelStore(adminApp);
        const res = await store.sign(labelRef, LABEL_URL_TTL_SECONDS);
        return { url: res.signedUrl, error: null };
    } catch (e) {
        return { url: null, error: e instanceof Error ? e.message : String(e) };
    }
}

// ─── projection helpers (defensive over loose Firestore data) ──────────

function rowFromShipmentDoc(
    id: string,
    data: Record<string, unknown>,
): AdminShipmentRow {
    const status = pickString(data, 'status') ?? 'draft';
    const safeStatus = isShipmentStatus(status) ? status : 'draft';
    const fulfillmentMode = pickString(data, 'fulfillmentMode') ?? 'courier';
    const safeFulfillment = isFulfillmentMode(fulfillmentMode) ? fulfillmentMode : 'courier';
    const trackingMode = pickString(data, 'trackingMode') ?? 'automatic';
    const safeTracking = isTrackingMode(trackingMode) ? trackingMode : 'automatic';
    const courier = (data.courier ?? {}) as Record<string, unknown>;
    const cCode = pickString(courier, 'code');
    const tracking = (data.tracking ?? {}) as Record<string, unknown>;
    const artifacts = (data.artifacts ?? {}) as Record<string, unknown>;
    const label = (artifacts.label ?? {}) as Record<string, unknown>;
    const labelStatus = pickString(label, 'status');

    return {
        shipmentId: id,
        partnerId: pickString(data, 'partnerId') ?? 'unknown',
        clientId: pickString(data, 'clientId'),
        externalRef: pickString(data, 'externalRef'),
        status: safeStatus,
        statusReason: pickString(data, 'statusReason'),
        shipmentSource: (pickString(data, 'shipmentSource') as AdminShipmentRow['shipmentSource']) ?? 'b2b_api',
        fulfillmentMode: safeFulfillment,
        trackingMode: safeTracking,
        courier: {
            code: cCode && isCourierCode(cCode) ? cCode : null,
            awb: pickString(courier, 'awb'),
            serviceCode: pickString(courier, 'serviceCode'),
        },
        label: {
            status: (labelStatus as AdminShipmentRow['label']['status']) ?? null,
            attempts: pickNumber(label, 'attempts') ?? 0,
        },
        reconciliation: {
            awaiting: pickBoolean(data, 'awaitingCarrierReconciliation') === true,
            attempts: pickNumber(data, 'reconcileAttempts') ?? 0,
            nextAttemptAt: pickTimestamp(data, 'reconcileNextAttemptAt'),
        },
        createdAt: pickTimestamp(data, 'createdAt') ?? new Date(0),
        updatedAt: pickTimestamp(data, 'updatedAt') ?? new Date(0),
        lastEventAt: pickTimestamp(tracking, 'lastEventAt'),
    };
}

function projectEvent(doc: QueryDocumentSnapshot<DocumentData>): StoredEventViewLite {
    const data = doc.data() as Record<string, unknown>;
    const location = (data.location ?? {}) as Record<string, unknown>;
    const transition = (data.statusTransition ?? null) as { from?: string; to?: string } | null;
    return {
        eventId: doc.id,
        type: pickString(data, 'type') ?? 'unknown',
        source: pickString(data, 'source') ?? 'unknown',
        rawCode: pickString(data, 'rawCode') ?? '',
        description: pickString(data, 'description') ?? '',
        occurredAt: pickTimestamp(data, 'occurredAt') ?? new Date(0),
        receivedAt: pickTimestamp(data, 'receivedAt') ?? new Date(0),
        recordedAt: pickTimestamp(data, 'recordedAt'),
        location: {
            city: pickString(location, 'city'),
            pincode: pickString(location, 'pincode'),
            raw: pickString(location, 'raw'),
        },
        facility: pickString(data, 'facility'),
        impliedStatus: pickString(data, 'impliedStatus'),
        impliedReason: pickString(data, 'impliedReason'),
        dedupKey: pickString(data, 'dedupKey') ?? doc.id,
        applied: pickBoolean(data, 'applied') === true,
        appliedReason: pickString(data, 'appliedReason') ?? 'unknown',
        statusTransition:
            transition && transition.from && transition.to
                ? { from: transition.from, to: transition.to }
                : null,
        payload: (data.payload && typeof data.payload === 'object')
            ? (data.payload as Readonly<Record<string, unknown>>)
            : null,
    };
}

function projectSaga(snap: { id: string; data(): DocumentData | undefined }): SagaSnapshot {
    const d = snap.data() as Record<string, unknown>;
    let parsedState: Readonly<Record<string, unknown>> = {};
    try {
        const json = pickString(d, 'stateJson');
        if (json) parsedState = JSON.parse(json) as Readonly<Record<string, unknown>>;
    } catch {
        // leave empty
    }
    return {
        sagaId: snap.id,
        status: pickString(d, 'status') ?? 'unknown',
        stepIndex: pickNumber(d, 'stepIndex') ?? 0,
        error: pickString(d, 'error'),
        compensatedSteps: Array.isArray(d.compensatedSteps)
            ? (d.compensatedSteps as string[])
            : [],
        updatedAt: pickTimestamp(d, 'updatedAt') ?? new Date(0),
        createdAt: pickTimestamp(d, 'createdAt'),
        state: parsedState,
    };
}

function projectIdempotency(snap: { id: string; data(): DocumentData | undefined }): IdempotencyRecordSnapshot {
    const d = snap.data() as Record<string, unknown>;
    return {
        partnerId: pickString(d, 'partnerId') ?? 'unknown',
        key: pickString(d, 'key') ?? snap.id,
        status: pickString(d, 'status') ?? 'unknown',
        httpStatus: pickNumber(d, 'httpStatus'),
        createdAt: pickTimestamp(d, 'createdAt'),
        committedAt: pickTimestamp(d, 'committedAt'),
        expiresAt: pickTimestamp(d, 'expiresAt'),
    };
}

function pickLabelRef(data: Record<string, unknown>): string | null {
    const a = data.artifacts as Record<string, unknown> | undefined;
    const l = (a?.label ?? {}) as Record<string, unknown>;
    const ref = l.labelRef;
    return typeof ref === 'string' ? ref : null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
    const v = obj[key];
    return typeof v === 'string' ? v : null;
}
function pickNumber(obj: Record<string, unknown>, key: string): number | null {
    const v = obj[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function pickBoolean(obj: Record<string, unknown>, key: string): boolean | null {
    const v = obj[key];
    return typeof v === 'boolean' ? v : null;
}
function pickTimestamp(obj: Record<string, unknown>, key: string): Date | null {
    const v = obj[key];
    if (v instanceof Timestamp) return v.toDate();
    return null;
}
function clamp(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
}
