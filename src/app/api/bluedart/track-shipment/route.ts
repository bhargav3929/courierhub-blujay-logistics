// Next.js API Route - Blue Dart Track Shipment
// Uses the Tracking API License Key (separate from waybill license key)
// Blue Dart tracking API returns XML — we parse it to JSON for the frontend
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const IS_PRODUCTION = process.env.NEXT_PUBLIC_BLUEDART_ENV?.toLowerCase() === 'production';
const BLUEDART_BASE_URL = IS_PRODUCTION
    ? 'https://apigateway.bluedart.com/in/transportation'
    : 'https://apigateway-sandbox.bluedart.com/in/transportation';

let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

async function getAuthToken(): Promise<string> {
    if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
        return cachedToken;
    }

    const CLIENT_ID = process.env.NEXT_PUBLIC_BLUEDART_CLIENT_ID;
    const CLIENT_SECRET = process.env.NEXT_PUBLIC_BLUEDART_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Blue Dart credentials not configured');
    }

    try {
        console.log(`[BD Tracking] Authenticating (${IS_PRODUCTION ? 'PROD' : 'SANDBOX'})...`);

        const response = await axios.get(
            `${BLUEDART_BASE_URL}/token/v1/login`,
            {
                headers: {
                    'accept': 'application/json',
                    'ClientID': CLIENT_ID,
                    'clientSecret': CLIENT_SECRET
                }
            }
        );

        cachedToken = response.data.JWTToken || response.data.token;
        tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
        console.log('[BD Tracking] Token obtained');
        return cachedToken!;
    } catch (error: any) {
        console.error('[BD Tracking] Auth failed:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Blue Dart');
    }
}

/**
 * Simple XML to JSON parser for Blue Dart tracking responses.
 * Blue Dart returns XML like:
 * <ShipmentData><Shipment>...<Scans><ScanDetail>...</ScanDetail></Scans></Shipment></ShipmentData>
 */
function parseXmlToJson(xml: string): any {
    // Check for error response
    const errorMatch = xml.match(/<Error>([\s\S]*?)<\/Error>/);
    if (errorMatch) {
        return { error: errorMatch[1].trim() };
    }

    // Extract all Shipment blocks
    const shipmentBlocks = xml.match(/<Shipment>([\s\S]*?)<\/Shipment>/g);
    if (!shipmentBlocks || shipmentBlocks.length === 0) {
        // Return the raw XML as a fallback
        return { rawXml: xml };
    }

    const shipments = shipmentBlocks.map(block => {
        const shipment: any = {};

        // Extract simple fields
        const simpleFields = [
            'Status', 'StatusCode', 'PickUpDate', 'PickUpTime',
            'ExpectedDeliveryDate', 'Origin', 'Destination',
            'ConsigneeName', 'ReferenceNo', 'Weight', 'Pieces',
            'ProductType', 'SenderName'
        ];

        for (const field of simpleFields) {
            const match = block.match(new RegExp(`<${field}>(.*?)<\/${field}>`, 's'));
            if (match) {
                shipment[field] = match[1].trim();
            }
        }

        // Extract Scans
        const scanMatches = block.match(/<ScanDetail>([\s\S]*?)<\/ScanDetail>/g);
        if (scanMatches) {
            shipment.Scans = scanMatches.map(scanBlock => {
                const scan: any = {};
                const scanFields = [
                    'ScanDateTime', 'ScannedLocation', 'ScanType',
                    'Scan', 'ScanCode', 'Instructions', 'StatusDate', 'StatusTime'
                ];
                for (const field of scanFields) {
                    const match = scanBlock.match(new RegExp(`<${field}>(.*?)<\/${field}>`, 's'));
                    if (match) {
                        scan[field] = match[1].trim();
                    }
                }
                return { ScanDetail: scan };
            });
        }

        return shipment;
    });

    return {
        ShipmentData: shipments.map(s => ({ Shipment: s }))
    };
}

export async function GET(request: NextRequest) {
    try {
        const awb = request.nextUrl.searchParams.get('awb');

        if (!awb) {
            return NextResponse.json(
                { error: 'AWB number is required' },
                { status: 400 }
            );
        }

        const token = await getAuthToken();

        // Use tracking-specific license key (server-only env var)
        // Falls back to the regular license key if tracking key not set
        const TRACKING_LICENSE_KEY = process.env.BLUEDART_TRACKING_LICENSE_KEY
            || process.env.NEXT_PUBLIC_BLUEDART_LICENSE_KEY;
        const TRACKING_VERSION = process.env.BLUEDART_TRACKING_API_VERSION || '1.3';

        console.log(`[BD Tracking] Tracking AWB ${awb}...`);

        // Blue Dart Tracking API - POST with Profile block
        const payload = {
            ShipmentId: [awb],
            Profile: {
                LoginID: process.env.NEXT_PUBLIC_BLUEDART_LOGIN_ID,
                LicenceKey: TRACKING_LICENSE_KEY,
                Api_type: 'S',
                Version: TRACKING_VERSION
            }
        };

        const response = await axios.post(
            `${BLUEDART_BASE_URL}/tracking/v1/GetShipmentDetails`,
            payload,
            {
                headers: {
                    'JWTToken': token,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        console.log('[BD Tracking] Response received');

        // Blue Dart tracking returns XML — parse to JSON
        let data = response.data;
        if (typeof data === 'string' && data.includes('<?xml')) {
            data = parseXmlToJson(data);

            // Check for license/error in parsed response
            if (data.error) {
                console.error('[BD Tracking] API Error:', data.error);
                return NextResponse.json(
                    { error: data.error },
                    { status: 403 }
                );
            }
        }

        return NextResponse.json(data);
    } catch (error: any) {
        // If auth failed, clear cached token so next request retries
        if (error.response?.status === 401) {
            cachedToken = null;
            tokenExpiry = null;
        }

        console.error('[BD Tracking] Error:', error.response?.status, error.response?.data || error.message);

        // Handle XML error responses from Blue Dart
        let errorDetail = error.response?.data || error.message;
        if (typeof errorDetail === 'string' && errorDetail.includes('<?xml')) {
            const parsed = parseXmlToJson(errorDetail);
            errorDetail = parsed.error || errorDetail;
        }

        return NextResponse.json(
            {
                error: 'Failed to track Blue Dart shipment',
                details: errorDetail
            },
            { status: error.response?.status || 500 }
        );
    }
}
