// Next.js API Route - DTDC Cancel Shipment (via Shipsy Platform)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDtdcCreds } from '@/services/server/resolveCourierCreds';

const PROD_URL = 'https://dtdcapi.shipsy.io';
const STAGING_URL = 'https://alphademodashboardapi.shipsy.io';

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

        const creds = await resolveDtdcCreds(clientId);
        if (!creds.apiKey) {
            throw new Error('DTDC API key not configured for this account');
        }
        const baseUrl = creds.isProduction ? PROD_URL : STAGING_URL;

        const payload = {
            AWBNo: [awb],
            customerCode: creds.customerCode,
        };

        const response = await axios.post(
            `${baseUrl}/api/customer/integration/consignment/cancel`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': creds.apiKey,
                },
                timeout: 30000,
            }
        );

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
