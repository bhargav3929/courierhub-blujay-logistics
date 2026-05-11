/**
 * DELETE /api/client/api-keys/[id]   — revoke a key (soft delete; sets revokedAt)
 *
 * Bearer auth only — admin portal endpoint. Idempotent: revoking an
 * already-revoked key still returns 200.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/serverAuth';
import { revokeApiKey } from '@/services/server/apiKeyService';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    if (auth.source !== 'firebase_user') {
        return NextResponse.json(
            { error: 'API-key auth not allowed on key-management endpoints' },
            { status: 403 }
        );
    }
    try {
        const { id } = await params;
        const result = await revokeApiKey(auth.clientId, id);
        if (!result.ok) {
            return NextResponse.json(
                { error: result.reason },
                { status: result.reason === 'Forbidden' ? 403 : 404 }
            );
        }
        console.log(`[client/api-keys DELETE] revoked key=${id} client=${auth.clientId}`);
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[client/api-keys DELETE] error:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Failed to revoke key' },
            { status: 500 }
        );
    }
}
