// Server-side API-key operations.
//
// - mintApiKey(clientId, label): generates a new key, stores only the hash,
//   returns the raw key to the caller exactly once.
// - lookupApiKey(rawKey): hashes the incoming key, finds the matching record,
//   returns the resolved clientId. Rejects revoked keys.
// - listApiKeys(clientId): returns sanitised summaries (no hash, no raw key).
// - revokeApiKey(clientId, keyId): soft-revoke (sets revokedAt).
//
// All operations use firebase-admin Firestore — server-side only.
import {
    getFirestore,
    Timestamp,
    FieldValue,
} from 'firebase-admin/firestore';
import crypto from 'crypto';
import { adminApp } from '@/lib/firebaseAdmin';
import type { ApiKeyMinted, ApiKeyRecord, ApiKeySummary } from '@/types/apiKey';

const COLLECTION = 'clientApiKeys';
const db = () => getFirestore(adminApp);

function sha256(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
}

function generateRawKey(): string {
    // 16 bytes = 32 hex chars. `bj_` prefix marks it as ours.
    return 'bj_' + crypto.randomBytes(16).toString('hex');
}

function maskFromPrefix(prefix: string): string {
    // e.g. "bj_a3f5b8c9" + tail of dots → "bj_a3f5b8c9••••••••••••••••••••••••"
    return prefix + '••••••••••••••••••••••••';
}

export async function mintApiKey(
    clientId: string,
    label: string
): Promise<ApiKeyMinted> {
    const rawKey = generateRawKey();
    const hash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 11);    // "bj_" + 8 hex chars
    const now = Timestamp.now();

    const ref = await db().collection(COLLECTION).add({
        clientId,
        hash,
        keyPrefix,
        label: label.trim() || 'Untitled key',
        createdAt: now,
    });

    return {
        id: ref.id,
        label: label.trim() || 'Untitled key',
        rawKey,
        createdAt: now.toMillis(),
    };
}

/**
 * Look up a key by its raw value. Hash first, then index lookup.
 * Returns null if not found or if the key has been revoked.
 * Updates lastUsedAt in the background (fire-and-forget — don't block auth).
 */
export async function lookupApiKey(
    rawKey: string
): Promise<{ clientId: string; keyId: string } | null> {
    if (!rawKey || !rawKey.startsWith('bj_')) return null;
    const hash = sha256(rawKey);
    const snap = await db()
        .collection(COLLECTION)
        .where('hash', '==', hash)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() as Omit<ApiKeyRecord, 'id'>;
    if (data.revokedAt) return null;

    // Touch lastUsedAt asynchronously — failures are logged but non-fatal.
    doc.ref
        .update({ lastUsedAt: FieldValue.serverTimestamp() })
        .catch((err) =>
            console.warn(`[apiKey] lastUsedAt update failed: ${err?.message || err}`)
        );

    return { clientId: data.clientId, keyId: doc.id };
}

export async function listApiKeys(clientId: string): Promise<ApiKeySummary[]> {
    const snap = await db()
        .collection(COLLECTION)
        .where('clientId', '==', clientId)
        .get();
    return snap.docs
        .map((d) => {
            const data = d.data() as Omit<ApiKeyRecord, 'id'>;
            return {
                id: d.id,
                label: data.label,
                createdAt: (data.createdAt as Timestamp).toMillis(),
                lastUsedAt: data.lastUsedAt
                    ? (data.lastUsedAt as Timestamp).toMillis()
                    : undefined,
                revokedAt: data.revokedAt
                    ? (data.revokedAt as Timestamp).toMillis()
                    : undefined,
                // Reconstructed from the stored keyPrefix (first 11 chars
                // of the raw key — safe to show, identifies the key visually).
                maskedKey: maskFromPrefix(data.keyPrefix || 'bj_••••••••'),
            } satisfies ApiKeySummary;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeApiKey(
    clientId: string,
    keyId: string
): Promise<{ ok: boolean; reason?: string }> {
    const ref = db().collection(COLLECTION).doc(keyId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: 'Key not found' };
    const data = snap.data() as Omit<ApiKeyRecord, 'id'>;
    if (data.clientId !== clientId) {
        return { ok: false, reason: 'Forbidden' };
    }
    if (data.revokedAt) {
        return { ok: true };       // already revoked — idempotent
    }
    await ref.update({ revokedAt: Timestamp.now() });
    return { ok: true };
}
