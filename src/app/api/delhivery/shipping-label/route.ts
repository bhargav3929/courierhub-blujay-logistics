// Next.js API Route - Delhivery Packing Slip / Shipping Label
//
// GET /api/p/packing_slip?wbns=<awb>&pdf=true
// Auth: Authorization: Token <api_token>
//
// Delhivery returns label data as JSON (we render it ourselves) or as PDF if
// `pdf=true` is appended. We default to JSON so the frontend can render an
// HTML label component (consistent with Blue Dart's pattern).

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDelhiveryCreds } from '@/services/server/resolveCourierCreds';

export async function GET(request: NextRequest) {
    try {
        const waybill = request.nextUrl.searchParams.get('waybill');
        const clientId = request.nextUrl.searchParams.get('clientId') || undefined;
        const wantPdf = request.nextUrl.searchParams.get('pdf') === 'true';

        if (!waybill) {
            return NextResponse.json({ error: 'Waybill is required' }, { status: 400 });
        }

        const creds = await resolveDelhiveryCreds(clientId);
        if (!creds || !creds.apiToken) {
            return NextResponse.json(
                { error: 'Delhivery API token not configured for this account.' },
                { status: 400 }
            );
        }

        const baseUrl = creds.isProduction
            ? 'https://track.delhivery.com'
            : 'https://staging-express.delhivery.com';

        const response = await axios.get(`${baseUrl}/api/p/packing_slip`, {
            params: { wbns: waybill, ...(wantPdf ? { pdf: 'true' } : {}) },
            headers: {
                Authorization: `Token ${creds.apiToken}`,
                Accept: wantPdf ? 'application/pdf' : 'application/json',
            },
            responseType: wantPdf ? 'arraybuffer' : 'json',
            timeout: 30000,
            validateStatus: () => true,
        });

        if (wantPdf) {
            return new NextResponse(response.data, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `inline; filename="Delhivery_Label_${waybill}.pdf"`,
                },
            });
        }

        return NextResponse.json(response.data, { status: response.status });
    } catch (error: any) {
        console.error('[Delhivery API] Label error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to fetch Delhivery shipping label',
                details: error.response?.data || error.message,
            },
            { status: error.response?.status || 500 }
        );
    }
}
