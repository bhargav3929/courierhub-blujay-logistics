import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, query, where, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

const SHOPIFY2_API_SECRET = process.env.SHOPIFY2_API_SECRET;

/**
 * GDPR: shop/redact (App 2)
 * Shopify sends this 48 hours after a merchant uninstalls the app.
 * We must delete all data associated with this shop within 48 hours.
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
        const { shop_domain } = payload;

        console.log(`[GDPR App2] shop/redact for ${shop_domain}`);

        // 1. Find the user connected to this shop
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where('shopifyConfig.shopUrl', '==', shop_domain));
        const userSnap = await getDocs(userQuery);

        for (const userDoc of userSnap.docs) {
            const userId = userDoc.id;

            // 2. Remove shopifyConfig from user document
            await updateDoc(doc(db, 'users', userId), {
                shopifyConfig: null,
            });

            // 3. Anonymize PII in Shopify shipments for this user
            const shipmentsQuery = query(
                collection(db, 'shipments'),
                where('clientId', '==', userId),
                where('clientType', '==', 'shopify')
            );
            const shipmentsSnap = await getDocs(shipmentsQuery);

            let redactedCount = 0;
            for (const shipmentDoc of shipmentsSnap.docs) {
                await updateDoc(doc(db, 'shipments', shipmentDoc.id), {
                    'destination.name': '[REDACTED]',
                    'destination.phone': '[REDACTED]',
                    'destination.address': '[REDACTED]',
                    'origin.name': '[REDACTED]',
                    'origin.phone': '[REDACTED]',
                    'origin.address': '[REDACTED]',
                    'notes': '[Shop data redacted per GDPR request]',
                    'shopifyOrderId': null,
                    'shopifyOrderNumber': null,
                    'gdprRedactedAt': new Date().toISOString(),
                });
                redactedCount++;
            }

            console.log(`[GDPR App2] Redacted ${redactedCount} shipments for shop ${shop_domain} (user ${userId})`);
        }

        // 4. Remove any pending installs for this shop
        try {
            await deleteDoc(doc(db, 'pendingShopifyInstalls', shop_domain));
        } catch {
            // May not exist
        }

        return NextResponse.json({ received: true });

    } catch (error: unknown) {
        console.error('[GDPR App2] shop/redact error:', error);
        return NextResponse.json({ received: true });
    }
}
