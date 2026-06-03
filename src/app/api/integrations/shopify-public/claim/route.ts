
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp, adminAuth } from '@/lib/firebaseAdmin';
import { decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { registerShopifyWebhook } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const SHOPIFY_PUBLIC_API_SECRET = process.env.SHOPIFY_PUBLIC_API_SECRET?.trim();

    if (!SHOPIFY_PUBLIC_API_SECRET) {
        return NextResponse.json(
            { error: 'Server misconfiguration' },
            { status: 500 }
        );
    }

    // ── Authenticate via Firebase ID token ──
    const authHeader = request.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userId: string;
    try {
        const decoded = await adminAuth.verifyIdToken(authHeader.slice('Bearer '.length));
        userId = decoded.uid;
    } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // ── Parse body ──
    let shop: string;
    try {
        const body = await request.json();
        shop = body.shop;
        if (!shop || typeof shop !== 'string') {
            return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const db = getFirestore(adminApp);

    try {
        // ── Look up the pending install ──
        const pendingRef = db.collection('pendingShopifyInstalls').doc(shop);
        const pendingSnap = await pendingRef.get();

        if (!pendingSnap.exists) {
            return NextResponse.json(
                { error: 'No pending install found for this shop' },
                { status: 404 }
            );
        }

        const pendingData = pendingSnap.data()!;

        if (pendingData.appId !== 'public') {
            return NextResponse.json(
                { error: 'Pending install is not for the public app' },
                { status: 400 }
            );
        }

        if (pendingData.claimed === true) {
            return NextResponse.json(
                { error: 'This install has already been claimed' },
                { status: 409 }
            );
        }

        // ── Decrypt token for webhook registration ──
        const accessToken = decryptTokenWithSecret(
            pendingData.accessToken,
            SHOPIFY_PUBLIC_API_SECRET
        );

        // ── Write shopifyConfig to user doc (keep token encrypted) ──
        // Carry the expiring-token lifecycle fields from the pending install.
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            shopifyConfig: {
                shopUrl: shop,
                accessToken: pendingData.accessToken, // stored encrypted
                ...(pendingData.refreshToken ? { refreshToken: pendingData.refreshToken } : {}),
                ...(pendingData.accessTokenExpiresAt ? { accessTokenExpiresAt: pendingData.accessTokenExpiresAt } : {}),
                ...(pendingData.refreshTokenExpiresAt ? { refreshTokenExpiresAt: pendingData.refreshTokenExpiresAt } : {}),
                isConnected: true,
                updatedAt: new Date().toISOString(),
                scopes: pendingData.scopes,
                appId: 'public',
            },
        });

        // ── Register webhooks ──
        const webhookResult = await registerShopifyWebhook(
            shop,
            accessToken,
            '/api/integrations/shopify-public/webhook'
        );

        if (!webhookResult.success) {
            console.error('[Shopify-Public Claim] Webhook registration failed:', webhookResult.error);
            await userRef.update({
                'shopifyConfig.webhookStatus': 'failed',
                'shopifyConfig.webhookError': webhookResult.error,
            });
        } else {
            await userRef.update({
                'shopifyConfig.webhookStatus': 'active',
            });
        }

        // ── Mark as claimed then delete the pending record ──
        await pendingRef.delete();

        console.log('[Shopify-Public Claim] Install claimed by user', userId, 'for shop', shop);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Shopify-Public Claim] Error:', error);
        return NextResponse.json(
            { error: 'Failed to claim install', details: error.message },
            { status: 500 }
        );
    }
}
