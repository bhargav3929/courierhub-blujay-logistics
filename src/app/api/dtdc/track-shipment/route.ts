// Next.js API Route - DTDC Track Shipment (via DTDC's own tracking system)
// NOTE: This uses a SEPARATE auth system from the Shipsy platform (order/cancel/label)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDtdcCreds } from '@/services/server/resolveCourierCreds';

const TRACKING_BASE_URL = 'https://blktracksvc.dtdc.com/dtdc-api';

const trackingTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getTrackingToken(cacheKey: string, username?: string, password?: string): Promise<string> {
    const cached = trackingTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.token;
    }

    if (!username || !password) {
        throw new Error('DTDC tracking credentials not configured for this account');
    }

    console.log('[DTDC Tracking] Authenticating...');

    const response = await axios.get(
        `${TRACKING_BASE_URL}/api/dtdc/authenticate`,
        {
            params: { username, password },
            timeout: 15000,
        }
    );

    const token = typeof response.data === 'string' ? response.data : String(response.data);
    trackingTokenCache.set(cacheKey, { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
    console.log('[DTDC Tracking] Token obtained successfully');
    return token;
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

        const creds = await resolveDtdcCreds(clientId);
        const cacheKey = clientId || 'platform';
        const token = await getTrackingToken(cacheKey, creds.trackingUsername, creds.trackingPassword);

        console.log(`[DTDC Tracking] Tracking shipment ${awb}...`);

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

        return NextResponse.json(response.data);
    } catch (error: any) {
        if (error.response?.status === 401) {
            trackingTokenCache.clear();
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
