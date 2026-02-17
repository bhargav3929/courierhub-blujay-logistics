
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { registerShopifyWebhook } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const SHOPIFY2_API_KEY = process.env.SHOPIFY2_API_KEY?.trim();
        const SHOPIFY2_API_SECRET = process.env.SHOPIFY2_API_SECRET?.trim();
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        const { searchParams } = new URL(request.url);
        const shop = searchParams.get('shop');
        const userId = searchParams.get('userId');

        console.log('[Shopify2 Install] shop:', shop, 'userId:', userId, 'API_KEY exists:', !!SHOPIFY2_API_KEY);

        if (!shop) {
            return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
        }

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
        }

        if (!SHOPIFY2_API_KEY || !SHOPIFY2_API_SECRET) {
            console.error('[Shopify2 Install] Missing env vars - SHOPIFY2_API_KEY:', !!SHOPIFY2_API_KEY, 'SHOPIFY2_API_SECRET:', !!SHOPIFY2_API_SECRET);
            return NextResponse.json({ error: 'Server misconfiguration: Missing Shopify credentials' }, { status: 500 });
        }

        // Ensure shop format
        const shopUrl = shop.includes('.') ? shop : `${shop}.myshopify.com`;

        // ── Check for pending Custom Distribution install ──
        // If the merchant already authorized via Shopify's Custom Distribution link,
        // the token is stored in pendingShopifyInstalls. Claim it directly — no OAuth needed.
        const pendingRef = doc(db, 'pendingShopifyInstalls', shopUrl);
        const pendingDoc = await getDoc(pendingRef);

        if (pendingDoc.exists() && !pendingDoc.data().claimed) {
            console.log('[Shopify2 Install] Found pending install for', shopUrl, '— claiming for user', userId);

            const pendingData = pendingDoc.data();
            const accessToken = decryptTokenWithSecret(pendingData.accessToken, SHOPIFY2_API_SECRET);

            // Save to user's shopifyConfig (token is already encrypted in pendingData)
            await updateDoc(doc(db, 'users', userId), {
                shopifyConfig: {
                    shopUrl: shopUrl,
                    accessToken: pendingData.accessToken,
                    isConnected: true,
                    updatedAt: new Date().toISOString(),
                    scopes: pendingData.scopes,
                    appId: 'app2',
                }
            });

            // Register webhook using the decrypted token
            const webhookResult = await registerShopifyWebhook(shopUrl, accessToken, '/api/integrations/shopify2/webhook');
            if (!webhookResult.success) {
                console.error('[Shopify2 Install] Webhook registration failed:', webhookResult.error);
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

            console.log('[Shopify2 Install] Pending install claimed successfully for user', userId);
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`, { status: 302 });
        }

        // ── Normal OAuth flow ──
        // Save pending connection in Firestore so the callback can look up
        // the userId by shop domain (needed if state verification fails)
        await updateDoc(doc(db, 'users', userId), {
            'shopifyConfig.pendingShopUrl': shopUrl,
            'shopifyConfig.pendingAt': new Date().toISOString(),
        });

        const scopes = 'read_orders,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders';
        const redirectUri = `${APP_URL}/api/integrations/shopify2/callback`;

        // Create signed state: base64-encode to avoid URL encoding issues
        const nonce = crypto.randomBytes(16).toString('hex');
        const payload = `${userId}:${nonce}`;
        const signature = crypto
            .createHmac('sha256', SHOPIFY2_API_SECRET)
            .update(payload)
            .digest('hex');
        const state = Buffer.from(`${payload}:${signature}`).toString('base64url');

        const installUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${SHOPIFY2_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

        console.log('[Shopify2 Install] Redirecting to OAuth URL');

        return NextResponse.redirect(installUrl, { status: 302 });
    } catch (error: any) {
        console.error('[Shopify2 Install] Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
