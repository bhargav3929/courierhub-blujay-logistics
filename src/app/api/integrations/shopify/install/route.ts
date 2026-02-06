
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
        const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

        const { searchParams } = new URL(request.url);
        const shop = searchParams.get('shop');
        const userId = searchParams.get('userId');

        console.log('[Shopify Install] shop:', shop, 'userId:', userId, 'API_KEY exists:', !!SHOPIFY_API_KEY);

        if (!shop) {
            return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
        }

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
        }

        if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
            console.error('[Shopify Install] Missing env vars - SHOPIFY_API_KEY:', !!SHOPIFY_API_KEY, 'SHOPIFY_API_SECRET:', !!SHOPIFY_API_SECRET);
            return NextResponse.json({ error: 'Server misconfiguration: Missing Shopify credentials' }, { status: 500 });
        }

        // Ensure shop format
        const shopUrl = shop.includes('.') ? shop : `${shop}.myshopify.com`;

        const scopes = 'read_orders,read_customers,write_fulfillments';
        const redirectUri = `${APP_URL}/api/integrations/shopify/callback`;

        // Create signed state: base64-encode to avoid URL encoding issues
        const nonce = crypto.randomBytes(16).toString('hex');
        const payload = `${userId}:${nonce}`;
        const signature = crypto
            .createHmac('sha256', SHOPIFY_API_SECRET)
            .update(payload)
            .digest('hex');
        const state = Buffer.from(`${payload}:${signature}`).toString('base64url');

        const installUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

        console.log('[Shopify Install] Redirecting to OAuth URL');

        return NextResponse.redirect(installUrl, { status: 302 });
    } catch (error: any) {
        console.error('[Shopify Install] Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
