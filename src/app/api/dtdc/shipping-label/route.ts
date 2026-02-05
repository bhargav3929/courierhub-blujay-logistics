// Next.js API Route - DTDC Shipping Label (via Shipsy Platform)
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const IS_PRODUCTION = process.env.NEXT_PUBLIC_DTDC_ENV?.toLowerCase() === 'production';
const SHIPSY_BASE_URL = IS_PRODUCTION
    ? 'https://dtdcapi.shipsy.io'
    : 'https://alphademodashboardapi.shipsy.io';

const API_KEY = process.env.NEXT_PUBLIC_DTDC_API_KEY;

export async function GET(request: NextRequest) {
    try {
        const referenceNumber = request.nextUrl.searchParams.get('referenceNumber');
        const labelCode = request.nextUrl.searchParams.get('labelCode') || 'SHIP_LABEL_4X6';
        const labelFormat = request.nextUrl.searchParams.get('labelFormat') || 'pdf';

        if (!referenceNumber) {
            return NextResponse.json(
                { error: 'Reference number is required' },
                { status: 400 }
            );
        }

        if (!API_KEY) {
            throw new Error('DTDC API key not configured');
        }

        console.log(`[DTDC API] Fetching label for ${referenceNumber} (${labelCode}, ${labelFormat})...`);

        const response = await axios.get(
            `${SHIPSY_BASE_URL}/api/customer/integration/consignment/shippinglabel/stream`,
            {
                params: {
                    reference_number: referenceNumber,
                    label_code: labelCode,
                    label_format: labelFormat,
                },
                headers: {
                    'api-key': API_KEY,
                },
                responseType: labelFormat === 'pdf' ? 'arraybuffer' : 'json',
                timeout: 30000,
            }
        );

        if (labelFormat === 'pdf') {
            // Return raw PDF data with proper headers
            return new NextResponse(response.data, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `inline; filename="DTDC_Label_${referenceNumber}.pdf"`,
                },
            });
        }

        // For base64 format, return JSON response directly
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
