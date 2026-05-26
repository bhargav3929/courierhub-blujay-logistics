
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';

export const dynamic = 'force-dynamic';

// Verify Shopify webhook HMAC
function verifyWebhook(body: string, hmacHeader: string, secret: string): boolean {
    const generatedHmac = crypto
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmacHeader));
}

export async function POST(request: Request) {
    const SHOPIFY_PUBLIC_API_SECRET = process.env.SHOPIFY_PUBLIC_API_SECRET?.trim();

    try {
        const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
        const topic = request.headers.get('x-shopify-topic');
        const shopDomain = request.headers.get('x-shopify-shop-domain');

        if (!hmacHeader || !topic || !shopDomain) {
            return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
        }

        if (!SHOPIFY_PUBLIC_API_SECRET) {
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        const rawBody = await request.text();

        // Verify webhook signature
        if (!verifyWebhook(rawBody, hmacHeader, SHOPIFY_PUBLIC_API_SECRET)) {
            console.error('[Shopify-Public Webhook] Invalid HMAC signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(rawBody);

        console.log(`[Shopify-Public Webhook] Received ${topic} from ${shopDomain}`);

        // Handle orders/create webhook
        if (topic === 'orders/create') {
            // Find user by shop domain
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('shopifyConfig.shopUrl', '==', shopDomain));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                console.log('[Shopify-Public Webhook] No user found for shop:', shopDomain);
                return NextResponse.json({ received: true });
            }

            const userDoc = snapshot.docs[0];
            const userData = userDoc.data();

            // Verify this is a public app user
            if (userData.shopifyConfig?.appId !== 'public') {
                console.log('[Shopify-Public Webhook] User not connected via public app');
                return NextResponse.json({ received: true });
            }

            // Fetch full order from Shopify API (webhook payloads for public
            // apps redact protected customer data even with PCD approval —
            // the follow-up GET returns the complete order with PII fields).
            let order = payload;
            try {
                const encryptedToken = userData.shopifyConfig?.accessToken;
                const secret = (process.env.SHOPIFY_PUBLIC_API_SECRET || '').trim();
                if (encryptedToken && secret) {
                    const accessToken = decryptTokenWithSecret(encryptedToken, secret);
                    const orderRes = await fetch(
                        `https://${shopDomain}/admin/api/2026-04/orders/${payload.id}.json`,
                        { headers: { 'X-Shopify-Access-Token': accessToken } }
                    );
                    if (orderRes.ok) {
                        const fullOrder = await orderRes.json();
                        order = fullOrder.order || payload;
                        const sa = order.shipping_address || {};
                        console.log('[Shopify-Public Webhook] Fetched full order — name:', sa.name, 'phone:', sa.phone, 'zip:', sa.zip);
                    } else {
                        const errBody = await orderRes.text();
                        console.error('[Shopify-Public Webhook] Order fetch failed — HTTP', orderRes.status, ':', errBody.slice(0, 300));
                    }
                }
            } catch (fetchErr) {
                console.error('[Shopify-Public Webhook] Order fetch failed, using webhook payload:', fetchErr);
            }
            const shippingAddress = order.shipping_address || {};

            const shipmentData = {
                clientId: userDoc.id,
                clientName: userData.companyName || userData.displayName || 'Unknown',
                clientType: 'shopify',
                shopifyOrderId: order.id.toString(),
                shopifyOrderNumber: order.order_number?.toString() || order.name,
                status: 'shopify_pending',
                courier: '',

                // Receiver details
                receiverName: shippingAddress.name || `${shippingAddress.first_name || ''} ${shippingAddress.last_name || ''}`.trim(),
                receiverMobile: shippingAddress.phone || order.phone || '',

                // Destination
                destination: {
                    name: shippingAddress.name || `${shippingAddress.first_name || ''} ${shippingAddress.last_name || ''}`.trim(),
                    phone: shippingAddress.phone || order.phone || '',
                    address: [shippingAddress.address1, shippingAddress.address2].filter(Boolean).join(', '),
                    city: shippingAddress.city || '',
                    state: shippingAddress.province || '',
                    pincode: shippingAddress.zip || '',
                    country: shippingAddress.country_code || 'IN',
                },

                // Order details
                declaredValue: parseFloat(order.total_price) || 0,
                paymentMode: order.financial_status === 'paid' ? 'prepaid' : 'cod',

                // Line items
                shopifyLineItems: (order.line_items || []).map((item: any) => ({
                    id: item.id,
                    title: item.title,
                    quantity: item.quantity,
                    sku: item.sku || '',
                    price: parseFloat(item.price) || 0,
                })),

                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            };

            await addDoc(collection(db, 'shipments'), shipmentData);
            console.log('[Shopify-Public Webhook] Created shipment for order:', order.id);
        }

        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error('[Shopify-Public Webhook] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
