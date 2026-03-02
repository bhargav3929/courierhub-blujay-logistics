
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
    const SHOPIFY_LOOMS_API_SECRET = process.env.SHOPIFY_LOOMS_API_SECRET?.trim();

    try {
        const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

        if (!hmacHeader || !SHOPIFY_LOOMS_API_SECRET) {
            return NextResponse.json({ error: 'Missing headers or config' }, { status: 400 });
        }

        const rawBody = await request.text();

        if (!verifyWebhook(rawBody, hmacHeader, SHOPIFY_LOOMS_API_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        console.log('[Shopify-Looms GDPR] Customers redact request:', payload.shop_domain);

        // Log the request - actual data deletion would be implemented here
        // For now, we acknowledge receipt

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('[Shopify-Looms GDPR] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
