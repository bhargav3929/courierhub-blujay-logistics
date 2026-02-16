import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const SHOPIFY3_API_SECRET = process.env.SHOPIFY3_API_SECRET;

/**
 * GDPR: customers/data_request (App 3)
 * Shopify sends this when a customer requests their data.
 * We must return 200 and process the request within 30 days.
 */
export async function POST(request: Request) {
    try {
        const rawBody = await request.text();
        const hmac = request.headers.get('X-Shopify-Hmac-Sha256');

        if (!hmac || !SHOPIFY3_API_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify HMAC
        const generatedHmac = crypto
            .createHmac('sha256', SHOPIFY3_API_SECRET)
            .update(rawBody)
            .digest('base64');

        if (!crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac))) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        const { shop_domain, customer, orders_requested } = payload;

        console.log(`[GDPR App3] customers/data_request from ${shop_domain} for customer ${customer?.email}`);

        const customerEmail = customer?.email;
        const customerPhone = customer?.phone;
        const shipmentResults: Record<string, unknown>[] = [];

        if (customerEmail || customerPhone) {
            const shipmentsRef = collection(db, 'shipments');

            if (customerPhone) {
                const phoneQuery = query(shipmentsRef, where('destination.phone', '==', customerPhone));
                const phoneSnap = await getDocs(phoneQuery);
                phoneSnap.docs.forEach(d => {
                    shipmentResults.push({ id: d.id, ...d.data() });
                });
            }

            if (orders_requested?.length) {
                for (const orderId of orders_requested) {
                    const orderQuery = query(shipmentsRef, where('shopifyOrderId', '==', orderId.toString()));
                    const orderSnap = await getDocs(orderQuery);
                    orderSnap.docs.forEach(d => {
                        if (!shipmentResults.find(r => r.id === d.id)) {
                            shipmentResults.push({ id: d.id, ...d.data() });
                        }
                    });
                }
            }
        }

        await addDoc(collection(db, 'gdprDataRequests'), {
            type: 'customers/data_request',
            appId: 'app3',
            shopDomain: shop_domain,
            customerEmail: customerEmail || null,
            customerPhone: customerPhone || null,
            ordersRequested: orders_requested || [],
            shipmentCount: shipmentResults.length,
            customerData: shipmentResults.map(s => ({
                shipmentId: s.id,
                destination: s.destination,
                origin: s.origin,
                shopifyOrderId: s.shopifyOrderId,
                shopifyOrderNumber: s.shopifyOrderNumber,
                status: s.status,
                createdAt: s.createdAt,
            })),
            requestedAt: Timestamp.now(),
            processedAt: Timestamp.now(),
            status: 'processed',
        });

        console.log(`[GDPR App3] Stored data request with ${shipmentResults.length} shipments`);

        return NextResponse.json({ received: true });

    } catch (error: unknown) {
        console.error('[GDPR App3] customers/data_request error:', error);
        return NextResponse.json({ received: true });
    }
}
