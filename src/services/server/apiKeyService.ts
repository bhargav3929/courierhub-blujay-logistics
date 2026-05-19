// Server-side API-key operations — unified for B2C + B2B keys.
//
// - mintApiKey(clientId, opts): generates a key with a scope. Writes the
//   appropriate fields to Firestore. Raw key is returned exactly once.
// - lookupApiKey(rawKey): used by the B2C auth path. Rejects B2B-scoped
//   keys so they can't authenticate at B2C endpoints. (B2B auth uses
//   src/lib/b2bAuth.ts, which has its own lookup filtering on
//   scope === 'b2b_partner'.)
// - listApiKeys(clientId): returns sanitised summaries for both scopes.
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
import type {
    ApiKeyEnvironment,
    ApiKeyMinted,
    ApiKeyRecord,
    ApiKeyScope,
    ApiKeySummary,
} from '@/types/apiKey';

const COLLECTION = 'clientApiKeys';
const db = () => getFirestore(adminApp);

function sha256(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
}

function generateRawKey(): string {
    // 16 bytes = 32 hex chars. `bj_` prefix marks it as ours.
    return 'bj_' + crypto.randomBytes(16).toString('hex');
}

function generateWebhookSecret(): string {
    return 'whsec_' + crypto.randomBytes(24).toString('hex');
}

function maskFromPrefix(prefix: string): string {
    return prefix + '••••••••••••••••••••••••';
}

export interface MintMerchantKeyOpts {
    keyType: 'b2c';
    label: string;
}

export interface MintB2BKeyOpts {
    keyType: 'b2b';
    label: string;
    partnerName: string;
    environment: ApiKeyEnvironment;
    webhookUrl?: string;
}

export type MintApiKeyOpts = MintMerchantKeyOpts | MintB2BKeyOpts;

export async function mintApiKey(
    clientId: string,
    opts: MintApiKeyOpts,
): Promise<ApiKeyMinted> {
    const rawKey = generateRawKey();
    const hash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 11);
    const now = Timestamp.now();

    const label = opts.label.trim() || 'Untitled key';

    if (opts.keyType === 'b2c') {
        const ref = await db().collection(COLLECTION).add({
            clientId,
            hash,
            keyPrefix,
            label,
            createdAt: now,
            scope: 'merchant',
        });
        return {
            id: ref.id,
            label,
            rawKey,
            createdAt: now.toMillis(),
            scope: 'merchant',
        };
    }

    // B2B partner key — auto-creates a partner namespace based on clientId.
    // Deterministic so multiple keys for the same merchant share a partnerId.
    const partnerId = `client_${clientId}`;
    const webhookSecret = opts.webhookUrl ? generateWebhookSecret() : undefined;
    const partnerName = opts.partnerName.trim() || 'Untitled partner';

    const docData: Record<string, unknown> = {
        clientId,
        hash,
        keyPrefix,
        label,
        createdAt: now,
        scope: 'b2b_partner',
        partnerId,
        partnerName,
        environment: opts.environment,
    };
    if (opts.webhookUrl) docData.webhookUrl = opts.webhookUrl;
    if (webhookSecret) docData.webhookSecret = webhookSecret;

    const ref = await db().collection(COLLECTION).add(docData);
    return {
        id: ref.id,
        label,
        rawKey,
        createdAt: now.toMillis(),
        scope: 'b2b_partner',
        webhookSecret,
    };
}

/**
 * B2C lookup. Returns null for unknown / revoked keys AND for keys with
 * scope === 'b2b_partner' (those have their own auth path).
 */
export async function lookupApiKey(
    rawKey: string,
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
    // B2B keys must not authenticate at the B2C path.
    if (data.scope === 'b2b_partner') return null;

    doc.ref
        .update({ lastUsedAt: FieldValue.serverTimestamp() })
        .catch((err) =>
            console.warn(`[apiKey] lastUsedAt update failed: ${err?.message || err}`),
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
            const scope: ApiKeyScope = data.scope === 'b2b_partner' ? 'b2b_partner' : 'merchant';
            const summary: ApiKeySummary = {
                id: d.id,
                label: data.label,
                createdAt: (data.createdAt as Timestamp).toMillis(),
                lastUsedAt: data.lastUsedAt
                    ? (data.lastUsedAt as Timestamp).toMillis()
                    : undefined,
                revokedAt: data.revokedAt
                    ? (data.revokedAt as Timestamp).toMillis()
                    : undefined,
                maskedKey: maskFromPrefix(data.keyPrefix || 'bj_••••••••'),
                scope,
            };
            if (scope === 'b2b_partner') {
                summary.partnerName = data.partnerName;
                summary.environment = data.environment;
                summary.webhookUrl = data.webhookUrl;
            }
            return summary;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeApiKey(
    clientId: string,
    keyId: string,
): Promise<{ ok: boolean; reason?: string }> {
    const ref = db().collection(COLLECTION).doc(keyId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: 'Key not found' };
    const data = snap.data() as Omit<ApiKeyRecord, 'id'>;
    if (data.clientId !== clientId) {
        return { ok: false, reason: 'Forbidden' };
    }
    if (data.revokedAt) {
        return { ok: true };
    }
    await ref.update({ revokedAt: Timestamp.now() });
    return { ok: true };
}
