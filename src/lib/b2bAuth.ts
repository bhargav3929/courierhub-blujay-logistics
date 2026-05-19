// B2B partner authentication.
//
// Extends the existing `clientApiKeys` collection (see apiKeyService.ts)
// with two optional fields:
//   - scope: 'merchant' | 'b2b_partner'   (default: 'merchant')
//   - partnerId: string                   (required when scope = 'b2b_partner')
//
// Existing merchant keys have neither set and continue to work via
// authenticateRequest() in serverAuth.ts. New B2B keys carry both fields
// and are accepted ONLY by this function.
//
// To mint a B2B key (until a dedicated /api/admin/b2b/api-keys endpoint
// exists), write directly to Firestore via the admin SDK:
//   db.collection('clientApiKeys').add({
//       hash: sha256(rawKey), keyPrefix: rawKey.slice(0, 11),
//       label: '...', scope: 'b2b_partner', partnerId: '<partner_id>',
//       createdAt: Timestamp.now(),
//   })

import crypto from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { NextRequest } from 'next/server';
import { adminApp } from '@/lib/firebaseAdmin';
import { ApiKeyId, PartnerId } from '@/types/b2b/ids';

const COLLECTION = 'clientApiKeys';
const db = () => getFirestore(adminApp);

export interface AuthedB2BPartner {
    readonly partnerId: PartnerId;
    readonly apiKeyId: ApiKeyId;
}

export type AuthFailure =
    | { kind: 'unauthorized'; reason: string }
    | { kind: 'forbidden'; reason: string }
    | { kind: 'internal_error'; reason: string };

export type AuthResult =
    | { ok: true; partner: AuthedB2BPartner }
    | { ok: false; failure: AuthFailure };

function sha256(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
}

function extractRawKey(req: NextRequest): string | null {
    const auth = req.headers.get('Authorization') || req.headers.get('authorization');
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice('Bearer '.length).trim();
        if (token.startsWith('bj_')) return token;
    }
    const hdr = req.headers.get('x-blujay-api-key') || req.headers.get('X-Blujay-Api-Key');
    if (hdr) return hdr.trim();
    return null;
}

async function lookupB2BPartnerKey(rawKey: string): Promise<AuthedB2BPartner | null> {
    if (!rawKey || !rawKey.startsWith('bj_')) return null;
    const hash = sha256(rawKey);
    const snap = await db()
        .collection(COLLECTION)
        .where('hash', '==', hash)
        .limit(1)
        .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data() as {
        scope?: string;
        partnerId?: string;
        revokedAt?: unknown;
        disabled?: boolean;
        expiresAt?: { toMillis: () => number } | null;
    };
    if (data.revokedAt) return null;
    if (data.scope !== 'b2b_partner') return null;
    if (!data.partnerId) return null;
    if (data.disabled === true) return null;
    if (data.expiresAt && typeof data.expiresAt.toMillis === 'function') {
        if (data.expiresAt.toMillis() < Date.now()) return null;
    }

    // Best-effort lastUsedAt touch — never block auth on its failure.
    doc.ref
        .update({ lastUsedAt: FieldValue.serverTimestamp() })
        .catch(() => undefined);

    return {
        partnerId: PartnerId(data.partnerId),
        apiKeyId: ApiKeyId(doc.id),
    };
}

export async function authenticateB2BRequest(req: NextRequest): Promise<AuthResult> {
    const rawKey = extractRawKey(req);
    if (!rawKey) {
        return { ok: false, failure: { kind: 'unauthorized', reason: 'No API key supplied' } };
    }
    try {
        const partner = await lookupB2BPartnerKey(rawKey);
        if (!partner) {
            // 401 for both "unknown key" and "wrong scope" — never tell the
            // caller which, to avoid leaks via timing or error text.
            return { ok: false, failure: { kind: 'unauthorized', reason: 'Invalid or revoked API key' } };
        }
        return { ok: true, partner };
    } catch (err) {
        return {
            ok: false,
            failure: {
                kind: 'internal_error',
                reason: (err instanceof Error ? err.message : 'auth failure'),
            },
        };
    }
}
