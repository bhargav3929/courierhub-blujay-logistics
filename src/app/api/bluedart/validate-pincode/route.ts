// Next.js API Route - Blue Dart Pincode Validation
// Proxies requests to Blue Dart API to avoid CORS issues
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Determine base URL based on environment
const IS_PRODUCTION = process.env.NEXT_PUBLIC_BLUEDART_ENV?.toLowerCase() === 'production';
const BLUEDART_BASE_URL = IS_PRODUCTION
    ? 'https://apigateway.bluedart.com/in/transportation'
    : 'https://apigateway-sandbox.bluedart.com/in/transportation';

// Cache JWT token
let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

async function getAuthToken(): Promise<string> {
    // Return cached token if still valid
    if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
        console.log('[API] Using cached Blue Dart token');
        return cachedToken;
    }

    const CLIENT_ID = process.env.NEXT_PUBLIC_BLUEDART_CLIENT_ID;
    const CLIENT_SECRET = process.env.NEXT_PUBLIC_BLUEDART_CLIENT_SECRET;

    console.log('[API] Blue Dart credentials check:', {
        hasClientId: !!CLIENT_ID,
        hasClientSecret: !!CLIENT_SECRET,
        isProduction: IS_PRODUCTION,
        baseUrl: BLUEDART_BASE_URL
    });

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Blue Dart credentials not configured');
    }

    try {
        console.log('[API] Authenticating with Blue Dart using query params...');
        // IMPORTANT: Blue Dart uses GET with query params, not HTTP Basic Auth
        const response = await axios.get(
            `${BLUEDART_BASE_URL}/token/v1/login`,
            {
                params: {
                    clientID: CLIENT_ID,  // Note: clientID not clientId
                    clientSecret: CLIENT_SECRET
                }
            }
        );

        console.log('[API] Blue Dart auth response status:', response.status);

        cachedToken = response.data.JWTToken || response.data.token;

        if (!cachedToken) {
            throw new Error('No token received from Blue Dart');
        }

        // Set expiry to 23 hours
        tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);

        console.log('[API] Blue Dart authentication successful, token cached');
        return cachedToken;
    } catch (error: any) {
        console.error('[API] Blue Dart authentication failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw new Error('Failed to authenticate with Blue Dart: ' + (error.response?.data?.message || error.message));
    }
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const pincode = searchParams.get('pincode');

        console.log('[API] Pincode validation request:', { pincode });

        if (!pincode) {
            return NextResponse.json(
                { error: 'Pincode is required' },
                { status: 400 }
            );
        }

        // Get JWT token
        const token = await getAuthToken();

        console.log('[API] Making Blue Dart API request with Authorization: Bearer header');

        // Make request to Blue Dart API
        // IMPORTANT: Use Authorization: Bearer header, not JWTToken header
        const response = await axios.get(
            `${BLUEDART_BASE_URL}/finder/v1/pincode`,
            {
                params: { pincode },
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[API] Blue Dart pincode validation successful');
        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('[API] Pincode validation error:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message
        });

        return NextResponse.json(
            {
                error: 'Failed to validate pincode',
                details: error.response?.data || error.message,
                status: error.response?.status
            },
            { status: error.response?.status || 500 }
        );
    }
}
