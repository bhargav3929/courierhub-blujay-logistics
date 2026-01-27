
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // This is our userId
    const hmac = searchParams.get('hmac');

    if (!shop || !code || !hmac || !state) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (!SHOPIFY_API_SECRET) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // 1. Verify HMAC
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
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 400 });
    }

    // 2. Exchange access code for access token
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

        const tokenData = await accessTokenResponse.json();

        if (!tokenData.access_token) {
            throw new Error('Failed to retrieve access token');
        }

        const accessToken = tokenData.access_token;

        // 3. Save to Firestore
        // state contains the userId
        const userId = state;

        await updateDoc(doc(db, 'users', userId), {
            shopifyConfig: {
                shopUrl: shop,
                accessToken: accessToken, // Note: In production, encrypt this!
                isConnected: true,
                updatedAt: new Date().toISOString()
            }
        });

        // 4. Register Webhook (Order Creation) - Auto setup
        await registerWebhook(shop, accessToken);

        // 5. Redirect back to dashboard
        return NextResponse.redirect(`${APP_URL}/client-integrations?shopifySuccess=true`);

    } catch (error: any) {
        console.error('Shopify Callback Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function registerWebhook(shop: string, accessToken: string) {
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
        const response = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({ query, variables }),
        });

        const result = await response.json();
        console.log('Webhook Registration Result:', JSON.stringify(result));

    } catch (error) {
        console.error('Failed to register webhook:', error);
        // Don't fail the whole request flow if webhook fails, just log it. 
        // User is still "connected".
    }
}
