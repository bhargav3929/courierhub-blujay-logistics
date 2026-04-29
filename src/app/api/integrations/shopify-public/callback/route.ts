
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { encryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { registerShopifyWebhook } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

// Verify and extract userId from base64url-encoded signed state.
// Returns the userId, the literal "anon" for App Store installs without a
// pre-known user, or null if the state is missing/invalid.
function verifySignedState(stateParam: string, apiSecret: string): string | null {
    try {
        const decoded = Buffer.from(stateParam, 'base64url').toString('utf8');
        const parts = decoded.split(':');
        if (parts.length !== 3) return null;

        const [userId, nonce, signature] = parts;
        const payload = `${userId}:${nonce}`;
        const expectedSignature = crypto
            .createHmac('sha256', apiSecret)
            .update(payload)
            .digest('hex');

        if (signature.length !== expectedSignature.length ||
            !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return null;
        }
        return userId;
    } catch {
        return null;
    }
}

// Fallback: look up userId by pending shop domain
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
        console.error('[Shopify-Public Callback] Error looking up user by shop:', error);
        return null;
    }
}

export async function GET(request: Request) {
    const SHOPIFY_PUBLIC_API_KEY = process.env.SHOPIFY_PUBLIC_API_KEY?.trim();
    const SHOPIFY_PUBLIC_API_SECRET = process.env.SHOPIFY_PUBLIC_API_SECRET?.trim();
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    try {
        const { searchParams } = new URL(request.url);
        const shop = searchParams.get('shop');
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const hmac = searchParams.get('hmac');

        if (!shop || !code || !hmac) {
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=missing_params`);
        }

        if (!SHOPIFY_PUBLIC_API_SECRET || !SHOPIFY_PUBLIC_API_KEY) {
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
            .createHmac('sha256', SHOPIFY_PUBLIC_API_SECRET)
            .update(message)
            .digest('hex');

        if (generatedHmac.length !== hmac.length ||
            !crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac))) {
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=invalid_signature`);
        }

        // 2. Extract userId
        let userId: string | null = null;

        if (state) {
            const stateValue = verifySignedState(state, SHOPIFY_PUBLIC_API_SECRET);
            // "anon" is the sentinel set by the install handler when the
            // merchant came in directly from the Shopify App Store with no
            // Blujay account yet — keep userId null so the pending-install
            // branch below stores the token for later claim.
            userId = stateValue && stateValue !== 'anon' ? stateValue : null;
        }

        if (!userId) {
            console.log('[Shopify-Public Callback] No valid user state, looking up user by shop domain:', shop);
            userId = await findUserByPendingShop(shop);
        }

        // 3. Exchange authorization code for access token FIRST
        let accessToken: string;
        let tokenScopes: string;

        try {
            const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: SHOPIFY_PUBLIC_API_KEY,
                    client_secret: SHOPIFY_PUBLIC_API_SECRET,
                    code,
                }),
            });

            if (!accessTokenResponse.ok) {
                const errorText = await accessTokenResponse.text();
                console.error('[Shopify-Public Callback] Token exchange failed:', accessTokenResponse.status, errorText);
                return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=token_exchange_failed`);
            }

            const tokenData = await accessTokenResponse.json();

            if (!tokenData.access_token) {
                return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=no_token`);
            }

            accessToken = tokenData.access_token;
            tokenScopes = tokenData.scope || 'read_orders,write_fulfillments';
        } catch (error: any) {
            console.error('[Shopify-Public Callback] Token exchange error:', error);
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=token_exchange_failed`);
        }

        // 4. If no userId — store as pending install
        if (!userId) {
            console.log('[Shopify-Public Callback] No userId found — storing as pending install for shop:', shop);
            try {
                await setDoc(doc(db, 'pendingShopifyInstalls', shop), {
                    accessToken: encryptTokenWithSecret(accessToken, SHOPIFY_PUBLIC_API_SECRET),
                    scopes: tokenScopes,
                    installedAt: new Date().toISOString(),
                    claimed: false,
                    appId: 'public',
                });
            } catch (e) {
                console.error('[Shopify-Public Callback] Failed to store pending install:', e);
            }
            return NextResponse.redirect(
                `${APP_URL}/client-integrations?shopifyPending=true&pendingShop=${encodeURIComponent(shop)}`
            );
        }

        // 5. Normal flow — save to user's shopifyConfig
        try {
            await updateDoc(doc(db, 'users', userId), {
                shopifyConfig: {
                    shopUrl: shop,
                    accessToken: encryptTokenWithSecret(accessToken, SHOPIFY_PUBLIC_API_SECRET),
                    isConnected: true,
                    updatedAt: new Date().toISOString(),
                    scopes: tokenScopes,
                    appId: 'public',
                }
            });

            // 6. Register webhooks
            const webhookResult = await registerShopifyWebhook(
                shop, accessToken, '/api/integrations/shopify-public/webhook'
            );
            if (!webhookResult.success) {
                console.error('[Shopify-Public Callback] Webhook registration failed:', webhookResult.error);
                await updateDoc(doc(db, 'users', userId), {
                    'shopifyConfig.webhookStatus': 'failed',
                    'shopifyConfig.webhookError': webhookResult.error
                });
            } else {
                await updateDoc(doc(db, 'users', userId), {
                    'shopifyConfig.webhookStatus': 'active'
                });
            }

            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`);

        } catch (error: any) {
            console.error('[Shopify-Public Callback] Error:', error);
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=callback_failed`);
        }

    } catch (error: any) {
        console.error('[Shopify-Public Callback] Unhandled error:', error);
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=callback_failed`);
    }
}
