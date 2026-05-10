// Server-side request authentication used by /api/orders/* and other
// tenant-scoped routes. Supports two paths so external storefronts
// can be wired in later without touching every route:
//
//   1. Authorization: Bearer <Firebase ID token>
//        → Used today by the Blujay client portal.
//        → Resolves uid → clientId.
//
//   2. x-blujay-api-key: <key>                                (FUTURE)
//        → For external storefronts / server-to-server callers
//          that don't have a Firebase user.
//        → Returns 501 today. A later phase will look up hashed keys
//          under clients/{id}/apiKeys/* and resolve clientId.
//
// Routes use this via:
//   const auth = await authenticateRequest(req);
//   if (auth instanceof NextResponse) return auth;
//   const { clientId } = auth;
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export type AuthSource = 'firebase_user' | 'api_key';

export interface AuthedClient {
    clientId: string;
    source: AuthSource;
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

    const apiKey = req.headers.get('x-blujay-api-key');
    if (apiKey) {
        return NextResponse.json(
            {
                error:
                    'API-key authentication is not yet enabled. Use Authorization: Bearer <Firebase ID token> for now.',
            },
            { status: 501 }
        );
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
