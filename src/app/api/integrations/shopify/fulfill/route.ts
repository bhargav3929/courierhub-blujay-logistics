import { NextResponse } from 'next/server';
import { db } from '@/lib/firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { decryptToken, decryptTokenWithSecret } from '@/lib/shopifyTokenCrypto';
import { adminAuth } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2024-10';

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
): Promise<string | null> {
    const orderGid = `gid://shopify/Order/${orderId}`;

    const query = `
        query getFulfillmentOrders($orderId: ID!) {
            order(id: $orderId) {
                fulfillmentOrders(first: 5) {
                    nodes {
                        id
                        status
                    }
                }
            }
        }
    `;

    const response = await fetch(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                query,
                variables: { orderId: orderGid }
            }),
        }
    );

    const result = await response.json();
    const fulfillmentOrders = result.data?.order?.fulfillmentOrders?.nodes || [];

    // Find the first OPEN or IN_PROGRESS fulfillment order
    const openOrder = fulfillmentOrders.find(
        (fo: { id: string; status: string }) => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS'
    );

    return openOrder?.id || null;
}

async function createFulfillment(
    shop: string,
    accessToken: string,
    fulfillmentOrderId: string,
    trackingNumber: string,
    trackingCompany: string,
    trackingUrl: string
): Promise<{ fulfillmentId: string }> {
    const mutation = `
        mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
            fulfillmentCreateV2(fulfillment: $fulfillment) {
                fulfillment {
                    id
                    status
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    const variables = {
        fulfillment: {
            lineItemsByFulfillmentOrder: [
                {
                    fulfillmentOrderId: fulfillmentOrderId,
                }
            ],
            notifyCustomer: true,
            trackingInfo: {
                number: trackingNumber,
                company: trackingCompany,
                url: trackingUrl,
            },
        },
    };

    const response = await fetch(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({ query: mutation, variables }),
        }
    );

    const result = await response.json();

    if (result.data?.fulfillmentCreateV2?.userErrors?.length > 0) {
        const err = result.data.fulfillmentCreateV2.userErrors[0];
        throw new Error(`Shopify fulfillment error: ${err.message}`);
    }

    const fulfillment = result.data?.fulfillmentCreateV2?.fulfillment;
    if (!fulfillment) {
        throw new Error('Shopify did not return fulfillment data');
    }

    return { fulfillmentId: fulfillment.id };
}

export async function POST(request: Request) {
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

        const { shipmentId } = await request.json();

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

        // 4. Decrypt access token (app2/app3 use their own secrets for encryption)
        let accessToken: string;
        if (shopifyConfig.appId === 'app2') {
            accessToken = decryptTokenWithSecret(shopifyConfig.accessToken, process.env.SHOPIFY2_API_SECRET || '');
        } else if (shopifyConfig.appId === 'app3') {
            accessToken = decryptTokenWithSecret(shopifyConfig.accessToken, process.env.SHOPIFY3_API_SECRET || '');
        } else {
            accessToken = decryptToken(shopifyConfig.accessToken);
        }
        const shop = shopifyConfig.shopUrl;

        // 5. Map courier to Shopify tracking info
        const trackingCompany = mapCourierToShopifyCompany(shipment.courier);
        const trackingNumber = shipment.courierTrackingId;
        const trackingUrl = getTrackingUrl(shipment.courier, trackingNumber);

        // 6. Get fulfillment order ID from Shopify
        const fulfillmentOrderId = await getFulfillmentOrderId(
            shop, accessToken, shipment.shopifyOrderId
        );

        if (!fulfillmentOrderId) {
            // Order may already be fulfilled manually in Shopify
            await updateDoc(doc(db, 'shipments', shipmentId), {
                shopifyFulfillmentStatus: 'failed',
                shopifyFulfillmentError: 'No open fulfillment order found — may already be fulfilled in Shopify',
            });
            return NextResponse.json({
                error: 'No open fulfillment order found in Shopify. It may already be fulfilled.'
            }, { status: 400 });
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
        return NextResponse.json({
            error: error.message || 'Fulfillment sync failed'
        }, { status: 500 });
    }
}
