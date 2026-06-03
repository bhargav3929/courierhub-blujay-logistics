
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { registerShopifyWebhook } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const SHOPIFY_PUBLIC_API_KEY = process.env.SHOPIFY_PUBLIC_API_KEY?.trim();
        const SHOPIFY_PUBLIC_API_SECRET = process.env.SHOPIFY_PUBLIC_API_SECRET?.trim();
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        const { searchParams } = new URL(request.url);
        const shop = searchParams.get('shop');
        const userId = searchParams.get('userId');

        console.log('[Shopify-Public Install] shop:', shop, 'userId:', userId, 'API_KEY exists:', !!SHOPIFY_PUBLIC_API_KEY);

        if (!shop) {
            return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
        }

        if (!SHOPIFY_PUBLIC_API_KEY || !SHOPIFY_PUBLIC_API_SECRET) {
            console.error('[Shopify-Public Install] Missing env vars - API_KEY:', !!SHOPIFY_PUBLIC_API_KEY, 'API_SECRET:', !!SHOPIFY_PUBLIC_API_SECRET);
            return NextResponse.json({ error: 'Server misconfiguration: Missing Shopify credentials' }, { status: 500 });
        }

        // Ensure shop format
        const shopUrl = shop.includes('.') ? shop : `${shop}.myshopify.com`;

        // ── Public App Store install (no userId yet) ──
        // Merchant clicked Install on the App Store before signing up at Blujay.
        // Skip pre-claim/pre-write; go straight to OAuth. The callback stores
        // the resulting access token in `pendingShopifyInstalls` for later claim.
        if (!userId) {
            console.log('[Shopify-Public Install] Public App Store install (no userId) for', shopUrl);

            const scopes = 'read_orders,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders';
            const redirectUri = `${APP_URL}/api/integrations/shopify-public/callback`;

            // Anonymous state — sentinel "anon" + nonce + signature.
            const nonce = crypto.randomBytes(16).toString('hex');
            const payload = `anon:${nonce}`;
            const signature = crypto
                .createHmac('sha256', SHOPIFY_PUBLIC_API_SECRET)
                .update(payload)
                .digest('hex');
            const state = Buffer.from(`${payload}:${signature}`).toString('base64url');

            const installUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${SHOPIFY_PUBLIC_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
            return NextResponse.redirect(installUrl, { status: 302 });
        }

        // ── Logged-in claim flow (Blujay user already signed in) ──
        // Check for pending install previously stored by an anonymous OAuth.
        const pendingRef = doc(db, 'pendingShopifyInstalls', shopUrl);
        const pendingDoc = await getDoc(pendingRef);

        if (pendingDoc.exists() && !pendingDoc.data().claimed && pendingDoc.data().appId === 'public') {
            console.log('[Shopify-Public Install] Found pending install for', shopUrl, '— claiming for user', userId);

            const pendingData = pendingDoc.data();
            const accessToken = decryptTokenWithSecret(pendingData.accessToken, SHOPIFY_PUBLIC_API_SECRET);

            // Save to user's shopifyConfig (carry expiring-token lifecycle fields)
            await updateDoc(doc(db, 'users', userId), {
                shopifyConfig: {
                    shopUrl: shopUrl,
                    accessToken: pendingData.accessToken,
                    ...(pendingData.refreshToken ? { refreshToken: pendingData.refreshToken } : {}),
                    ...(pendingData.accessTokenExpiresAt ? { accessTokenExpiresAt: pendingData.accessTokenExpiresAt } : {}),
                    ...(pendingData.refreshTokenExpiresAt ? { refreshTokenExpiresAt: pendingData.refreshTokenExpiresAt } : {}),
                    isConnected: true,
                    updatedAt: new Date().toISOString(),
                    scopes: pendingData.scopes,
                    appId: 'public',
                }
            });

            // Register webhook
            const webhookResult = await registerShopifyWebhook(shopUrl, accessToken, '/api/integrations/shopify-public/webhook');
            if (!webhookResult.success) {
                console.error('[Shopify-Public Install] Webhook registration failed:', webhookResult.error);
                await updateDoc(doc(db, 'users', userId), {
                    'shopifyConfig.webhookStatus': 'failed',
                    'shopifyConfig.webhookError': webhookResult.error
                });
            } else {
                await updateDoc(doc(db, 'users', userId), {
                    'shopifyConfig.webhookStatus': 'active'
                });
            }

            // Remove the pending install record
            await deleteDoc(pendingRef);

            console.log('[Shopify-Public Install] Pending install claimed successfully for user', userId);
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`, { status: 302 });
        }

        // ── Normal OAuth flow ──
        await updateDoc(doc(db, 'users', userId), {
            'shopifyConfig.pendingShopUrl': shopUrl,
            'shopifyConfig.pendingAt': new Date().toISOString(),
        });

        const scopes = 'read_orders,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders';
        const redirectUri = `${APP_URL}/api/integrations/shopify-public/callback`;

        // Create signed state
        const nonce = crypto.randomBytes(16).toString('hex');
        const payload = `${userId}:${nonce}`;
        const signature = crypto
            .createHmac('sha256', SHOPIFY_PUBLIC_API_SECRET)
            .update(payload)
            .digest('hex');
        const state = Buffer.from(`${payload}:${signature}`).toString('base64url');

        const installUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${SHOPIFY_PUBLIC_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

        console.log('[Shopify-Public Install] Redirecting to OAuth URL');

        return NextResponse.redirect(installUrl, { status: 302 });
    } catch (error: any) {
        console.error('[Shopify-Public Install] Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
