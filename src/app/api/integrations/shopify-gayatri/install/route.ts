
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { registerShopifyWebhook } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const SHOPIFY_GAYATRI_API_KEY = process.env.SHOPIFY_GAYATRI_API_KEY?.trim();
        const SHOPIFY_GAYATRI_API_SECRET = process.env.SHOPIFY_GAYATRI_API_SECRET?.trim();
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        const { searchParams } = new URL(request.url);
        const shop = searchParams.get('shop');
        const userId = searchParams.get('userId');

        console.log('[Shopify-Gayatri Install] shop:', shop, 'userId:', userId, 'API_KEY exists:', !!SHOPIFY_GAYATRI_API_KEY);

        if (!shop) {
            return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
        }

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
        }

        if (!SHOPIFY_GAYATRI_API_KEY || !SHOPIFY_GAYATRI_API_SECRET) {
            console.error('[Shopify-Gayatri Install] Missing env vars - API_KEY:', !!SHOPIFY_GAYATRI_API_KEY, 'API_SECRET:', !!SHOPIFY_GAYATRI_API_SECRET);
            return NextResponse.json({ error: 'Server misconfiguration: Missing Shopify credentials' }, { status: 500 });
        }

        // Ensure shop format
        const shopUrl = shop.includes('.') ? shop : `${shop}.myshopify.com`;

        // ── Check for pending Custom Distribution install ──
        const pendingRef = doc(db, 'pendingShopifyInstalls', shopUrl);
        const pendingDoc = await getDoc(pendingRef);

        if (pendingDoc.exists() && !pendingDoc.data().claimed && pendingDoc.data().appId === 'gayatri') {
            console.log('[Shopify-Gayatri Install] Found pending install for', shopUrl, '— claiming for user', userId);

            const pendingData = pendingDoc.data();
            const accessToken = decryptTokenWithSecret(pendingData.accessToken, SHOPIFY_GAYATRI_API_SECRET);

            // Save to user's shopifyConfig
            await updateDoc(doc(db, 'users', userId), {
                shopifyConfig: {
                    shopUrl: shopUrl,
                    accessToken: pendingData.accessToken,
                    isConnected: true,
                    updatedAt: new Date().toISOString(),
                    scopes: pendingData.scopes,
                    appId: 'gayatri',
                }
            });

            // Register webhook
            const webhookResult = await registerShopifyWebhook(shopUrl, accessToken, '/api/integrations/shopify-gayatri/webhook');
            if (!webhookResult.success) {
                console.error('[Shopify-Gayatri Install] Webhook registration failed:', webhookResult.error);
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

            console.log('[Shopify-Gayatri Install] Pending install claimed successfully for user', userId);
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`, { status: 302 });
        }

        // ── Normal OAuth flow ──
        await updateDoc(doc(db, 'users', userId), {
            'shopifyConfig.pendingShopUrl': shopUrl,
            'shopifyConfig.pendingAt': new Date().toISOString(),
        });

        const scopes = 'read_orders,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders';
        const redirectUri = `${APP_URL}/api/integrations/shopify-gayatri/callback`;

        // Create signed state
        const nonce = crypto.randomBytes(16).toString('hex');
        const payload = `${userId}:${nonce}`;
        const signature = crypto
            .createHmac('sha256', SHOPIFY_GAYATRI_API_SECRET)
            .update(payload)
            .digest('hex');
        const state = Buffer.from(`${payload}:${signature}`).toString('base64url');

        const installUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${SHOPIFY_GAYATRI_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

        console.log('[Shopify-Gayatri Install] Redirecting to OAuth URL');

        return NextResponse.redirect(installUrl, { status: 302 });
    } catch (error: any) {
        console.error('[Shopify-Gayatri Install] Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
