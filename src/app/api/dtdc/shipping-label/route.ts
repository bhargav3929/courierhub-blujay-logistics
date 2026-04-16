// Next.js API Route - DTDC Shipping Label (via Shipsy Platform)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDtdcCreds } from '@/services/server/resolveCourierCreds';

const PROD_URL = 'https://dtdcapi.shipsy.io';
const STAGING_URL = 'https://alphademodashboardapi.shipsy.io';

export async function GET(request: NextRequest) {
    try {
        const referenceNumber = request.nextUrl.searchParams.get('referenceNumber');
        const labelCode = request.nextUrl.searchParams.get('labelCode') || 'SHIP_LABEL_4X6';
        const labelFormat = request.nextUrl.searchParams.get('labelFormat') || 'pdf';
        const clientId = request.nextUrl.searchParams.get('clientId') || undefined;

        if (!referenceNumber) {
            return NextResponse.json(
                { error: 'Reference number is required' },
                { status: 400 }
            );
        }

        const creds = await resolveDtdcCreds(clientId);
        if (!creds.apiKey) {
            throw new Error('DTDC API key not configured for this account');
        }
        const baseUrl = creds.isProduction ? PROD_URL : STAGING_URL;

        const response = await axios.get(
            `${baseUrl}/api/customer/integration/consignment/shippinglabel/stream`,
            {
                params: {
                    reference_number: referenceNumber,
                    label_code: labelCode,
                    label_format: labelFormat,
                },
                headers: {
                    'api-key': creds.apiKey,
                },
                responseType: labelFormat === 'pdf' ? 'arraybuffer' : 'json',
                timeout: 30000,
            }
        );

        if (labelFormat === 'pdf') {
            return new NextResponse(response.data, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `inline; filename="DTDC_Label_${referenceNumber}.pdf"`,
                },
            });
        }

        return NextResponse.json(response.data);
    } catch (error: any) {
        console.error('[DTDC API] Label error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to fetch DTDC shipping label',
                details: error.response?.data || error.message
            },
            { status: error.response?.status || 500 }
        );
    }
}
