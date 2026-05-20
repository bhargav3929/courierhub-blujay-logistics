// Operational query helpers for the monitoring dashboards.
//
// Each function is a single Firestore query + defensive projection. The
// page does Promise.all over all five queries; failures are isolated per
// query so one bad section doesn't break the dashboard.

import {
    getFirestore,
    Timestamp,
    type DocumentData,
    type Firestore,
    type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { COLLECTIONS } from '@/services/b2b/infra';
import type {
    CarrierHealthRow,
    CompensationFailedSagaItem,
    DeadLetterJobItem,
    LabelFailureQueueItem,
    ReconciliationQueueItem,
    Severity,
} from '@/types/b2b/operations';
import { ALL_COURIER_CODES, isCourierCode, type CourierCode } from '@/types/b2b/shipment';

const DEFAULT_LIMIT = 25;
const STUCK_TRANSIT_DAYS = 3;

const db = (): Firestore => getFirestore(adminApp);

// ─── reconciliation queue ───────────────────────────────────────────────

export async function fetchReconciliationQueue(
    limit: number = DEFAULT_LIMIT,
): Promise<readonly ReconciliationQueueItem[]> {
    const snap = await db()
        .collection(COLLECTIONS.SHIPMENTS)
        .where('awaitingCarrierReconciliation', '==', true)
        .orderBy('reconcileNextAttemptAt', 'asc')
        .limit(limit)
        .get();

    return snap.docs
        .map((doc) => {
            const d = doc.data() as Record<string, unknown>;
            const courier = d.reconcileCourier;
            if (typeof courier !== 'string' || !isCourierCode(courier)) return null;
            return {
                shipmentId: doc.id,
                partnerId: pickString(d, 'partnerId') ?? 'unknown',
                courier,
                attempts: pickNumber(d, 'reconcileAttempts') ?? 0,
                nextAttemptAt: pickDate(d, 'reconcileNextAttemptAt'),
                markedAt: pickDate(d, 'updatedAt'),
                lastError: pickString(d, 'reconcileLastError'),
            } satisfies ReconciliationQueueItem;
        })
        .filter((x): x is ReconciliationQueueItem => x !== null);
}

// ─── label failure queue ────────────────────────────────────────────────

export async function fetchLabelFailureQueue(
    limit: number = DEFAULT_LIMIT,
): Promise<readonly LabelFailureQueueItem[]> {
    // Two queries: failed labels + pending-with-attempts.
    // Failed first (more critical), then pending overflow.
    const half = Math.max(1, Math.floor(limit / 2));
    const [failedSnap, pendingSnap] = await Promise.all([
        db()
            .collection(COLLECTIONS.SHIPMENTS)
            .where('artifacts.label.status', '==', 'failed')
            .limit(half)
            .get(),
        db()
            .collection(COLLECTIONS.SHIPMENTS)
            .where('artifacts.label.status', '==', 'pending')
            .where('artifacts.label.attempts', '>=', 2)
            .limit(limit - half)
            .get(),
    ]);

    const all = [...failedSnap.docs, ...pendingSnap.docs].map(toLabelFailureItem);
    return all;
}

function toLabelFailureItem(doc: QueryDocumentSnapshot<DocumentData>): LabelFailureQueueItem {
    const d = doc.data() as Record<string, unknown>;
    const courier = ((d.courier as Record<string, unknown> | undefined)?.code as string) ?? null;
    const safeCourier = courier && isCourierCode(courier) ? courier : null;
    const label = ((d.artifacts as Record<string, unknown> | undefined)?.label ?? {}) as Record<string, unknown>;
    const status = pickString(label, 'status');
    return {
        shipmentId: doc.id,
        partnerId: pickString(d, 'partnerId') ?? 'unknown',
        courier: safeCourier,
        awb: ((d.courier as Record<string, unknown> | undefined)?.awb as string | undefined) ?? null,
        labelStatus: status === 'failed' ? 'failed' : 'pending',
        attempts: pickNumber(label, 'attempts') ?? 0,
        lastError: pickString(label, 'lastError'),
        createdAt: pickDate(d, 'createdAt') ?? new Date(0),
    };
}

// ─── dead-letter jobs ───────────────────────────────────────────────────

export async function fetchDeadLetterJobs(
    limit: number = DEFAULT_LIMIT,
): Promise<readonly DeadLetterJobItem[]> {
    const snap = await db()
        .collection(COLLECTIONS.B2B_JOBS)
        .where('deadLetter', '==', true)
        .limit(limit)
        .get();

    return snap.docs.map((doc) => {
        const d = doc.data() as Record<string, unknown>;
        const payload = (d.payload ?? {}) as Record<string, unknown>;
        return {
            jobId: doc.id,
            topic: pickString(d, 'topic') ?? 'unknown',
            status: pickString(d, 'status') ?? 'unknown',
            attempts: pickNumber(d, 'attempts') ?? 0,
            enqueuedAt: pickDate(d, 'enqueuedAt'),
            lastError: pickString(d, 'lastError'),
            payloadPreview: previewPayload(payload),
            shipmentId: pickString(payload, 'shipmentId'),
            partnerId: pickString(payload, 'partnerId'),
        } satisfies DeadLetterJobItem;
    });
}

function previewPayload(p: Record<string, unknown>): Record<string, unknown> {
    // Pull operationally-useful fields; truncate the rest.
    const keep: Record<string, unknown> = {};
    const interesting = ['shipmentId', 'partnerId', 'eventId', 'effect', 'from', 'to'];
    for (const k of interesting) if (k in p) keep[k] = p[k];
    return keep;
}

// ─── compensation-failed sagas ──────────────────────────────────────────

export async function fetchCompensationFailedSagas(
    limit: number = DEFAULT_LIMIT,
): Promise<readonly CompensationFailedSagaItem[]> {
    const snap = await db()
        .collection(COLLECTIONS.B2B_SAGAS)
        .where('status', '==', 'compensation_failed')
        .orderBy('updatedAt', 'asc')
        .limit(limit)
        .get();

    return snap.docs.map((doc) => {
        const d = doc.data() as Record<string, unknown>;
        const { partnerId, shipmentId } = parseSagaId(doc.id);
        return {
            sagaId: doc.id,
            status: pickString(d, 'status') ?? 'compensation_failed',
            error: pickString(d, 'error'),
            stepIndex: pickNumber(d, 'stepIndex') ?? 0,
            compensatedSteps: Array.isArray(d.compensatedSteps)
                ? (d.compensatedSteps as string[]).filter((x) => typeof x === 'string')
                : [],
            updatedAt: pickDate(d, 'updatedAt') ?? new Date(0),
            shipmentId,
            partnerId,
            acknowledged: pickBoolean(d, 'opsAcknowledged') === true,
            acknowledgedNote: pickString(d, 'opsAcknowledgedNote'),
            acknowledgedAt: pickDate(d, 'opsAcknowledgedAt'),
        } satisfies CompensationFailedSagaItem;
    });
}

// `book::{partnerId}::{idempotencyKey}` — shipment id is recoverable from
// the booking record but not from the saga id itself. We only extract
// partnerId here; shipmentId is `null` and the UI links to the partner's
// shipment list.
function parseSagaId(id: string): { partnerId: string | null; shipmentId: string | null } {
    const parts = id.split('::');
    if (parts.length >= 2 && parts[0] === 'book') {
        return { partnerId: parts[1], shipmentId: null };
    }
    return { partnerId: null, shipmentId: null };
}

// ─── carrier health (derived) ──────────────────────────────────────────

export async function fetchCarrierHealth(): Promise<readonly CarrierHealthRow[]> {
    const stuckCutoff = Timestamp.fromMillis(
        Date.now() - STUCK_TRANSIT_DAYS * 24 * 60 * 60 * 1000,
    );

    // Per-courier counts. count() is a Firestore aggregation — single read
    // per query regardless of result size.
    const rows = await Promise.all(
        ALL_COURIER_CODES.map(async (courier) => {
            const [stuck, awaiting, pending, failed] = await Promise.all([
                countSafe(
                    db()
                        .collection(COLLECTIONS.SHIPMENTS)
                        .where('courier.code', '==', courier)
                        .where('status', '==', 'in_transit')
                        .where('tracking.lastEventAt', '<=', stuckCutoff),
                ),
                countSafe(
                    db()
                        .collection(COLLECTIONS.SHIPMENTS)
                        .where('reconcileCourier', '==', courier)
                        .where('awaitingCarrierReconciliation', '==', true),
                ),
                countSafe(
                    db()
                        .collection(COLLECTIONS.SHIPMENTS)
                        .where('courier.code', '==', courier)
                        .where('artifacts.label.status', '==', 'pending'),
                ),
                countSafe(
                    db()
                        .collection(COLLECTIONS.SHIPMENTS)
                        .where('courier.code', '==', courier)
                        .where('artifacts.label.status', '==', 'failed'),
                ),
            ]);

            const elevated = [
                stuck >= 5,
                awaiting >= 3,
                pending >= 10,
                failed >= 3,
            ].filter(Boolean).length;
            const severity: Severity =
                elevated >= 2 ? 'severe'
                : elevated === 1 ? 'warning'
                : 'nominal';

            return {
                courier,
                stuckInTransitCount: stuck,
                awaitingReconciliationCount: awaiting,
                pendingLabelsCount: pending,
                failedLabelsCount: failed,
                severity,
            } satisfies CarrierHealthRow;
        }),
    );
    return rows;
}

async function countSafe(q: FirebaseFirestore.Query): Promise<number> {
    try {
        const s = await q.count().get();
        return s.data().count;
    } catch {
        return 0;
    }
}

// ─── primitive pickers ─────────────────────────────────────────────────

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
function pickDate(obj: Record<string, unknown>, key: string): Date | null {
    const v = obj[key];
    if (v instanceof Timestamp) return v.toDate();
    return null;
}

// Re-export for use in pages that want a single import.
export { ALL_COURIER_CODES };
export type { CourierCode };
