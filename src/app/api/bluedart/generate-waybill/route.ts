// Next.js API Route - Blue Dart Generate Waybill (Create Shipment)
//
// Resolution: if the request includes a `clientId` in the body, we try to use
// that client's stored Blue Dart credentials (from the Integrations page).
// Otherwise we fall back to the platform-wide env vars.

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveBlueDartCreds } from '@/services/server/resolveCourierCreds';

const SANDBOX_URL = 'https://apigateway-sandbox.bluedart.com/in/transportation';
const PROD_URL = 'https://apigateway.bluedart.com/in/transportation';

// Per-credential-set token cache (keyed by clientId or 'platform').
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
        console.log(`[API] Authenticating with Blue Dart (${creds.isProduction ? 'PROD' : 'SANDBOX'})...`);
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
        // 23h expiry to be safe
        tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 });
        console.log('[API] Token obtained successfully');
        return token;
    } catch (error: any) {
        console.error('[API] Blue Dart authentication failed:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Blue Dart');
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const clientId: string | undefined = body?.__clientId;
        // Strip the internal routing field before sending to Blue Dart
        if (clientId !== undefined) {
            delete body.__clientId;
        }

        const creds = await resolveBlueDartCreds(clientId);
        const cacheKey = clientId || 'platform';
        const token = await getAuthToken(cacheKey, creds);

        const baseUrl = creds.isProduction ? PROD_URL : SANDBOX_URL;

        // Ensure the Profile block carries the right LoginID/LicenceKey.
        // Callers may send them already, but if the request is using per-client
        // creds we override.
        if (clientId) {
            body.Profile = {
                ...(body.Profile || {}),
                LoginID: creds.loginId,
                LicenceKey: creds.licenseKey,
                Api_type: body.Profile?.Api_type || 'S',
                Version: body.Profile?.Version || '1.10',
            };
        }

        console.log('[API] Generating Waybill (', cacheKey, ')…');

        const response = await axios.post(
            `${baseUrl}/waybill/v1/GenerateWayBill`,
            body,
            {
                headers: {
                    'JWTToken': token,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('[API] Generate waybill error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to generate waybill',
                details: error.response?.data || error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}
