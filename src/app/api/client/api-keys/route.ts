/**
 * GET  /api/client/api-keys      — list this client's keys (sanitised)
 * POST /api/client/api-keys      — mint a new key (raw key returned once)
 *
 * Both require Bearer (Firebase ID token) — these are admin-portal endpoints,
 * NOT public. Merchants never hit these; they only use the keys via the
 * /api/integrations/orders/webhook endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/serverAuth';
import {
    listApiKeys,
    mintApiKey,
} from '@/services/server/apiKeyService';

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    if (auth.source !== 'firebase_user') {
        // Don't let an API-key auth manage other API keys — that's a footgun.
        return NextResponse.json(
            { error: 'API-key auth not allowed on key-management endpoints' },
            { status: 403 }
        );
    }
    try {
        const keys = await listApiKeys(auth.clientId);
        return NextResponse.json({ ok: true, keys });
    } catch (err: any) {
        console.error('[client/api-keys GET] error:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Failed to list keys' },
            { status: 500 }
        );
    }
}

// Discriminated body: either a B2C merchant key or a B2B partner key.
const CreateBody = z.discriminatedUnion('keyType', [
    z.object({
        keyType: z.literal('b2c'),
        label: z.string().min(1).max(100),
    }),
    z.object({
        keyType: z.literal('b2b'),
        label: z.string().min(1).max(100),
        partnerName: z.string().min(1).max(100),
        environment: z.enum(['sandbox', 'production']),
        webhookUrl: z.string().url().max(500).optional(),
    }),
]);

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;
    if (auth.source !== 'firebase_user') {
        return NextResponse.json(
            { error: 'API-key auth not allowed on key-management endpoints' },
            { status: 403 }
        );
    }
    try {
        const json = await request.json().catch(() => ({}));
        // Backwards-compat: if `keyType` is missing, default to 'b2c' so
        // legacy clients that only sent { label } keep working.
        const normalized =
            json && typeof json === 'object' && !('keyType' in json)
                ? { ...json, keyType: 'b2c' }
                : json;
        const parsed = CreateBody.safeParse(normalized);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid body', issues: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const minted = await mintApiKey(auth.clientId, parsed.data);
        console.log(
            `[client/api-keys POST] minted key=${minted.id} scope=${minted.scope} for client=${auth.clientId}`
        );
        // Raw key returned ONCE — UI must show it to the user and remind
        // them it cannot be retrieved later.
        return NextResponse.json({ ok: true, key: minted });
    } catch (err: any) {
        console.error('[client/api-keys POST] error:', err?.message || err);
        return NextResponse.json(
            { error: err?.message || 'Failed to mint key' },
            { status: 500 }
        );
    }
}
