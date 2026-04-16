import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveBlueDartCreds } from '@/services/server/resolveCourierCreds';

const SANDBOX_URL = 'https://apigateway-sandbox.bluedart.com/in/transportation';
const PROD_URL = 'https://apigateway.bluedart.com/in/transportation';

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
        return token;
    } catch (error: any) {
        console.error('[API] Blue Dart authentication failed:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Blue Dart');
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { awb, clientId } = body;

        if (!awb) {
            return NextResponse.json(
                { error: 'AWB Number is required' },
                { status: 400 }
            );
        }

        const creds = await resolveBlueDartCreds(clientId);
        const cacheKey = clientId || 'platform';
        const token = await getAuthToken(cacheKey, creds);
        const BLUEDART_BASE_URL = creds.isProduction ? PROD_URL : SANDBOX_URL;

        const payload = {
            Request: {
                AWBNo: awb
            },
            Profile: {
                LoginID: creds.loginId,
                LicenceKey: creds.licenseKey,
                Api_type: 'S',
                Version: '1.10'
            }
        };

        const response = await axios.post(
            `${BLUEDART_BASE_URL}/waybill/v1/CancelWaybill`,
            payload,
            {
                headers: {
                    'JWTToken': token,
                    'Content-Type': 'application/json'
                },
                timeout: 30000,
            }
        );

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('[API] Cancel waybill error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to cancel waybill',
                details: error.response?.data || error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}
