import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getValidAccessToken } from '@/lib/shopifyToken';
import { adminAuth } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2026-04';

function mapCourierToShopifyCompany(courier: string): string {
    const mapping: Record<string, string> = {
        'Blue Dart': 'Bluedart',
        'DTDC': 'DTDC',
    };
    return mapping[courier] || courier;
}

function getTrackingUrl(courier: string, trackingNumber: string): string {
    const urls: Record<string, string> = {
        'Blue Dart': `https://www.bluedart.com/tracking/${trackingNumber}`,
        'DTDC': `https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno=${trackingNumber}`,
    };
    return urls[courier] || '';
}

async function getFulfillmentOrderId(
    shop: string, accessToken: string, orderId: string
): Promise<{ fulfillmentOrderId: string | null; error?: string }> {
    const response = await fetch(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}/fulfillment_orders.json`,
        {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Shopify Fulfill] Failed to get fulfillment orders — HTTP', response.status, '— Body:', errorBody);
        return { fulfillmentOrderId: null, error: `Shopify error (${response.status}): ${errorBody.slice(0, 200)}` };
    }

    const data = await response.json();
    const fulfillmentOrders = data.fulfillment_orders || [];
    console.log('[Shopify Fulfill] Fulfillment orders for', orderId, ':', JSON.stringify(fulfillmentOrders.map((fo: any) => ({ id: fo.id, status: fo.status }))));

    const openOrder = fulfillmentOrders.find(
        (fo: any) => fo.status === 'open' || fo.status === 'in_progress'
    );

    if (!openOrder) {
        return { fulfillmentOrderId: null, error: 'No open fulfillment order found — may already be fulfilled in Shopify' };
    }

    return { fulfillmentOrderId: openOrder.id.toString() };
}

async function createFulfillment(
    shop: string,
    accessToken: string,
    fulfillmentOrderId: string,
    trackingNumber: string,
    trackingCompany: string,
    trackingUrl: string
): Promise<{ fulfillmentId: string }> {
    const response = await fetch(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/fulfillments.json`,
        {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fulfillment: {
                    line_items_by_fulfillment_order: [
                        { fulfillment_order_id: parseInt(fulfillmentOrderId, 10) },
                    ],
                    tracking_info: {
                        number: trackingNumber,
                        company: trackingCompany || 'Other',
                        url: trackingUrl || '',
                    },
                    notify_customer: true,
                },
            }),
        }
    );

    const result = await response.json();

    if (!response.ok) {
        const errorMsg = result.errors ? JSON.stringify(result.errors) : result.error || 'Unknown error';
        throw new Error(`Shopify fulfillment error: ${errorMsg}`);
    }

    const fulfillment = result.fulfillment;
    if (!fulfillment) {
        throw new Error('Shopify did not return fulfillment data');
    }

    return { fulfillmentId: fulfillment.id.toString() };
}

export async function POST(request: Request) {
    let shipmentId: string | undefined;
    try {
        // 0. Verify Firebase auth token
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.split('Bearer ')[1];
        let authenticatedUserId: string;
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            authenticatedUserId = decodedToken.uid;
        } catch {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
        }

        ({ shipmentId } = await request.json());

        if (!shipmentId) {
            return NextResponse.json({ error: 'Missing shipmentId' }, { status: 400 });
        }

        // 1. Get shipment from Firestore
        const shipmentDoc = await getDoc(doc(db, 'shipments', shipmentId));
        if (!shipmentDoc.exists()) {
            return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
        }
        const shipment = shipmentDoc.data();

        // 1b. Verify the authenticated user owns this shipment
        if (shipment.clientId !== authenticatedUserId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 2. Verify this is a Shopify order with an AWB
        if (!shipment.shopifyOrderId) {
            return NextResponse.json({ error: 'Not a Shopify order' }, { status: 400 });
        }
        if (!shipment.courierTrackingId) {
            return NextResponse.json({ error: 'No AWB/tracking number assigned' }, { status: 400 });
        }

        // 3. Get user/merchant's Shopify config
        const userDoc = await getDoc(doc(db, 'users', shipment.clientId));
        if (!userDoc.exists()) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        const userData = userDoc.data();
        const shopifyConfig = userData.shopifyConfig;

        if (!shopifyConfig?.isConnected || !shopifyConfig?.accessToken) {
            return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 });
        }

        // 4. Resolve a valid Admin-API access token. Decrypts, and refreshes
        // or migrates the expiring offline token if needed (Shopify deprecated
        // permanent tokens), persisting any new token back to the user doc.
        const accessToken = await getValidAccessToken(
            {
                shopUrl: shopifyConfig.shopUrl,
                appId: shopifyConfig.appId,
                accessToken: shopifyConfig.accessToken,
                refreshToken: shopifyConfig.refreshToken,
                accessTokenExpiresAt: shopifyConfig.accessTokenExpiresAt,
                refreshTokenExpiresAt: shopifyConfig.refreshTokenExpiresAt,
            },
            (update) => updateDoc(doc(db, 'users', shipment.clientId), update),
        );
        const shop = shopifyConfig.shopUrl;

        // 5. Map courier to Shopify tracking info
        const trackingCompany = mapCourierToShopifyCompany(shipment.courier);
        const trackingNumber = shipment.courierTrackingId;
        const trackingUrl = getTrackingUrl(shipment.courier, trackingNumber);

        // 6. Get fulfillment order ID from Shopify
        const { fulfillmentOrderId, error: foError } = await getFulfillmentOrderId(
            shop, accessToken, shipment.shopifyOrderId
        );

        if (!fulfillmentOrderId) {
            const errorMsg = foError || 'No open fulfillment order found';
            await updateDoc(doc(db, 'shipments', shipmentId), {
                shopifyFulfillmentStatus: 'failed',
                shopifyFulfillmentError: errorMsg,
            });
            return NextResponse.json({ error: errorMsg }, { status: 400 });
        }

        // 7. Create fulfillment via GraphQL
        const result = await createFulfillment(
            shop, accessToken, fulfillmentOrderId,
            trackingNumber, trackingCompany, trackingUrl
        );

        // 8. Update shipment record with fulfillment status
        await updateDoc(doc(db, 'shipments', shipmentId), {
            shopifyFulfillmentId: result.fulfillmentId,
            shopifyFulfillmentStatus: 'fulfilled',
            shopifyFulfillmentSyncedAt: new Date().toISOString(),
        });

        console.log(`[Shopify Fulfill] Fulfillment created for shipment ${shipmentId}: ${result.fulfillmentId}`);

        return NextResponse.json({
            success: true,
            fulfillmentId: result.fulfillmentId
        });

    } catch (error: any) {
        console.error('[Shopify Fulfill] Error:', error);

        // Persist error to shipment so the UI shows SYNC FAILED with the reason
        if (shipmentId) {
            try {
                await updateDoc(doc(db, 'shipments', shipmentId), {
                    shopifyFulfillmentStatus: 'failed',
                    shopifyFulfillmentError: error.message || 'Fulfillment sync failed',
                });
            } catch { /* best-effort */ }
        }

        return NextResponse.json({
            error: error.message || 'Fulfillment sync failed'
        }, { status: 500 });
    }
}
