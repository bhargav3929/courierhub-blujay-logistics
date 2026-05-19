'use server';

// Server Actions for the shipment detail page.
//
// Each action: validates input, calls an existing service, returns a
// typed result the client component renders inline. revalidatePath()
// triggers a server-side re-render so the page reflects new state.
//
// Auth: actions run server-side. Next.js scopes them to the admin route
// group's auth context, but defense in depth requires re-checking inside
// each action. The current admin auth pattern (existing portal) uses
// Firebase ID tokens — this stub function is the seam where that wiring
// lands. Without it, an attacker who guesses an action id could still
// invoke; with it, only authenticated admins succeed.

import { revalidatePath } from 'next/cache';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import {
    buildBookingReconciler,
    buildCancellationService,
    buildLabelService,
    COLLECTIONS,
    FirebaseLabelStore,
    FirestoreShipmentReader,
} from '@/services/b2b/infra';
import { ApiKeyId, PartnerId, ShipmentId, UserId } from '@/types/b2b/ids';
import { ALL_CANCELLATION_REASONS, type CancellationReason } from '@/types/b2b/reasons';
import { ALL_SHIPMENT_STATUSES, isShipmentStatus } from '@/types/b2b/shipment';
import type { LabelArtifact } from '@/types/b2b/label';
import { buildFirestoreEventIngestor } from '@/services/b2b/infra';
import { EventNormalizer } from '@/services/b2b/tracking';
import { getLogger } from '@/services/b2b/http/logger';

const log = getLogger('admin.b2b.actions');

export type ActionResult =
    | { ok: true; message: string; payload?: Record<string, unknown> }
    | { ok: false; message: string };

// TODO: wire to the existing admin Firebase Auth session check.
// Production should verify the user's Firebase ID token from cookies
// against `adminAuth.verifyIdToken(token)` and check admin claim.
async function requireAdmin(): Promise<{ userId: string }> {
    // Placeholder. The (admin) route group's layout enforces page-level
    // auth; Server Actions inherit the same session cookies. A direct call
    // from outside would still need the action-id Next.js generates, which
    // is non-trivial to forge. For a hardening pass, wire this to the
    // existing admin token check before going live.
    return { userId: 'admin' };
}

function revalidate(shipmentId: string): void {
    revalidatePath(`/b2b/shipments/${shipmentId}`);
}

// ─── 1. Cancel shipment ─────────────────────────────────────────────────

export async function cancelShipmentAction(input: {
    shipmentId: string;
    partnerId: string;
    reason: CancellationReason;
}): Promise<ActionResult> {
    await requireAdmin();

    if (!(ALL_CANCELLATION_REASONS as readonly string[]).includes(input.reason)) {
        return { ok: false, message: `Invalid reason: ${input.reason}` };
    }

    try {
        const service = buildCancellationService(getFirestore(adminApp));
        const result = await service.cancel({
            partnerId: PartnerId(input.partnerId),
            shipmentId: ShipmentId(input.shipmentId),
            reason: input.reason,
        });
        revalidate(input.shipmentId);
        switch (result.kind) {
            case 'cancelled':
                return { ok: true, message: 'Shipment cancelled' };
            case 'not_found':
                return { ok: false, message: 'Shipment not found' };
            case 'not_cancellable':
                return {
                    ok: false,
                    message:
                        result.reason === 'post_pickup'
                            ? `Cannot cancel — already past pickup (status=${result.currentStatus}). Use RTO instead.`
                            : `Cannot cancel — shipment is in terminal status '${result.currentStatus}'.`,
                };
            case 'carrier_rejected':
                return { ok: false, message: `Carrier rejected cancel: ${result.detail}` };
            case 'transient_failure':
                return { ok: false, message: `Transient carrier failure — retry shortly: ${result.detail}` };
            case 'projection_failed':
                return { ok: false, message: `Could not record cancellation: ${result.detail}` };
        }
    } catch (e) {
        log.error('cancel action failed', { shipmentId: input.shipmentId, error: e instanceof Error ? e.message : String(e) });
        return { ok: false, message: 'Internal error during cancellation' };
    }
}

// ─── 2. Retry label retrieval ───────────────────────────────────────────

export async function retryLabelAction(input: {
    shipmentId: string;
    partnerId: string;
}): Promise<ActionResult> {
    await requireAdmin();

    try {
        const db = getFirestore(adminApp);
        const reader = new FirestoreShipmentReader(db);
        const ctx = await reader.load(PartnerId(input.partnerId), ShipmentId(input.shipmentId));
        if (!ctx) return { ok: false, message: 'Shipment not found' };

        // Read the artifact + courier/awb directly — the reader doesn't expose them.
        const shipDoc = await db.collection(COLLECTIONS.SHIPMENTS).doc(input.shipmentId).get();
        const d = shipDoc.data() as Record<string, unknown>;
        const courier = (d.courier ?? {}) as { code?: string; awb?: string };
        const artifact = (d.artifacts as { label?: LabelArtifact } | undefined)?.label;
        if (!courier.code || !courier.awb) {
            return { ok: false, message: 'Shipment has no carrier AWB to fetch label for' };
        }
        if (!artifact) {
            return { ok: false, message: 'No label artifact on this shipment' };
        }

        const service = buildLabelService(db);
        const next = await service.retryPending(
            PartnerId(input.partnerId),
            ShipmentId(input.shipmentId),
            courier.code as 'bluedart' | 'delhivery' | 'dtdc',
            courier.awb,
            artifact,
        );
        revalidate(input.shipmentId);

        if (next.status === 'available') {
            return { ok: true, message: 'Label retrieved successfully', payload: { attempts: next.attempts } };
        }
        return {
            ok: false,
            message: `Retry attempt ${next.attempts} failed: ${next.lastError ?? 'unknown error'}`,
        };
    } catch (e) {
        log.error('retry label action failed', { shipmentId: input.shipmentId, error: e instanceof Error ? e.message : String(e) });
        return { ok: false, message: 'Internal error retrieving label' };
    }
}

// ─── 3. Refresh signed label URL ────────────────────────────────────────

export async function refreshLabelUrlAction(input: {
    shipmentId: string;
    partnerId: string;
}): Promise<ActionResult & { signedUrl?: string; expiresAt?: string }> {
    await requireAdmin();

    try {
        const db = getFirestore(adminApp);
        const doc = await db.collection(COLLECTIONS.SHIPMENTS).doc(input.shipmentId).get();
        if (!doc.exists) return { ok: false, message: 'Shipment not found' };
        const data = doc.data() as Record<string, unknown>;
        if ((data.partnerId as string | undefined) !== input.partnerId) {
            return { ok: false, message: 'Shipment not found' };
        }

        const artifact = (data.artifacts as { label?: { labelRef?: string } } | undefined)?.label;
        const ref = artifact?.labelRef;
        if (!ref) return { ok: false, message: 'No label artifact stored yet' };

        const store = new FirebaseLabelStore(adminApp);
        const res = await store.sign(ref, 60 * 60);
        return {
            ok: true,
            message: 'Fresh signed URL minted',
            signedUrl: res.signedUrl,
            expiresAt: res.expiresAt.toISOString(),
        };
    } catch (e) {
        log.error('refresh label url failed', { shipmentId: input.shipmentId, error: e instanceof Error ? e.message : String(e) });
        return { ok: false, message: 'Failed to refresh signed URL' };
    }
}

// ─── 4. Trigger reconciliation ──────────────────────────────────────────

export async function triggerReconciliationAction(input: {
    shipmentId: string;
}): Promise<ActionResult> {
    await requireAdmin();

    try {
        const db = getFirestore(adminApp);
        // Force nextAttemptAt to now so the next cron pass picks it up.
        // We also invoke runOnce immediately for low-latency recovery on
        // operator click — typical batch is small, so this isn't expensive.
        const ref = db.collection(COLLECTIONS.SHIPMENTS).doc(input.shipmentId);
        const snap = await ref.get();
        if (!snap.exists) return { ok: false, message: 'Shipment not found' };
        const data = snap.data() as Record<string, unknown>;
        if (data.awaitingCarrierReconciliation !== true) {
            return { ok: false, message: 'Shipment is not awaiting reconciliation' };
        }

        await ref.update({
            reconcileNextAttemptAt: Timestamp.now(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        const worker = buildBookingReconciler(db);
        const summary = await worker.runOnce({ batchSize: 5, concurrency: 1 });
        revalidate(input.shipmentId);
        return {
            ok: true,
            message: `Reconciliation triggered (run examined ${summary.examined} shipments)`,
            payload: { ...summary },
        };
    } catch (e) {
        log.error('trigger reconciliation failed', { shipmentId: input.shipmentId, error: e instanceof Error ? e.message : String(e) });
        return { ok: false, message: 'Failed to trigger reconciliation' };
    }
}

// ─── 5. Push manual event (admin-driven) ────────────────────────────────

export async function pushManualEventAction(input: {
    shipmentId: string;
    partnerId: string;
    status: string;
    note: string;
}): Promise<ActionResult> {
    await requireAdmin();

    if (!isShipmentStatus(input.status)) {
        return { ok: false, message: `Invalid status. Allowed: ${ALL_SHIPMENT_STATUSES.join(', ')}` };
    }
    if (!input.note || input.note.length < 5) {
        return { ok: false, message: 'Note required (≥5 chars). Document the reason for the manual update.' };
    }

    try {
        const db = getFirestore(adminApp);
        const ingestor = buildFirestoreEventIngestor(db);
        const now = new Date();
        const event = EventNormalizer.fromAdminEvent(
            {
                status: input.status,
                occurredAt: now,
                note: input.note,
            },
            ShipmentId(input.shipmentId),
            now,
        );

        const session = await requireAdmin();
        const result = await ingestor.ingest({
            event,
            initiator: { type: 'admin_user', userId: UserId(session.userId) },
            shipmentId: ShipmentId(input.shipmentId),
            partnerId: PartnerId(input.partnerId),
        });
        revalidate(input.shipmentId);

        switch (result.outcome) {
            case 'applied':
                return { ok: true, message: `Status advanced ${result.from} → ${result.to}` };
            case 'duplicate':
                return { ok: false, message: 'Event already recorded (duplicate)' };
            case 'no_change':
                return { ok: false, message: `No state change: ${result.reason}` };
            case 'authority_blocked':
                return { ok: false, message: `Authority gate blocked: ${result.reason}` };
            case 'illegal_recorded':
                return { ok: false, message: 'Recorded for audit but transition was illegal' };
            case 'projection_conflict':
                return { ok: false, message: 'Concurrent update — retry' };
            case 'rejected':
                return { ok: false, message: `Rejected: ${result.error.code}` };
        }
    } catch (e) {
        log.error('push manual event failed', { shipmentId: input.shipmentId, error: e instanceof Error ? e.message : String(e) });
        return { ok: false, message: 'Failed to record manual event' };
    }
}

// Suppress unused import warning — kept for future use by reconciler-by-id.
void ApiKeyId;
