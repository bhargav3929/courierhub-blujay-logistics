
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { encryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { registerShopifyWebhook } from '@/lib/shopifyWebhook';

export const dynamic = 'force-dynamic';

// Verify and extract userId from base64url-encoded signed state
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

// Fallback: look up userId by pending shop domain in Firestore
async function findUserByPendingShop(shopDomain: string): Promise<string | null> {
    try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('shopifyConfig.pendingShopUrl', '==', shopDomain));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            console.log('[Shopify3 Callback] Found user by pending shop:', snapshot.docs[0].id);
            return snapshot.docs[0].id;
        }
        console.log('[Shopify3 Callback] No user found with pendingShopUrl:', shopDomain);
        return null;
    } catch (error: any) {
        console.error('[Shopify3 Callback] Error looking up user by shop:', error?.message || error);
        return null;
    }
}

// Write debug info to Firestore so we can trace callback execution
async function writeDebug(step: string, data: Record<string, unknown>) {
    try {
        await setDoc(doc(db, 'shopifyDebug', 'app3-callback'), {
            step,
            ...data,
            timestamp: new Date().toISOString(),
        }, { merge: false });
    } catch (e: any) {
        console.error('[Shopify3 Debug] Failed to write debug:', e?.message);
    }
}

export async function GET(request: Request) {
    // Read env vars at call time (not module level) to avoid stale cached values
    const SHOPIFY3_API_KEY = process.env.SHOPIFY3_API_KEY;
    const SHOPIFY3_API_SECRET = process.env.SHOPIFY3_API_SECRET;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    try {
        const { searchParams } = new URL(request.url);
        const shop = searchParams.get('shop');
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const hmac = searchParams.get('hmac');

        console.log('[Shopify3 Callback] Received:', {
            shop, hasCode: !!code, hasState: !!state, state: state || '(empty)',
            hasHmac: !!hmac, allParams: Array.from(searchParams.keys()),
        });

        await writeDebug('1-received', {
            shop, hasCode: !!code, hasState: !!state,
            hasHmac: !!hmac, params: Array.from(searchParams.keys()),
            hasApiKey: !!SHOPIFY3_API_KEY, hasApiSecret: !!SHOPIFY3_API_SECRET,
        });

        if (!shop || !code || !hmac) {
            await writeDebug('error-missing-params', { shop, hasCode: !!code, hasHmac: !!hmac });
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=missing_params`);
        }

        if (!SHOPIFY3_API_SECRET || !SHOPIFY3_API_KEY) {
            await writeDebug('error-missing-env', {
                hasApiKey: !!SHOPIFY3_API_KEY,
                hasApiSecret: !!SHOPIFY3_API_SECRET,
            });
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
            .createHmac('sha256', SHOPIFY3_API_SECRET)
            .update(message)
            .digest('hex');

        // Safe comparison: check length first to prevent timingSafeEqual throw
        if (generatedHmac.length !== hmac.length ||
            !crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac))) {
            await writeDebug('error-hmac', {
                generatedLen: generatedHmac.length, receivedLen: hmac.length,
                messageUsed: message.substring(0, 200),
            });
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=invalid_signature`);
        }

        console.log('[Shopify3 Callback] HMAC verified OK');
        await writeDebug('2-hmac-ok', { shop });

        // 2. Extract userId: try signed state first, fall back to shop domain lookup
        let userId: string | null = null;

        if (state) {
            userId = verifySignedState(state, SHOPIFY3_API_SECRET);
            console.log('[Shopify3 Callback] State verification result:', userId ? 'found userId' : 'failed');
        }

        if (!userId) {
            console.log('[Shopify3 Callback] Looking up user by pending shop domain:', shop);
            userId = await findUserByPendingShop(shop);
        }

        await writeDebug('3-userId', { userId: userId || 'null', method: state ? (userId ? 'state' : 'fallback') : 'fallback-only' });

        // 3. Exchange authorization code for access token
        let accessToken: string;
        let tokenScopes: string;

        try {
            const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: SHOPIFY3_API_KEY,
                    client_secret: SHOPIFY3_API_SECRET,
                    code,
                }),
            });

            const responseStatus = accessTokenResponse.status;

            if (!accessTokenResponse.ok) {
                const errorBody = await accessTokenResponse.text().catch(() => 'unknown');
                console.error('[Shopify3 Callback] Token exchange failed:', responseStatus, errorBody);
                await writeDebug('error-token-exchange', { status: responseStatus, body: errorBody.substring(0, 500) });
                return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=token_exchange_failed`);
            }

            const tokenData = await accessTokenResponse.json();

            if (!tokenData.access_token) {
                await writeDebug('error-no-token', { tokenData: JSON.stringify(tokenData).substring(0, 500) });
                return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=no_token`);
            }

            accessToken = tokenData.access_token;
            tokenScopes = tokenData.scope || 'read_orders,write_fulfillments,read_products';
            console.log('[Shopify3 Callback] Token exchange OK, scopes:', tokenScopes);
            await writeDebug('4-token-ok', { scopes: tokenScopes, tokenLength: accessToken.length });
        } catch (error: any) {
            console.error('[Shopify3 Callback] Token exchange error:', error?.message);
            await writeDebug('error-token-exception', { error: error?.message || String(error) });
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=token_exchange_failed`);
        }

        // 4. If no userId — Custom Distribution install
        //    Store the token in a pending collection so it can be claimed later
        if (!userId) {
            console.log('[Shopify3 Callback] No userId — storing as pending install for shop:', shop);
            try {
                await setDoc(doc(db, 'pendingShopifyInstalls', shop), {
                    accessToken: encryptTokenWithSecret(accessToken, SHOPIFY3_API_SECRET),
                    scopes: tokenScopes,
                    installedAt: new Date().toISOString(),
                    claimed: false,
                    appId: 'app3',
                });
                await writeDebug('5-pending-stored', { shop });
            } catch (e: any) {
                console.error('[Shopify3 Callback] Failed to store pending install:', e?.message);
                await writeDebug('error-pending-store', { error: e?.message || String(e) });
            }
            return NextResponse.redirect(
                `${APP_URL}/client-integrations?shopifyPending=true&pendingShop=${encodeURIComponent(shop)}`
            );
        }

        // 5. Save encrypted token to user's shopifyConfig with appId
        try {
            const encryptedToken = encryptTokenWithSecret(accessToken, SHOPIFY3_API_SECRET);

            await updateDoc(doc(db, 'users', userId), {
                shopifyConfig: {
                    shopUrl: shop,
                    accessToken: encryptedToken,
                    isConnected: true,
                    updatedAt: new Date().toISOString(),
                    scopes: tokenScopes,
                    appId: 'app3',
                }
            });

            console.log('[Shopify3 Callback] Token saved for user:', userId);
            await writeDebug('6-saved', { userId, shop });

            // 6. Register webhooks at app3's webhook endpoint
            const webhookResult = await registerShopifyWebhook(
                shop, accessToken, '/api/integrations/shopify3/webhook'
            );
            if (!webhookResult.success) {
                console.error('[Shopify3 Callback] Webhook registration failed:', webhookResult.error);
                await updateDoc(doc(db, 'users', userId), {
                    'shopifyConfig.webhookStatus': 'failed',
                    'shopifyConfig.webhookError': webhookResult.error
                });
            } else {
                await updateDoc(doc(db, 'users', userId), {
                    'shopifyConfig.webhookStatus': 'active'
                });
            }

            await writeDebug('7-complete', { userId, shop, webhookOk: webhookResult.success });

            // 7. Redirect back to dashboard with success
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`);

        } catch (error: any) {
            console.error('[Shopify3 Callback] Error saving:', error?.message, error?.stack);
            await writeDebug('error-save', { error: error?.message || String(error), userId });
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=callback_failed`);
        }

    } catch (error: any) {
        // Top-level catch — should never reach here but prevents 500 errors
        console.error('[Shopify3 Callback] UNHANDLED:', error?.message, error?.stack);
        try {
            await writeDebug('error-unhandled', { error: error?.message || String(error) });
        } catch { /* ignore */ }
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=callback_failed`);
    }
}
