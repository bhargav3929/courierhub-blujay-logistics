
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { encryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { registerShopifyWebhook } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

const SHOPIFY2_API_KEY = process.env.SHOPIFY2_API_KEY;
const SHOPIFY2_API_SECRET = process.env.SHOPIFY2_API_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

// Verify and extract userId from base64url-encoded signed state
function verifySignedState(stateParam: string): string | null {
    try {
        const decoded = Buffer.from(stateParam, 'base64url').toString('utf8');
        const parts = decoded.split(':');
        if (parts.length !== 3) return null;

        const [userId, nonce, signature] = parts;
        const payload = `${userId}:${nonce}`;
        const expectedSignature = crypto
            .createHmac('sha256', SHOPIFY2_API_SECRET!)
            .update(payload)
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return null;
        }
        return userId;
    } catch {
        return null;
    }
}

// Fallback: look up userId by pending shop domain in Firestore
async function findUserByPendingShop(shopDomain: string): Promise<string | null> {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('shopifyConfig.pendingShopUrl', '==', shopDomain));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return snapshot.docs[0].id;
        }
        return null;
    } catch (error) {
        console.error('[Shopify2 Callback] Error looking up user by shop:', error);
        return null;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const hmac = searchParams.get('hmac');

    if (!shop || !code || !hmac) {
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=missing_params`);
    }

    if (!SHOPIFY2_API_SECRET || !SHOPIFY2_API_KEY) {
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=server_error`);
    }

    // 1. Verify HMAC from Shopify
    const map = Object.fromEntries(searchParams.entries());
    delete map['hmac'];
    const message = Object.keys(map)
        .sort()
        .map((key) => `${key}=${map[key]}`)
        .join('&');

    const generatedHmac = crypto
        .createHmac('sha256', SHOPIFY2_API_SECRET)
        .update(message)
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac))) {
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=invalid_signature`);
    }

    // 2. Extract userId: try signed state first, fall back to shop domain lookup
    let userId: string | null = null;

    if (state) {
        userId = verifySignedState(state);
    }

    if (!userId) {
        console.log('[Shopify2 Callback] No valid state, looking up user by shop domain:', shop);
        userId = await findUserByPendingShop(shop);
    }

    // 3. Exchange authorization code for access token
    let accessToken: string;
    let tokenScopes: string;

    try {
        const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: SHOPIFY2_API_KEY,
                client_secret: SHOPIFY2_API_SECRET,
                code,
            }),
        });

        if (!accessTokenResponse.ok) {
            console.error('[Shopify2 Callback] Token exchange failed:', accessTokenResponse.status);
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=token_exchange_failed`);
        }

        const tokenData = await accessTokenResponse.json();

        if (!tokenData.access_token) {
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=no_token`);
        }

        accessToken = tokenData.access_token;
        tokenScopes = tokenData.scope || 'read_orders,write_fulfillments';
    } catch (error: any) {
        console.error('[Shopify2 Callback] Token exchange error:', error);
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=token_exchange_failed`);
    }

    // 4. If no userId, redirect with error (no Custom Distribution for app2)
    if (!userId) {
        console.error('[Shopify2 Callback] No userId found for shop:', shop);
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=no_user`);
    }

    // 5. Save encrypted token to user's shopifyConfig with appId
    try {
        await updateDoc(doc(db, 'users', userId), {
            shopifyConfig: {
                shopUrl: shop,
                accessToken: encryptTokenWithSecret(accessToken, SHOPIFY2_API_SECRET),
                isConnected: true,
                updatedAt: new Date().toISOString(),
                scopes: tokenScopes,
                appId: 'app2',
            }
        });

        // 6. Register webhooks at app2's webhook endpoint
        const webhookResult = await registerShopifyWebhook(
            shop, accessToken, '/api/integrations/shopify2/webhook'
        );
        if (!webhookResult.success) {
            console.error('[Shopify2 Callback] Webhook registration failed:', webhookResult.error);
            await updateDoc(doc(db, 'users', userId), {
                'shopifyConfig.webhookStatus': 'failed',
                'shopifyConfig.webhookError': webhookResult.error
            });
        } else {
            await updateDoc(doc(db, 'users', userId), {
                'shopifyConfig.webhookStatus': 'active'
            });
        }

        // 7. Redirect back to dashboard with success
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`);

    } catch (error: any) {
        console.error('[Shopify2 Callback] Error:', error);
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=callback_failed`);
    }
}
