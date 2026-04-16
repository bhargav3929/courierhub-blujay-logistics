// Next.js API Route - DTDC Create Order (via Shipsy Platform)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDtdcCreds } from '@/services/server/resolveCourierCreds';

const PROD_URL = 'https://dtdcapi.shipsy.io';
const STAGING_URL = 'https://alphademodashboardapi.shipsy.io';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const clientId: string | undefined = body?.__clientId;
        if (clientId !== undefined) delete body.__clientId;

        const creds = await resolveDtdcCreds(clientId);
        if (!creds.apiKey) {
            throw new Error('DTDC API key not configured for this account');
        }
        const baseUrl = creds.isProduction ? PROD_URL : STAGING_URL;

        // Enforce the customer_code for the calling client (prevents accidental
        // use of platform customer code when a client has their own).
        if (creds.customerCode) {
            body.customer_code = creds.customerCode;
        }

        console.log(`[DTDC API] Creating order (${creds.isProduction ? 'PROD' : 'STAGING'}) for ${clientId || 'platform'}`);

        const payload = {
            consignments: [body],
        };

        const response = await axios.post(
            `${baseUrl}/api/customer/integration/consignment/softdata`,
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
