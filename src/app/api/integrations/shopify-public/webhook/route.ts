
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';

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

            // Create shipment from order
            const order = payload;
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
