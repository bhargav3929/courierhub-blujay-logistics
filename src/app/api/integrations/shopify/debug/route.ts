import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint to verify Shopify configuration
 * Access: GET /api/integrations/shopify/debug
 */
export async function GET() {
    const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
    const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // Check for pending installs from Custom Distribution
    let pendingInstalls: string[] = [];
    try {
        const pendingRef = collection(db, 'pendingShopifyInstalls');
        const snapshot = await getDocs(pendingRef);
        pendingInstalls = snapshot.docs
            .filter(d => !d.data().claimed)
            .map(d => d.id);
    } catch {
        // Collection may not exist yet
    }

    const diagnostics = {
        timestamp: new Date().toISOString(),
        appType: 'Public App (Custom Distribution)',
        configuration: {
            hasApiKey: !!SHOPIFY_API_KEY,
            apiKeyPrefix: SHOPIFY_API_KEY ? SHOPIFY_API_KEY.substring(0, 8) + '...' : 'NOT SET',
            hasApiSecret: !!SHOPIFY_API_SECRET,
            appUrl: APP_URL,
            callbackUrl: `${APP_URL}/api/integrations/shopify/callback`,
            webhookUrl: `${APP_URL}/api/integrations/shopify/webhook`,
            fulfillmentEndpoint: `${APP_URL}/api/integrations/shopify/fulfill`,
        },
        scopes: {
            required: 'read_orders,read_customers,write_fulfillments',
            note: 'write_fulfillments enables automatic tracking sync back to Shopify'
        },
        customDistribution: {
            status: 'supported',
            pendingInstallsCount: pendingInstalls.length,
            pendingShops: pendingInstalls,
            flow: [
                '1. Merchant clicks Custom Distribution link from Partner Dashboard',
                '2. Merchant authorizes on Shopify → callback stores token as pending',
                '3. Merchant logs into CourierHub → clicks Connect Shopify → enters store URL',
                '4. Install route finds pending install → claims it automatically (no OAuth needed)',
                '5. Webhook registered, connection complete',
            ],
        },
        requiredShopifySetup: {
            step1: 'Go to Shopify Partner Dashboard (partners.shopify.com)',
            step2: 'Navigate to Apps → Blujay Logistics → Configuration',
            step3: `Add this to "Allowed redirection URL(s)": ${APP_URL}/api/integrations/shopify/callback`,
            step4: 'Ensure API credentials (Client ID/Secret) match your environment variables',
            step5: 'Verify scopes include: read_orders, read_customers, write_fulfillments',
            step6: 'Under Distribution, set to "Custom distribution" and generate install link',
        },
        commonErrors: {
            'missing_params': 'Shopify did not return required OAuth parameters',
            'invalid_signature': 'HMAC verification failed - API secret mismatch',
            'invalid_state': 'Could not identify user - they must log in to CourierHub and click Connect Shopify',
            'token_exchange_failed': 'Failed to exchange authorization code for access token',
            'fulfillment_failed': 'Could not create fulfillment - order may already be fulfilled in Shopify',
        }
    };

    return NextResponse.json(diagnostics, { status: 200 });
}
