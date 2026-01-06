// Next.js API Route - Blue Dart Get Products
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const BLUEDART_BASE_URL = 'https://apigateway.bluedart.com';
const CLIENT_ID = process.env.NEXT_PUBLIC_BLUEDART_CLIENT_ID!;
const CLIENT_SECRET = process.env.NEXT_PUBLIC_BLUEDART_CLIENT_SECRET!;

let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

async function getAuthToken(): Promise<string> {
    if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
        return cachedToken;
    }

    const response = await axios.post(
        `${BLUEDART_BASE_URL}/in/transportation/token/v1/login`,
        {},
        {
            auth: {
                username: CLIENT_ID,
                password: CLIENT_SECRET
            }
        }
    );

    cachedToken = response.data.JWTToken || response.data.token;
    tokenExpiry = new Date(Date.now() + 50 * 60 * 1000);
    return cachedToken!;
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const origin = searchParams.get('origin');
        const destination = searchParams.get('destination');

        if (!origin || !destination) {
            return NextResponse.json(
                { error: 'Origin and destination pincodes are required' },
                { status: 400 }
            );
        }

        const token = await getAuthToken();

        const response = await axios.get(
            `${BLUEDART_BASE_URL}/in/transportation/products/v1/products`,
            {
                params: { origin, destination },
                headers: {
                    'JWTToken': token,
                    'Content-Type': 'application/json'
                }
            }
        );

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('[API] Get products error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to fetch products',
                details: error.response?.data || error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}
