
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function verifyWebhook(body: string, hmacHeader: string, secret: string): boolean {
    const generatedHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmacHeader));
}

export async function POST(request: Request) {
    const SHOPIFY_GAYATRI_API_SECRET = process.env.SHOPIFY_GAYATRI_API_SECRET?.trim();

    try {
        const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

        if (!hmacHeader || !SHOPIFY_GAYATRI_API_SECRET) {
            return NextResponse.json({ error: 'Missing headers or config' }, { status: 400 });
        }

        const rawBody = await request.text();

        if (!verifyWebhook(rawBody, hmacHeader, SHOPIFY_GAYATRI_API_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        console.log('[Shopify-Gayatri GDPR] Customers data request:', payload.shop_domain);

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('[Shopify-Gayatri GDPR] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
