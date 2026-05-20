// Server-side B2B shipment queries for the admin dashboard.
//
// Uses firebase-admin Firestore. Filters are AND'd; cursor pagination uses
// the document's `createdAt` field with the last seen doc id as anchor.
// Filters resolve to where()/orderBy() calls; the composite indexes in
// firestore.indexes.json cover the standard combinations.

import {
    getFirestore,
    Timestamp,
    type Query,
    type Firestore,
    type DocumentData,
    type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { COLLECTIONS } from '@/services/b2b/infra';
import type {
    AdminShipmentFilters,
    AdminShipmentPage,
    AdminShipmentRow,
    ListAdminShipmentsInput,
} from '@/types/b2b/admin';
import {
    isCourierCode,
    isFulfillmentMode,
    isShipmentStatus,
    isTrackingMode,
} from '@/types/b2b/shipment';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const db = (): Firestore => getFirestore(adminApp);

// ─── public ─────────────────────────────────────────────────────────────

export async function listAdminShipments(
    input: ListAdminShipmentsInput,
): Promise<AdminShipmentPage> {
    const limit = clampLimit(input.limit);

    // AWB lookup is its own code path — exact match on a unique field.
    // We bypass the rest of the filter pipeline because AWB is uniquely
    // indexed and pagination doesn't apply.
    if (input.filters.awb) {
        const row = await findByAwb(input.filters.awb);
        return {
            rows: row ? [row] : [],
            nextCursor: null,
            prevCursor: null,
            totalEstimate: row ? 1 : 0,
        };
    }

    // externalRef lookup with optional partner filter — narrow by index.
    if (input.filters.externalRef && input.filters.partnerId) {
        const row = await findByExternalRef(input.filters.partnerId, input.filters.externalRef);
        return {
            rows: row ? [row] : [],
            nextCursor: null,
            prevCursor: null,
            totalEstimate: row ? 1 : 0,
        };
    }

    const baseQuery = buildBaseQuery(input.filters);
    let query: Query<DocumentData> = baseQuery
        .orderBy('createdAt', 'desc')
        .limit(limit + 1);     // +1 to detect hasMore

    if (input.cursor) {
        const cursorDoc = await db()
            .collection(COLLECTIONS.SHIPMENTS)
            .doc(input.cursor)
            .get();
        if (cursorDoc.exists) {
            query = query.startAfter(cursorDoc);
        }
    }

    const snap = await query.get();
    const docs = snap.docs.slice(0, limit);
    const hasMore = snap.docs.length > limit;
    const rows = docs.map(rowFromDoc);
    const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

    return {
        rows,
        nextCursor,
        prevCursor: null,    // single-direction pagination; "prev" via URL history
        totalEstimate: null,
    };
}

// Distinct partner ids — for the partner-filter dropdown.
// Naive impl reads all docs and dedupes; for a real partner list, query
// the `partners` collection directly. This works for low partner counts.
export async function listKnownPartnerIds(): Promise<readonly string[]> {
    try {
        const snap = await db().collection(COLLECTIONS.PARTNERS).limit(200).get();
        return snap.docs.map(d => d.id).sort();
    } catch {
        return [];
    }
}

// ─── internals ──────────────────────────────────────────────────────────

function buildBaseQuery(filters: AdminShipmentFilters): Query<DocumentData> {
    let q: Query<DocumentData> = db().collection(COLLECTIONS.SHIPMENTS);

    if (filters.partnerId) q = q.where('partnerId', '==', filters.partnerId);
    if (filters.clientId) q = q.where('clientId', '==', filters.clientId);
    if (filters.status) q = q.where('status', '==', filters.status);
    if (filters.courier) q = q.where('courier.code', '==', filters.courier);
    if (filters.fulfillmentMode) q = q.where('fulfillmentMode', '==', filters.fulfillmentMode);
    if (filters.trackingMode) q = q.where('trackingMode', '==', filters.trackingMode);
    if (filters.source) q = q.where('shipmentSource', '==', filters.source);
    if (filters.awaitingReconciliation === true) {
        q = q.where('awaitingCarrierReconciliation', '==', true);
    }
    if (filters.labelStatus) q = q.where('artifacts.label.status', '==', filters.labelStatus);
    if (filters.createdAfter) q = q.where('createdAt', '>=', Timestamp.fromDate(filters.createdAfter));
    if (filters.createdBefore) q = q.where('createdAt', '<=', Timestamp.fromDate(filters.createdBefore));

    return q;
}

async function findByAwb(awb: string): Promise<AdminShipmentRow | null> {
    const snap = await db()
        .collection(COLLECTIONS.SHIPMENTS)
        .where('courier.awb', '==', awb)
        .limit(1)
        .get();
    if (snap.empty) return null;
    return rowFromDoc(snap.docs[0]);
}

async function findByExternalRef(
    partnerId: string,
    externalRef: string,
): Promise<AdminShipmentRow | null> {
    const snap = await db()
        .collection(COLLECTIONS.SHIPMENTS)
        .where('partnerId', '==', partnerId)
        .where('externalRef', '==', externalRef)
        .limit(1)
        .get();
    if (snap.empty) return null;
    return rowFromDoc(snap.docs[0]);
}

function rowFromDoc(doc: QueryDocumentSnapshot<DocumentData>): AdminShipmentRow {
    const data = doc.data() as Record<string, unknown>;

    const status = pickString(data, 'status') ?? 'draft';
    const safeStatus = isShipmentStatus(status) ? status : 'draft';

    const fulfillmentMode = pickString(data, 'fulfillmentMode') ?? 'courier';
    const safeFulfillment = isFulfillmentMode(fulfillmentMode) ? fulfillmentMode : 'courier';

    const trackingMode = pickString(data, 'trackingMode') ?? 'automatic';
    const safeTracking = isTrackingMode(trackingMode) ? trackingMode : 'automatic';

    const courier = (data.courier ?? {}) as Record<string, unknown>;
    const courierCode = pickString(courier, 'code');
    const safeCourier = courierCode && isCourierCode(courierCode) ? courierCode : null;

    const tracking = (data.tracking ?? {}) as Record<string, unknown>;
    const artifacts = (data.artifacts ?? {}) as Record<string, unknown>;
    const label = (artifacts.label ?? {}) as Record<string, unknown>;
    const labelStatus = pickString(label, 'status');

    return {
        shipmentId: doc.id,
        partnerId: pickString(data, 'partnerId') ?? 'unknown',
        clientId: pickString(data, 'clientId'),
        externalRef: pickString(data, 'externalRef'),
        status: safeStatus,
        statusReason: pickString(data, 'statusReason'),
        shipmentSource: (pickString(data, 'shipmentSource') as AdminShipmentRow['shipmentSource']) ?? 'b2b_api',
        fulfillmentMode: safeFulfillment,
        trackingMode: safeTracking,
        courier: {
            code: safeCourier,
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

function clampLimit(n: number): number {
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    if (n > MAX_LIMIT) return MAX_LIMIT;
    return Math.floor(n);
}
