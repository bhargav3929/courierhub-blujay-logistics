// Next.js API Route - DTDC Cancel Shipment (via Shipsy Platform)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const IS_PRODUCTION = process.env.NEXT_PUBLIC_DTDC_ENV?.toLowerCase() === 'production';
const SHIPSY_BASE_URL = IS_PRODUCTION
    ? 'https://dtdcapi.shipsy.io'
    : 'https://alphademodashboardapi.shipsy.io';

const API_KEY = process.env.NEXT_PUBLIC_DTDC_API_KEY;
const CUSTOMER_CODE = process.env.NEXT_PUBLIC_DTDC_CUSTOMER_CODE;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { awb } = body;

        if (!awb) {
            return NextResponse.json(
                { error: 'AWB Number is required' },
                { status: 400 }
            );
        }

        if (!API_KEY) {
            throw new Error('DTDC API key not configured');
        }

        console.log(`[DTDC API] Cancelling shipment ${awb} (${IS_PRODUCTION ? 'PROD' : 'STAGING'})...`);

        const payload = {
            AWBNo: [awb],
            customerCode: CUSTOMER_CODE,
        };

        const response = await axios.post(
            `${SHIPSY_BASE_URL}/api/customer/integration/consignment/cancel`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': API_KEY,
                },
                timeout: 30000,
            }
        );

        console.log('[DTDC API] Cancel response:', JSON.stringify(response.data));

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('[DTDC API] Cancel error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to cancel DTDC shipment',
                details: error.response?.data || error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}
