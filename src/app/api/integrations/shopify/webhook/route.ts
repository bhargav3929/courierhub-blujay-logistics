
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, getDoc, Timestamp } from 'firebase/firestore';
import { Shipment } from '@/types/types';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

export async function POST(request: Request) {
    try {
        const rawBody = await request.text();
        const headers = request.headers;
        const hmac = headers.get('X-Shopify-Hmac-Sha256');
        const topic = headers.get('X-Shopify-Topic');
        const shopDomain = headers.get('X-Shopify-Shop-Domain');

        if (!hmac || !shopDomain || !SHOPIFY_API_SECRET) {
            return NextResponse.json({ error: 'Missing headers or configuration' }, { status: 400 });
        }

        // 1. Verify HMAC
        const generatedHmac = crypto
            .createHmac('sha256', SHOPIFY_API_SECRET)
            .update(rawBody)
            .digest('base64');

        if (!crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmac))) {
            return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
        }

        // 2. Parse Payload
        const payload = JSON.parse(rawBody);

        // Handle APP_UNINSTALLED — mark shop as disconnected
        if (topic === 'app/uninstalled') {
            console.log(`[Shopify Webhook] APP_UNINSTALLED for ${shopDomain}`);

            const usersRef = collection(db, 'users');
            const uq = query(usersRef, where('shopifyConfig.shopUrl', '==', shopDomain));
            const uSnap = await getDocs(uq);

            for (const userDocument of uSnap.docs) {
                await updateDoc(doc(db, 'users', userDocument.id), {
                    'shopifyConfig.isConnected': false,
                    'shopifyConfig.uninstalledAt': new Date().toISOString(),
                });
                console.log(`[Shopify Webhook] Marked ${shopDomain} disconnected for user ${userDocument.id}`);
            }

            return NextResponse.json({ message: 'Uninstall processed' });
        }

        // Only process orders/create from here
        const order = payload;

        // 3. Find User/Client by Shop URL
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('shopifyConfig.shopUrl', '==', shopDomain));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error(`Received webhook for unknown shop: ${shopDomain}`);
            return NextResponse.json({ message: 'Shop not found' }, { status: 200 });
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        console.log(`Processing Order #${order.order_number} for User: ${userId}`);

        // Idempotency: check if we already have a shipment for this Shopify order
        const existingShipments = await getDocs(
            query(collection(db, 'shipments'),
                where('shopifyOrderId', '==', order.id?.toString()),
                where('clientId', '==', userId)
            )
        );

        if (!existingShipments.empty) {
            console.log(`Duplicate webhook: Order #${order.order_number} already processed`);
            return NextResponse.json({ message: 'Order already processed' });
        }

        // 4. Map to Shipment - use saved default pickup address from clients collection
        const shippingAddress = order.shipping_address || {};

        // Fetch defaultPickupAddress from the clients collection (saved via "Set Default" button)
        let savedPickupAddress: Record<string, string> | null = null;
        try {
            const clientDoc = await getDoc(doc(db, 'clients', userId));
            if (clientDoc.exists()) {
                savedPickupAddress = clientDoc.data().defaultPickupAddress || null;
            }
        } catch (err) {
            console.error('Failed to fetch client defaultPickupAddress:', err);
        }

        const originCity = savedPickupAddress?.city || '';
        const originPincode = savedPickupAddress?.pincode || '';
        const originAddress = savedPickupAddress?.address || '';
        const originPhone = savedPickupAddress?.phone || userData.phone || '';
        const originName = savedPickupAddress?.name || userData.name || '';
        const originState = savedPickupAddress?.state || '';

        // Determine if COD
        const isCOD = order.financial_status === 'pending' ||
            order.gateway === 'Cash on Delivery (COD)' ||
            (order.payment_gateway_names || []).some((g: string) => g.toLowerCase().includes('cod'));

        const newShipment: Omit<Shipment, 'id'> = {
            clientId: userId,
            clientName: userData.name || 'Shopify Merchant',
            clientType: 'shopify',

            courier: 'Optimization Pending',
            status: 'shopify_pending',
            shopifyOrderId: order.id?.toString(),
            shopifyOrderNumber: order.order_number?.toString(),
            shopifyOrderDate: order.created_at || new Date().toISOString(),
            shopifyLineItems: (order.line_items || []).map((item: any) => ({
                sku: item.sku || '',
                title: item.title || item.name || '',
                quantity: item.quantity || 1,
                price: item.price || '0',
                variant_title: item.variant_title || '',
            })),
            products: (order.line_items || []).map((item: any) => ({
                sku: item.sku || '',
                name: item.title || item.name || '',
                quantity: item.quantity || 1,
                price: parseFloat(item.price || '0'),
                variantTitle: item.variant_title || '',
            })),

            origin: {
                city: originCity,
                state: originState,
                pincode: originPincode,
                address: originAddress,
                phone: originPhone,
                name: originName
            },

            destination: {
                city: shippingAddress.city || '',
                state: shippingAddress.province || '',
                pincode: shippingAddress.zip || '',
                address: [shippingAddress.address1, shippingAddress.address2].filter(Boolean).join(', ') || '',
                name: `${shippingAddress.first_name || ''} ${shippingAddress.last_name || ''}`.trim(),
                phone: shippingAddress.phone || ''
            },

            weight: order.total_weight ? order.total_weight / 1000 : 0.5,

            courierCharge: 0,
            chargedAmount: parseFloat(order.total_price) || 0,
            marginAmount: 0,

            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),

            referenceNo: `ORD-${order.order_number}`,
            notes: `Shopify Order #${order.order_number} | ID: ${order.id}${isCOD ? ' | COD' : ' | Prepaid'}`,

            productCode: 'A',
            productType: 'NDOX',
            pieceCount: order.line_items?.length || 1,
            actualWeight: order.total_weight ? order.total_weight / 1000 : 0.5,
            declaredValue: parseFloat(order.total_price) || 0,

            registerPickup: true,
            toPayCustomer: isCOD,
            shopifyFulfillmentStatus: 'pending' as const
        };

        // 5. Save to Firestore
        const shipmentsRef = collection(db, 'shipments');
        await addDoc(shipmentsRef, newShipment);

        console.log(`Shipment created for Order #${order.order_number}`);

        return NextResponse.json({ message: 'Webhook processed successfully' });

    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
