
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebaseConfig';
import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { Shipment } from '@/types/types';

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

        if (generatedHmac !== hmac) {
            return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
        }

        // 2. Parse Payload
        const order = JSON.parse(rawBody);

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

        // 4. Map to Shipment - use user profile for origin when available
        const shippingAddress = order.shipping_address || {};

        // Use origin from user profile if available, otherwise use billing address from order
        const userPickupAddress = userData.pickupAddress || userData.origin || {};
        const billingAddress = order.billing_address || {};

        const originCity = userPickupAddress.city || billingAddress.city || '';
        const originPincode = userPickupAddress.pincode || billingAddress.zip || '';
        const originAddress = userPickupAddress.address || [billingAddress.address1, billingAddress.address2].filter(Boolean).join(', ') || '';
        const originPhone = userPickupAddress.phone || userData.phone || '';
        const originName = userPickupAddress.name || userData.name || '';

        // Determine if COD
        const isCOD = order.financial_status === 'pending' ||
            order.gateway === 'Cash on Delivery (COD)' ||
            (order.payment_gateway_names || []).some((g: string) => g.toLowerCase().includes('cod'));

        const newShipment: Omit<Shipment, 'id'> = {
            clientId: userId,
            clientName: userData.name || 'Shopify Merchant',
            clientType: 'shopify',

            courier: 'Optimization Pending',
            status: 'pending',

            origin: {
                city: originCity,
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

            productCode: 'D',
            productType: 'NDOX',
            pieceCount: order.line_items?.length || 1,
            actualWeight: order.total_weight ? order.total_weight / 1000 : 0.5,
            declaredValue: parseFloat(order.total_price) || 0,

            registerPickup: true,
            toPayCustomer: isCOD
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
