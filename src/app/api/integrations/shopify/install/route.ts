
import { NextResponse } from 'next/server';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get('shop');
    const userId = searchParams.get('userId');

    if (!shop) {
        return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
    }

    if (!userId) {
        return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
        console.error('Missing Shopify Environment Variables');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Scopes required for the app
    const scopes = 'read_orders,read_customers';

    // Callback URL
    const redirectUri = `${APP_URL}/api/integrations/shopify/callback`;

    // State to track the user (PASSED BACK in callback)
    // In production, this should be a signed method to prevent CSRF, but using userId for mapping for now
    const state = userId;

    // Construct the install URL
    // https://{shop}.myshopify.com/admin/oauth/authorize?client_id={api_key}&scope={scopes}&redirect_uri={redirect_uri}&state={state}

    // Ensure shop format is correct (myshopify.com)
    const shopUrl = shop.includes('.') ? shop : `${shop}.myshopify.com`;

    const installUrl = `https://${shopUrl}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return NextResponse.redirect(installUrl);
}
