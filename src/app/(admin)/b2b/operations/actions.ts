'use server';

import { revalidatePath } from 'next/cache';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { COLLECTIONS } from '@/services/b2b/infra';
import { getLogger } from '@/services/b2b/http/logger';

const log = getLogger('admin.b2b.operations.actions');

async function requireAdmin(): Promise<{ userId: string }> {
    // TODO: wire to admin Firebase Auth session check.
    return { userId: 'admin' };
}

export type ActionResult =
    | { ok: true; message: string }
    | { ok: false; message: string };

// ─── retry a dead-letter job ───────────────────────────────────────────

export async function retryDeadLetterJobAction(input: { jobId: string }): Promise<ActionResult> {
    const session = await requireAdmin();
    if (!input.jobId) return { ok: false, message: 'Missing job id' };

    try {
        const db = getFirestore(adminApp);
        const ref = db.collection(COLLECTIONS.B2B_JOBS).doc(input.jobId);
        const snap = await ref.get();
        if (!snap.exists) return { ok: false, message: 'Job not found' };

        await ref.update({
            status: 'pending',
            deadLetter: false,
            attempts: 0,
            lastError: null,
            runAt: Timestamp.now(),
            retriedAt: FieldValue.serverTimestamp(),
            retriedBy: session.userId,
        });
        revalidatePath('/b2b/operations');
        return { ok: true, message: 'Job re-queued' };
    } catch (e) {
        log.error('retry dead-letter failed', {
            jobId: input.jobId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Internal error retrying job' };
    }
}

// ─── permanently dismiss a dead-letter job ─────────────────────────────

export async function dismissDeadLetterJobAction(input: {
    jobId: string;
    reason: string;
}): Promise<ActionResult> {
    const session = await requireAdmin();
    if (!input.jobId) return { ok: false, message: 'Missing job id' };
    if (!input.reason || input.reason.trim().length < 5) {
        return { ok: false, message: 'Reason is required (≥5 chars) for audit log' };
    }

    try {
        const db = getFirestore(adminApp);
        const ref = db.collection(COLLECTIONS.B2B_JOBS).doc(input.jobId);
        await ref.update({
            status: 'dismissed',
            deadLetter: true,
            dismissedAt: FieldValue.serverTimestamp(),
            dismissedBy: session.userId,
            dismissReason: input.reason.trim(),
        });
        revalidatePath('/b2b/operations');
        return { ok: true, message: 'Job dismissed' };
    } catch (e) {
        log.error('dismiss dead-letter failed', {
            jobId: input.jobId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Internal error dismissing job' };
    }
}

// ─── acknowledge a compensation-failed saga ────────────────────────────
//
// Does NOT unstick the saga. Records an ops note so the same compensation
// failure doesn't get re-triaged repeatedly. The saga remains in
// `compensation_failed` until ops manually corrects via the shipment
// details page (e.g. correct_status admin override).

export async function acknowledgeCompensationFailureAction(input: {
    sagaId: string;
    note: string;
}): Promise<ActionResult> {
    const session = await requireAdmin();
    if (!input.sagaId) return { ok: false, message: 'Missing saga id' };
    if (!input.note || input.note.trim().length < 5) {
        return { ok: false, message: 'Note is required (≥5 chars) for audit log' };
    }

    try {
        const db = getFirestore(adminApp);
        const ref = db.collection(COLLECTIONS.B2B_SAGAS).doc(input.sagaId);
        const snap = await ref.get();
        if (!snap.exists) return { ok: false, message: 'Saga not found' };

        await ref.update({
            opsAcknowledged: true,
            opsAcknowledgedAt: FieldValue.serverTimestamp(),
            opsAcknowledgedBy: session.userId,
            opsAcknowledgedNote: input.note.trim(),
        });
        revalidatePath('/b2b/operations');
        return { ok: true, message: 'Acknowledgement recorded' };
    } catch (e) {
        log.error('acknowledge saga failure failed', {
            sagaId: input.sagaId,
            error: e instanceof Error ? e.message : String(e),
        });
        return { ok: false, message: 'Internal error recording acknowledgement' };
    }
}
