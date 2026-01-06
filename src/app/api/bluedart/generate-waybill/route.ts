// Next.js API Route - Blue Dart Generate Waybill (Create Shipment)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Determine base URL based on environment
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
        console.log(`[API] Authenticating with Blue Dart (${IS_PRODUCTION ? 'PROD' : 'SANDBOX'})...`);
        const response = await axios.get(
            `${BLUEDART_BASE_URL}/token/v1/login`,
            {
                params: {
                    clientID: CLIENT_ID,
                    clientSecret: CLIENT_SECRET
                }
            }
        );

        cachedToken = response.data.JWTToken || response.data.token;
        tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23h expiry
        return cachedToken!;
    } catch (error: any) {
        console.error('[API] Blue Dart authentication failed:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Blue Dart');
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const token = await getAuthToken();

        console.log('[API] Generating Waybill...');

        const response = await axios.post(
            `${BLUEDART_BASE_URL}/waybill/v1/GenerateWayBill`,
            body,
            {
                headers: {
                    'JWTToken': token,  // Blue Dart requires JWTToken header, NOT Authorization: Bearer
                    'Content-Type': 'application/json'
                }
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
