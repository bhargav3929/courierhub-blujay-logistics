// Server-side B2B partner API key operations.
//
// Storage shape on clientApiKeys/{id}:
//   { scope: 'b2b_partner', partnerId, hash, keyPrefix, label,
//     environment, createdAt, createdBy,
//     disabled?, disabledAt?, disabledBy?,
//     revokedAt?, revokedBy?, revokeReason?,
//     expiresAt?, lastUsedAt? }
//
// Merchant keys (no `scope` field) coexist in the same collection but
// are filtered out by every B2B query. The merchant apiKeyService is
// untouched.

import crypto from 'node:crypto';
import {
    FieldValue,
    Timestamp,
    type DocumentData,
    type Firestore,
} from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import type {
    B2BApiKeyEnvironment,
    B2BApiKeyMinted,
    B2BApiKeySummary,
} from '@/types/b2b/api-key';

const COLLECTION = 'clientApiKeys';
const db = (): Firestore => getFirestore(adminApp);

function sha256(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
}

function generateRawKey(): string {
    return 'bj_' + crypto.randomBytes(16).toString('hex');
}

function maskFromPrefix(prefix: string): string {
    return prefix + '••••••••••••••••••••••••';
}

// ─── mint ───────────────────────────────────────────────────────────────

export interface MintB2BApiKeyInput {
    readonly partnerId: string;
    readonly label: string;
    readonly environment: B2BApiKeyEnvironment;
    readonly createdBy: string;
    readonly expiresAt?: Date;
}

export async function mintB2BApiKey(
    input: MintB2BApiKeyInput,
): Promise<B2BApiKeyMinted> {
    if (!input.partnerId) {
        throw new Error('mintB2BApiKey: partnerId is required');
    }
    const rawKey = generateRawKey();
    const hash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 11);     // "bj_" + 8 hex
    const now = Timestamp.now();
    const label = (input.label ?? '').trim() || 'Untitled key';

    const docData: DocumentData = {
        scope: 'b2b_partner',
        partnerId: input.partnerId,
        clientId: null,
        hash,
        keyPrefix,
        label,
        environment: input.environment,
        createdAt: now,
        createdBy: input.createdBy,
        disabled: false,
    };
    if (input.expiresAt) {
        docData.expiresAt = Timestamp.fromDate(input.expiresAt);
    }

    const ref = await db().collection(COLLECTION).add(docData);

    return {
        id: ref.id,
        partnerId: input.partnerId,
        label,
        keyPrefix,
        rawKey,
        createdAt: now.toMillis(),
        environment: input.environment,
        scope: 'b2b_partner',
        expiresAt: input.expiresAt ? input.expiresAt.getTime() : null,
    };
}

// ─── list ───────────────────────────────────────────────────────────────

export async function listB2BApiKeys(
    partnerId?: string,
): Promise<readonly B2BApiKeySummary[]> {
    let q = db()
        .collection(COLLECTION)
        .where('scope', '==', 'b2b_partner') as FirebaseFirestore.Query<DocumentData>;
    if (partnerId) {
        q = q.where('partnerId', '==', partnerId);
    }
    const snap = await q.get();
    return snap.docs
        .map((d) => projectKey(d.id, d.data() as DocumentData))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getB2BApiKey(keyId: string): Promise<B2BApiKeySummary | null> {
    const snap = await db().collection(COLLECTION).doc(keyId).get();
    if (!snap.exists) return null;
    const data = snap.data() as DocumentData;
    if (data.scope !== 'b2b_partner') return null;
    return projectKey(snap.id, data);
}

// ─── revoke (permanent, terminal) ──────────────────────────────────────

export interface RevokeB2BApiKeyInput {
    readonly keyId: string;
    readonly revokedBy: string;
    readonly reason: string;
}

export type RevokeResult =
    | { ok: true }
    | { ok: false; reason: 'not_found' | 'not_b2b' | 'already_revoked' };

export async function revokeB2BApiKey(input: RevokeB2BApiKeyInput): Promise<RevokeResult> {
    const ref = db().collection(COLLECTION).doc(input.keyId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: 'not_found' };
    const data = snap.data() as DocumentData;
    if (data.scope !== 'b2b_partner') return { ok: false, reason: 'not_b2b' };
    if (data.revokedAt) return { ok: false, reason: 'already_revoked' };

    await ref.update({
        revokedAt: Timestamp.now(),
        revokedBy: input.revokedBy,
        revokeReason: input.reason.trim(),
    });
    return { ok: true };
}

// ─── disable / re-enable (reversible) ──────────────────────────────────

export interface SetB2BApiKeyDisabledInput {
    readonly keyId: string;
    readonly disabled: boolean;
    readonly actorId: string;
}

export type SetDisabledResult =
    | { ok: true }
    | { ok: false; reason: 'not_found' | 'not_b2b' | 'revoked' };

export async function setB2BApiKeyDisabled(
    input: SetB2BApiKeyDisabledInput,
): Promise<SetDisabledResult> {
    const ref = db().collection(COLLECTION).doc(input.keyId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: 'not_found' };
    const data = snap.data() as DocumentData;
    if (data.scope !== 'b2b_partner') return { ok: false, reason: 'not_b2b' };
    if (data.revokedAt) return { ok: false, reason: 'revoked' };

    if (input.disabled) {
        await ref.update({
            disabled: true,
            disabledAt: Timestamp.now(),
            disabledBy: input.actorId,
        });
    } else {
        await ref.update({
            disabled: false,
            disabledAt: null,
            disabledBy: null,
        });
    }
    return { ok: true };
}

// ─── projection helpers ────────────────────────────────────────────────

function projectKey(id: string, data: DocumentData): B2BApiKeySummary {
    const keyPrefix = (data.keyPrefix as string | undefined) ?? 'bj_••••••••';
    return {
        id,
        partnerId: (data.partnerId as string | undefined) ?? 'unknown',
        label: (data.label as string | undefined) ?? 'Untitled key',
        keyPrefix,
        maskedKey: maskFromPrefix(keyPrefix),
        scope: 'b2b_partner',
        environment: (data.environment as B2BApiKeyEnvironment | undefined) ?? 'production',
        createdAt: toDate(data.createdAt) ?? new Date(0),
        createdBy: typeof data.createdBy === 'string' ? data.createdBy : null,
        lastUsedAt: toDate(data.lastUsedAt),
        disabled: data.disabled === true,
        disabledAt: toDate(data.disabledAt),
        disabledBy: typeof data.disabledBy === 'string' ? data.disabledBy : null,
        revokedAt: toDate(data.revokedAt),
        revokedBy: typeof data.revokedBy === 'string' ? data.revokedBy : null,
        revokeReason: typeof data.revokeReason === 'string' ? data.revokeReason : null,
        expiresAt: toDate(data.expiresAt),
    };
}

function toDate(v: unknown): Date | null {
    if (v instanceof Timestamp) return v.toDate();
    return null;
}

// FieldValue is imported but only used in apiKeyService's lastUsedAt
// touch. Re-exported here so future write paths can pick it up without
// re-importing. Suppresses TS unused-import warning when refactoring.
void FieldValue;
