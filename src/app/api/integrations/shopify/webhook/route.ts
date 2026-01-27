
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
        // Query for users where shopifyConfig.shopUrl == shopDomain
        const q = query(usersRef, where('shopifyConfig.shopUrl', '==', shopDomain));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.error(`Received webhook for unknown shop: ${shopDomain}`);
            return NextResponse.json({ message: 'Shop not found' }, { status: 200 }); // Return 200 to stop retries if appropriate
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        console.log(`Processing Order #${order.order_number} for User: ${userId}`);

        // 4. Map to Shipment
        // Helper to format address
        const shippingAddress = order.shipping_address || {};

        // Default shipment object
        const newShipment: Omit<Shipment, 'id'> = {
            clientId: userId,
            clientName: userData.name || 'Shopify Merchant',
            clientType: 'shopify',

            courier: 'Optimization Pending', // To be assigned later
            status: 'pending',

            origin: {
                // Ideally fetch from User Profile. Using defaults or placeholders if missing.
                city: 'HYD', // Default for now, should come from User config
                pincode: '500081',
                address: 'Default Pickup Address'
            },

            destination: {
                city: shippingAddress.city || '',
                state: shippingAddress.province || '',
                pincode: shippingAddress.zip || '',
                address: [shippingAddress.address1, shippingAddress.address2].filter(Boolean).join(', ') || '',
                name: `${shippingAddress.first_name || ''} ${shippingAddress.last_name || ''}`.trim(),
                phone: shippingAddress.phone || ''
            },

            weight: order.total_weight ? order.total_weight / 1000 : 0.5, // Shopify sends grams

            // Financials (Simplified)
            courierCharge: 0,
            chargedAmount: parseFloat(order.total_price),
            marginAmount: 0,

            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),

            // References
            referenceNo: `ORD-${order.order_number}`,
            notes: `Shopify Order ID: ${order.id}`,

            // Product Defaults
            productCode: 'D',
            productType: 'NDOX',
            pieceCount: 1,
            actualWeight: order.total_weight ? order.total_weight / 1000 : 0.5,
            declaredValue: parseFloat(order.total_price),

            // Extra
            registerPickup: true,
            toPayCustomer: false // Prepaid usually, unless COD logic added
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
