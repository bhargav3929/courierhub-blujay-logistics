// Next.js API Route - Blue Dart Track Shipment
// Uses the correct DHL/Blue Dart API Gateway tracking endpoint (GET with query params)
// Requests JSON format directly — no XML parsing needed
// Fallback: if JSON fails, tries XML format with parser
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveBlueDartCreds } from '@/services/server/resolveCourierCreds';

const SANDBOX_URL = 'https://apigateway-sandbox.bluedart.com/in/transportation';
const PROD_URL = 'https://apigateway.bluedart.com/in/transportation';

// Per-credential-set token cache — the route is called frequently by tracking
// sync jobs so we memoize auth per client.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAuthToken(cacheKey: string, creds: { clientId: string; clientSecret: string; isProduction: boolean }): Promise<string> {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.token;
    }
    if (!creds.clientId || !creds.clientSecret) {
        throw new Error('Blue Dart credentials not configured for this account');
    }
    const baseUrl = creds.isProduction ? PROD_URL : SANDBOX_URL;
    try {
        console.log(`[BD Tracking] Authenticating (${creds.isProduction ? 'PROD' : 'SANDBOX'})...`);
        const response = await axios.get(
            `${baseUrl}/token/v1/login`,
            {
                headers: {
                    'accept': 'application/json',
                    'ClientID': creds.clientId,
                    'clientSecret': creds.clientSecret,
                },
                timeout: 20000,
            }
        );
        const token = response.data.JWTToken || response.data.token;
        if (!token) throw new Error('Blue Dart did not return a token');
        tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
        console.log('[BD Tracking] Token obtained');
        return token;
    } catch (error: any) {
        console.error('[BD Tracking] Auth failed:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Blue Dart');
    }
}

/**
 * XML to JSON parser — fallback only, used when format=json isn't supported.
 */
function parseXmlToJson(xml: string): any {
    const errorMatch = xml.match(/<Error>([\s\S]*?)<\/Error>/);
    if (errorMatch) {
        return { error: errorMatch[1].trim() };
    }

    const shipmentBlocks = xml.match(/<Shipment>([\s\S]*?)<\/Shipment>/g);
    if (!shipmentBlocks || shipmentBlocks.length === 0) {
        return { rawXml: xml };
    }

    const shipments = shipmentBlocks.map(block => {
        const shipment: any = {};

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

/**
 * Check if a Blue Dart response contains an error.
 * Errors can appear at: data.error, data.Error, data.ShipmentData.Error, etc.
 */
function getResponseError(data: any): string | null {
    if (!data) return null;
    if (data.error) return String(data.error);
    if (data.Error) return String(data.Error);
    if (data.ShipmentData?.Error) return String(data.ShipmentData.Error);
    if (data.ShipmentData?.error) return String(data.ShipmentData.error);
    // Check if ShipmentData array has errors
    if (Array.isArray(data.ShipmentData) && data.ShipmentData[0]?.Error) {
        return String(data.ShipmentData[0].Error);
    }
    return null;
}

/**
 * Normalize the tracking response to a consistent format.
 * Blue Dart returns different structures depending on format (JSON vs XML parsed).
 * This ensures the frontend always gets: { ShipmentData: [{ Shipment: { Status, Scans: [...] } }] }
 */
function normalizeResponse(data: any): any {
    // Already in our expected format
    if (data?.ShipmentData?.[0]?.Shipment) {
        return data;
    }

    // Blue Dart JSON format: sometimes the root IS the shipment data
    // or it comes as { ShipmentData: { Shipment: { ... } } } (not array)
    if (data?.ShipmentData?.Shipment) {
        const shipment = data.ShipmentData.Shipment;
        return {
            ShipmentData: [{ Shipment: shipment }]
        };
    }

    // Sometimes Blue Dart wraps in GetShipmentDetailsResult or similar
    if (data?.GetShipmentDetailsResult) {
        return normalizeResponse(data.GetShipmentDetailsResult);
    }

    // If the data itself looks like a shipment (has Status field)
    if (data?.Status && (data?.Scans || data?.ScanDetail)) {
        return {
            ShipmentData: [{ Shipment: data }]
        };
    }

    // Return as-is if we can't normalize
    return data;
}

export async function GET(request: NextRequest) {
    try {
        const awb = request.nextUrl.searchParams.get('awb');
        const clientId = request.nextUrl.searchParams.get('clientId') || undefined;

        if (!awb) {
            return NextResponse.json(
                { error: 'AWB number is required' },
                { status: 400 }
            );
        }

        const creds = await resolveBlueDartCreds(clientId);
        const cacheKey = clientId || 'platform';
        const token = await getAuthToken(cacheKey, creds);
        const BLUEDART_BASE_URL = creds.isProduction ? PROD_URL : SANDBOX_URL;

        const TRACKING_LICENSE_KEY = creds.licenseKey;
        const LOGIN_ID = creds.loginId;

        console.log(`[BD Tracking] Tracking AWB ${awb}...`);

        let data: any = null;

        // ============================================================
        // Strategy 1: GET endpoint with format=json (correct DHL gateway method)
        // Endpoint: /tracking/v1?handler=tnt&action=custawbquery&...
        // ============================================================
        try {
            const response = await axios.get(
                `${BLUEDART_BASE_URL}/tracking/v1`,
                {
                    params: {
                        handler: 'tnt',
                        action: 'custawbquery',
                        loginid: LOGIN_ID,
                        awb: 'awb',
                        numbers: awb,
                        format: 'json',
                        lickey: TRACKING_LICENSE_KEY,
                        verno: '1.3',
                        scan: '1',  // 1 = include scan details/checkpoints
                    },
                    headers: {
                        'JWTToken': token,
                        'accept': 'application/json',
                    },
                    timeout: 15000,
                }
            );

            data = response.data;
            console.log('[BD Tracking] GET JSON response received');

            // If response came as string, try to parse
            if (typeof data === 'string') {
                // Might be XML even though we asked for JSON
                if (data.includes('<?xml') || data.includes('<ShipmentData')) {
                    data = parseXmlToJson(data);
                } else {
                    try {
                        data = JSON.parse(data);
                    } catch {
                        // Not parseable — fall through to Strategy 2
                        data = null;
                    }
                }
            }

            // Check for API error in response (Blue Dart nests errors in various places)
            const jsonErr = getResponseError(data);
            if (jsonErr) {
                console.warn('[BD Tracking] API Error (GET JSON):', jsonErr);
                data = null; // Fall through to Strategy 2
            }
        } catch (err: any) {
            console.warn('[BD Tracking] GET JSON failed, trying fallback:', err.response?.status || err.message);
            data = null;
        }

        // ============================================================
        // Strategy 2: GET with format=xml (fallback)
        // ============================================================
        if (!data) {
            try {
                const response = await axios.get(
                    `${BLUEDART_BASE_URL}/tracking/v1`,
                    {
                        params: {
                            handler: 'tnt',
                            action: 'custawbquery',
                            loginid: LOGIN_ID,
                            awb: 'awb',
                            numbers: awb,
                            format: 'xml',
                            lickey: TRACKING_LICENSE_KEY,
                            verno: '1.3',
                            scan: '1',
                        },
                        headers: {
                            'JWTToken': token,
                        },
                        timeout: 15000,
                    }
                );

                let xmlData = response.data;
                console.log('[BD Tracking] GET XML response received');

                if (typeof xmlData === 'string') {
                    data = parseXmlToJson(xmlData);
                    const xmlErr = getResponseError(data);
                    if (xmlErr) {
                        console.warn('[BD Tracking] API Error (GET XML):', xmlErr);
                        data = null;
                    }
                }
            } catch (err: any) {
                console.warn('[BD Tracking] GET XML also failed:', err.response?.status || err.message);
            }
        }

        // ============================================================
        // Strategy 3: POST to GetShipmentDetails (legacy fallback)
        // Some Blue Dart accounts may still use this endpoint
        // ============================================================
        if (!data) {
            try {
                const payload = {
                    ShipmentId: [awb],
                    Profile: {
                        LoginID: LOGIN_ID,
                        LicenceKey: TRACKING_LICENSE_KEY,
                        Api_type: 'S',
                        Version: '1.3'
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

                data = response.data;
                console.log('[BD Tracking] POST fallback response received');

                if (typeof data === 'string' && (data.includes('<?xml') || data.includes('<ShipmentData'))) {
                    data = parseXmlToJson(data);
                }

                const postErr = getResponseError(data);
                if (postErr) {
                    return NextResponse.json(
                        { error: postErr },
                        { status: 403 }
                    );
                }
            } catch (err: any) {
                console.error('[BD Tracking] All strategies failed');
                throw err; // Let the outer catch handle it
            }
        }

        // Normalize to consistent format
        data = normalizeResponse(data);

        return NextResponse.json(data);
    } catch (error: any) {
        if (error.response?.status === 401) {
            tokenCache.clear();
        }

        console.error('[BD Tracking] Error:', error.response?.status, error.response?.data || error.message);

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
