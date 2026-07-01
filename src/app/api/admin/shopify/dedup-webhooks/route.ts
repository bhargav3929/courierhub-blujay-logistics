import { NextResponse, NextRequest } from 'next/server';
import { adminApp } from '@/lib/firebaseAdmin';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/serverAuth';
import { decryptToken, decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { deduplicateShopifyWebhooks } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

// Admin-only: remove duplicate Shopify webhook subscriptions for a client.
// Useful when a shop re-authenticated multiple times, causing duplicate webhooks
// and double-ingestion of orders.
//
// POST /api/admin/shopify/dedup-webhooks
// Body: { clientId: string, appId: 'looms' | 'gayatri' | 'public' | 'shopify' }
export async function POST(request: NextRequest) {
    const authResult = await authenticateRequest(request);
    if (authResult instanceof NextResponse) return authResult;
    // Allow both firebase_user (admin portal login) and api_key
    if (!authResult.clientId) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { clientId, appId } = await request.json();
    if (!clientId || !appId) {
        return NextResponse.json({ error: 'clientId and appId are required' }, { status: 400 });
    }

    // Resolve the app secret for decryption
    const appSecretMap: Record<string, string | undefined> = {
        looms: process.env.SHOPIFY_LOOMS_API_SECRET,
        gayatri: process.env.SHOPIFY_GAYATRI_API_SECRET,
        public: process.env.SHOPIFY_PUBLIC_API_SECRET,
        shopify: process.env.SHOPIFY_API_SECRET,
        shopify2: process.env.SHOPIFY_API_SECRET_2,
        shopify3: process.env.SHOPIFY_API_SECRET_3,
    };
    const appSecret = appSecretMap[appId]?.trim();
    if (!appSecret) {
        return NextResponse.json({ error: `No secret configured for appId: ${appId}` }, { status: 400 });
    }

    const adminDb = getFirestore(adminApp);

    // Read user's shopifyConfig
    const userDoc = await adminDb.collection('users').doc(clientId).get();
    if (!userDoc.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const shopifyConfig = userDoc.data()?.shopifyConfig;
    if (!shopifyConfig?.shopUrl || !shopifyConfig?.accessToken) {
        return NextResponse.json({ error: 'No Shopify connection found for this user' }, { status: 400 });
    }

    // Decrypt the access token — try app-specific secret first, fall back to SHOPIFY_API_SECRET
    // (legacy callback used encryptToken which keys off SHOPIFY_API_SECRET, not the app secret)
    let accessToken: string;
    try {
        accessToken = decryptTokenWithSecret(shopifyConfig.accessToken, appSecret);
    } catch {
        try {
            accessToken = decryptToken(shopifyConfig.accessToken);
        } catch (e: any) {
            return NextResponse.json({ error: `Failed to decrypt token with any known key: ${e.message}` }, { status: 500 });
        }
    }

    // Determine the webhook path for this app
    const webhookPathMap: Record<string, string> = {
        looms: '/api/integrations/shopify-looms/webhook',
        gayatri: '/api/integrations/shopify-gayatri/webhook',
        public: '/api/integrations/shopify-public/webhook',
        shopify: '/api/integrations/shopify/webhook',
        shopify2: '/api/integrations/shopify2/webhook',
        shopify3: '/api/integrations/shopify3/webhook',
    };

    const result = await deduplicateShopifyWebhooks(
        shopifyConfig.shopUrl,
        accessToken,
        webhookPathMap[appId]
    );

    if (result.error) {
        return NextResponse.json({ error: result.error, removed: result.removed }, { status: 500 });
    }

    return NextResponse.json({
        ok: true,
        shop: shopifyConfig.shopUrl,
        appId,
        duplicatesRemoved: result.removed,
        message: result.removed > 0
            ? `Removed ${result.removed} duplicate webhook subscription(s). New orders will no longer be doubled.`
            : 'No duplicates found — webhooks are already clean.',
    });
}
