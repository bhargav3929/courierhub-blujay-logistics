
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function verifyWebhook(body: string, hmacHeader: string, secret: string): boolean {
    const generatedHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');
    const a = Buffer.from(generatedHmac);
    const b = Buffer.from(hmacHeader);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
    const SHOPIFY_PUBLIC_API_SECRET = process.env.SHOPIFY_PUBLIC_API_SECRET?.trim();

    try {
        const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

        if (!hmacHeader || !SHOPIFY_PUBLIC_API_SECRET) {
            return NextResponse.json({ error: 'Missing headers or config' }, { status: 400 });
        }

        const rawBody = await request.text();

        if (!verifyWebhook(rawBody, hmacHeader, SHOPIFY_PUBLIC_API_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        console.log('[Shopify-Public GDPR] Customers data request:', payload.shop_domain);

        // Log the request - actual data export would be implemented here
        // For now, we acknowledge receipt

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('[Shopify-Public GDPR] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
