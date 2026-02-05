// Next.js API Route - DTDC Track Shipment (via DTDC's own tracking system)
// NOTE: This uses a SEPARATE auth system from the Shipsy platform (order/cancel/label)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const TRACKING_BASE_URL = 'https://blktracksvc.dtdc.com/dtdc-api';

// Server-only credentials (NOT NEXT_PUBLIC_ prefix for security)
const TRACKING_USERNAME = process.env.DTDC_TRACKING_USERNAME;
const TRACKING_PASSWORD = process.env.DTDC_TRACKING_PASSWORD;

// Cache the tracking token server-side
let cachedTrackingToken: string | null = null;
let trackingTokenExpiry: Date | null = null;

async function getTrackingToken(): Promise<string> {
    // Return cached token if still valid
    if (cachedTrackingToken && trackingTokenExpiry && new Date() < trackingTokenExpiry) {
        return cachedTrackingToken;
    }

    if (!TRACKING_USERNAME || !TRACKING_PASSWORD) {
        throw new Error('DTDC tracking credentials not configured');
    }

    console.log('[DTDC Tracking] Authenticating...');

    const response = await axios.get(
        `${TRACKING_BASE_URL}/api/dtdc/authenticate`,
        {
            params: {
                username: TRACKING_USERNAME,
                password: TRACKING_PASSWORD,
            },
            timeout: 15000,
        }
    );

    // Token is returned directly as the response data
    cachedTrackingToken = typeof response.data === 'string' ? response.data : String(response.data);
    trackingTokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000); // Cache for 23 hours

    console.log('[DTDC Tracking] Token obtained successfully');
    return cachedTrackingToken!;
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

        const token = await getTrackingToken();

        console.log(`[DTDC Tracking] Tracking shipment ${awb}...`);

        // DTDC tracking API uses form-encoded body with POST method
        // and X-Access-Token header for authentication
        const params = new URLSearchParams();
        params.append('trkType', 'cnno');
        params.append('strcnno', awb);
        params.append('addtnlDtl', 'Y');

        const response = await axios.post(
            `${TRACKING_BASE_URL}/rest/JSONCnTrk/getTrackDetails`,
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Access-Token': token,
                },
                timeout: 15000,
            }
        );

        console.log('[DTDC Tracking] Response status:', response.data?.statusCode);

        return NextResponse.json(response.data);
    } catch (error: any) {
        // If auth failed, clear cached token so next request retries
        if (error.response?.status === 401) {
            cachedTrackingToken = null;
            trackingTokenExpiry = null;
        }

        console.error('[DTDC Tracking] Error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to track DTDC shipment',
                details: error.response?.data || error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}
