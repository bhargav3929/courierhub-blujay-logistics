import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const SHOPIFY2_API_SECRET = process.env.SHOPIFY2_API_SECRET;

/**
 * GDPR: customers/redact (App 2)
 * Shopify sends this when a customer requests deletion of their data.
 * We must delete or anonymize their personal data within 30 days.
 */
export async function POST(request: Request) {
    try {
        const rawBody = await request.text();
        const hmac = request.headers.get('X-Shopify-Hmac-Sha256');

        if (!hmac || !SHOPIFY2_API_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify HMAC
        const generatedHmac = crypto
            .createHmac('sha256', SHOPIFY2_API_SECRET)
            .update(rawBody)
            .digest('base64');

        if (!crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac))) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const payload = JSON.parse(rawBody);
        const { shop_domain, customer, orders_to_redact } = payload;

        console.log(`[GDPR App2] customers/redact from ${shop_domain} for customer ${customer?.email}`);

        const customerPhone = customer?.phone;

        if (customerPhone) {
            const shipmentsRef = collection(db, 'shipments');
            const phoneQuery = query(shipmentsRef, where('destination.phone', '==', customerPhone));
            const phoneSnap = await getDocs(phoneQuery);

            let redactedCount = 0;
            for (const shipmentDoc of phoneSnap.docs) {
                await updateDoc(doc(db, 'shipments', shipmentDoc.id), {
                    'destination.name': '[REDACTED]',
                    'destination.phone': '[REDACTED]',
                    'destination.address': '[REDACTED]',
                    'notes': '[Customer data redacted per GDPR request]',
                    'gdprRedactedAt': new Date().toISOString(),
                });
                redactedCount++;
            }

            console.log(`[GDPR App2] Redacted ${redactedCount} shipments for customer`);
        }

        if (orders_to_redact?.length) {
            for (const orderId of orders_to_redact) {
                const orderQuery = query(
                    collection(db, 'shipments'),
                    where('shopifyOrderId', '==', orderId.toString())
                );
                const orderSnap = await getDocs(orderQuery);
                for (const shipmentDoc of orderSnap.docs) {
                    await updateDoc(doc(db, 'shipments', shipmentDoc.id), {
                        'destination.name': '[REDACTED]',
                        'destination.phone': '[REDACTED]',
                        'destination.address': '[REDACTED]',
                        'notes': '[Customer data redacted per GDPR request]',
                        'gdprRedactedAt': new Date().toISOString(),
                    });
                }
            }
        }

        return NextResponse.json({ received: true });

    } catch (error: unknown) {
        console.error('[GDPR App2] customers/redact error:', error);
        return NextResponse.json({ received: true });
    }
}
