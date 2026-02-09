import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

/**
 * GDPR: customers/data_request
 * Shopify sends this when a customer requests their data.
 * We must return 200 and process the request within 30 days.
 * We store the found data in a gdprDataRequests collection for merchant retrieval.
 */
export async function POST(request: Request) {
    try {
        const rawBody = await request.text();
        const hmac = request.headers.get('X-Shopify-Hmac-Sha256');

        if (!hmac || !SHOPIFY_API_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify HMAC
        const generatedHmac = crypto
            .createHmac('sha256', SHOPIFY_API_SECRET)
            .update(rawBody)
            .digest('base64');

        if (!crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac))) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        const { shop_domain, customer, orders_requested } = payload;

        console.log(`[GDPR] customers/data_request from ${shop_domain} for customer ${customer?.email}`);

        const customerEmail = customer?.email;
        const customerPhone = customer?.phone;
        const shipmentResults: Record<string, unknown>[] = [];

        if (customerEmail || customerPhone) {
            const shipmentsRef = collection(db, 'shipments');

            // Search by phone
            if (customerPhone) {
                const phoneQuery = query(shipmentsRef, where('destination.phone', '==', customerPhone));
                const phoneSnap = await getDocs(phoneQuery);
                phoneSnap.docs.forEach(d => {
                    shipmentResults.push({ id: d.id, ...d.data() });
                });
            }

            // Search by specific Shopify order IDs if provided
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

        // Store the data request and found data in Firestore for audit and merchant retrieval
        await addDoc(collection(db, 'gdprDataRequests'), {
            type: 'customers/data_request',
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

        console.log(`[GDPR] Stored data request with ${shipmentResults.length} shipments for merchant retrieval`);

        return NextResponse.json({ received: true });

    } catch (error: unknown) {
        console.error('[GDPR] customers/data_request error:', error);
        return NextResponse.json({ received: true });
    }
}
