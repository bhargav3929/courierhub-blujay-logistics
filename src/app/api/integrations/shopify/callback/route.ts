
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { encryptToken } from '@/lib/shopifyTokenCrypto';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
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
            .createHmac('sha256', SHOPIFY_API_SECRET!)
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
// Used when Custom distribution install link bypasses our install route
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
        console.error('[Shopify Callback] Error looking up user by shop:', error);
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

    if (!SHOPIFY_API_SECRET || !SHOPIFY_API_KEY) {
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
        .createHmac('sha256', SHOPIFY_API_SECRET)
        .update(message)
        .digest('hex');

    if (generatedHmac !== hmac) {
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=invalid_signature`);
    }

    // 2. Extract userId: try signed state first, fall back to shop domain lookup
    let userId: string | null = null;

    if (state) {
        userId = verifySignedState(state);
    }

    // Fallback for Custom distribution installs (no signed state)
    if (!userId) {
        console.log('[Shopify Callback] No valid state, looking up user by shop domain:', shop);
        userId = await findUserByPendingShop(shop);
    }

    if (!userId) {
        console.error('[Shopify Callback] Could not determine userId for shop:', shop);
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=invalid_state`);
    }

    // 3. Exchange authorization code for access token
    try {
        const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: SHOPIFY_API_KEY,
                client_secret: SHOPIFY_API_SECRET,
                code,
            }),
        });

        if (!accessTokenResponse.ok) {
            console.error('Shopify token exchange failed:', accessTokenResponse.status);
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=token_exchange_failed`);
        }

        const tokenData = await accessTokenResponse.json();

        if (!tokenData.access_token) {
            return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=no_token`);
        }

        const accessToken = tokenData.access_token;

        // 4. Save encrypted token to Firestore
        await updateDoc(doc(db, 'users', userId), {
            shopifyConfig: {
                shopUrl: shop,
                accessToken: encryptToken(accessToken),
                isConnected: true,
                updatedAt: new Date().toISOString(),
                scopes: tokenData.scope || 'read_orders,read_customers,write_fulfillments'
            }
        });

        // 5. Register Webhook for order creation
        const webhookResult = await registerWebhook(shop, accessToken);
        if (!webhookResult.success) {
            console.error('Webhook registration failed:', webhookResult.error);
            // Still mark as connected, but note the webhook issue
            await updateDoc(doc(db, 'users', userId), {
                'shopifyConfig.webhookStatus': 'failed',
                'shopifyConfig.webhookError': webhookResult.error
            });
        } else {
            await updateDoc(doc(db, 'users', userId), {
                'shopifyConfig.webhookStatus': 'active'
            });
        }

        // 6. Redirect back to dashboard with success
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`);

    } catch (error: any) {
        console.error('Shopify Callback Error:', error);
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifyError=callback_failed`);
    }
}

async function registerWebhook(shop: string, accessToken: string): Promise<{ success: boolean; error?: string }> {
    const webhookUrl = `${APP_URL}/api/integrations/shopify/webhook`;

    const query = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        userErrors {
          field
          message
        }
        webhookSubscription {
          id
        }
      }
    }
  `;

    const variables = {
        topic: "ORDERS_CREATE",
        webhookSubscription: {
            callbackUrl: webhookUrl,
            format: "JSON"
        }
    };

    try {
        const response = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({ query, variables }),
        });

        const result = await response.json();

        if (result.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
            return { success: false, error: result.data.webhookSubscriptionCreate.userErrors[0].message };
        }

        console.log('Webhook registered successfully:', result.data?.webhookSubscriptionCreate?.webhookSubscription?.id);
        return { success: true };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
