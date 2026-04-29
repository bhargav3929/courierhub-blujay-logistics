
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const SHOPIFY_PUBLIC_API_SECRET = process.env.SHOPIFY_PUBLIC_API_SECRET?.trim();

    try {
        const body = await request.json();
        const { userId, shipmentId, trackingNumber, trackingCompany, trackingUrl } = body;

        if (!userId || !shipmentId || !trackingNumber) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!SHOPIFY_PUBLIC_API_SECRET) {
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        // Get user's Shopify config
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userData = userDoc.data();
        const shopifyConfig = userData.shopifyConfig;

        if (!shopifyConfig?.isConnected || !shopifyConfig?.accessToken) {
            return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 });
        }

        // Verify this user is using the public app
        if (shopifyConfig.appId !== 'public') {
            return NextResponse.json({ error: 'User is not connected via public app' }, { status: 400 });
        }

        const accessToken = decryptTokenWithSecret(shopifyConfig.accessToken, SHOPIFY_PUBLIC_API_SECRET);
        const shopUrl = shopifyConfig.shopUrl;

        // Get shipment to find Shopify order ID
        const shipmentDoc = await getDoc(doc(db, 'shipments', shipmentId));
        if (!shipmentDoc.exists()) {
            return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
        }

        const shipment = shipmentDoc.data();
        const shopifyOrderId = shipment.shopifyOrderId;

        if (!shopifyOrderId) {
            return NextResponse.json({ error: 'No Shopify order linked to this shipment' }, { status: 400 });
        }

        // Get fulfillment orders for this order
        const fulfillmentOrdersResponse = await fetch(
            `https://${shopUrl}/admin/api/2024-10/orders/${shopifyOrderId}/fulfillment_orders.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!fulfillmentOrdersResponse.ok) {
            const errorText = await fulfillmentOrdersResponse.text();
            console.error('[Shopify-Public Fulfill] Failed to get fulfillment orders:', errorText);
            return NextResponse.json({ error: 'Failed to get fulfillment orders' }, { status: 500 });
        }

        const fulfillmentOrdersData = await fulfillmentOrdersResponse.json();
        const fulfillmentOrders = fulfillmentOrdersData.fulfillment_orders || [];

        // Find open fulfillment order
        const openFulfillmentOrder = fulfillmentOrders.find(
            (fo: any) => fo.status === 'open' || fo.status === 'in_progress'
        );

        if (!openFulfillmentOrder) {
            return NextResponse.json({ error: 'No open fulfillment order found' }, { status: 400 });
        }

        // Create fulfillment
        const fulfillmentPayload = {
            fulfillment: {
                line_items_by_fulfillment_order: [
                    {
                        fulfillment_order_id: openFulfillmentOrder.id,
                    },
                ],
                tracking_info: {
                    number: trackingNumber,
                    company: trackingCompany || 'Other',
                    url: trackingUrl || '',
                },
                notify_customer: true,
            },
        };

        const fulfillResponse = await fetch(
            `https://${shopUrl}/admin/api/2024-10/fulfillments.json`,
            {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(fulfillmentPayload),
            }
        );

        if (!fulfillResponse.ok) {
            const errorText = await fulfillResponse.text();
            console.error('[Shopify-Public Fulfill] Failed to create fulfillment:', errorText);
            return NextResponse.json({ error: 'Failed to create fulfillment', details: errorText }, { status: 500 });
        }

        const fulfillData = await fulfillResponse.json();

        return NextResponse.json({
            success: true,
            fulfillment: fulfillData.fulfillment,
        });

    } catch (error: any) {
        console.error('[Shopify-Public Fulfill] Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
