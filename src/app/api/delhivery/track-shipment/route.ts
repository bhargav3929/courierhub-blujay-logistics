// Next.js API Route - Delhivery Track Shipment
//
// GET /api/v1/packages/json/?waybill=<awb>
// Auth: Authorization: Token <api_token>
// Rate limit: 750 requests / 5 min / IP

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDelhiveryCreds } from '@/services/server/resolveCourierCreds';

export async function GET(request: NextRequest) {
    try {
        const waybill = request.nextUrl.searchParams.get('waybill');
        const clientId = request.nextUrl.searchParams.get('clientId') || undefined;

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

        const response = await axios.get(`${baseUrl}/api/v1/packages/json/`, {
            params: { waybill },
            headers: {
                Authorization: `Token ${creds.apiToken}`,
                Accept: 'application/json',
            },
            timeout: 15000,
            validateStatus: () => true,
        });

        return NextResponse.json(response.data, { status: response.status });
    } catch (error: any) {
        console.error('[Delhivery API] Tracking error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to track Delhivery shipment',
                details: error.response?.data || error.message,
            },
            { status: error.response?.status || 500 }
        );
    }
}
