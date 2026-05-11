// Server-side request authentication. Supports two paths:
//
//   1. Authorization: Bearer <Firebase ID token>
//        → Blujay client portal (admin user logged in).
//        → Resolves uid → clientId.
//
//   2. X-Blujay-Api-Key: bj_<32hex>
//        → External merchant backends posting orders via webhook.
//        → Server hashes the key (SHA-256), looks up in clientApiKeys
//          collection, resolves clientId. Revoked keys return 401.
//
// Routes use this via:
//   const auth = await authenticateRequest(req);
//   if (auth instanceof NextResponse) return auth;
//   const { clientId } = auth;
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { lookupApiKey } from '@/services/server/apiKeyService';

export type AuthSource = 'firebase_user' | 'api_key';

export interface AuthedClient {
    clientId: string;
    source: AuthSource;
    keyId?: string;     // populated when source === 'api_key'
}

export async function authenticateRequest(
    req: NextRequest
): Promise<AuthedClient | NextResponse> {
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length);
        try {
            const decoded = await adminAuth.verifyIdToken(token);
            return { clientId: decoded.uid, source: 'firebase_user' };
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
    }

    // API-key path. Header name is case-insensitive per HTTP spec — Next.js
    // lowercases it for us, but we read both spellings for tolerance.
    const apiKey =
        req.headers.get('x-blujay-api-key') ||
        req.headers.get('X-Blujay-Api-Key');
    if (apiKey) {
        try {
            const result = await lookupApiKey(apiKey);
            if (!result) {
                return NextResponse.json(
                    { error: 'Invalid or revoked API key' },
                    { status: 401 }
                );
            }
            return {
                clientId: result.clientId,
                source: 'api_key',
                keyId: result.keyId,
            };
        } catch (err: any) {
            console.error('[serverAuth] api-key lookup failed:', err?.message || err);
            return NextResponse.json(
                { error: 'Authentication error' },
                { status: 500 }
            );
        }
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
