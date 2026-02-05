// Next.js API Route - DTDC Create Order (via Shipsy Platform)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const IS_PRODUCTION = process.env.NEXT_PUBLIC_DTDC_ENV?.toLowerCase() === 'production';
const SHIPSY_BASE_URL = IS_PRODUCTION
    ? 'https://dtdcapi.shipsy.io'
    : 'https://alphademodashboardapi.shipsy.io';

const API_KEY = process.env.NEXT_PUBLIC_DTDC_API_KEY;

export async function POST(request: NextRequest) {
    try {
        if (!API_KEY) {
            throw new Error('DTDC API key not configured');
        }

        const body = await request.json();

        console.log(`[DTDC API] Creating order (${IS_PRODUCTION ? 'PROD' : 'STAGING'})...`);

        // Wrap the consignment data in the expected array format
        const payload = {
            consignments: [body]
        };

        const response = await axios.post(
            `${SHIPSY_BASE_URL}/api/customer/integration/consignment/softdata`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': API_KEY,
                },
                timeout: 30000,
            }
        );

        console.log('[DTDC API] Order creation response:', JSON.stringify(response.data));

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('[DTDC API] Create order error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to create DTDC order',
                details: error.response?.data || error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}
