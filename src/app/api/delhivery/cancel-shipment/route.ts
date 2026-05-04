// Next.js API Route - Delhivery Cancel Shipment
//
// POST /api/p/edit
// Auth: Authorization: Token <api_token>
// Body (JSON): { waybill: "<awb>", cancellation: "true" }

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDelhiveryCreds } from '@/services/server/resolveCourierCreds';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { waybill, clientId } = body;

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

        const response = await axios.post(
            `${baseUrl}/api/p/edit`,
            { waybill, cancellation: 'true' },
            {
                headers: {
                    Authorization: `Token ${creds.apiToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                timeout: 15000,
                validateStatus: () => true,
            }
        );

        const data = response.data;
        if (data?.status === false || response.status >= 400) {
            return NextResponse.json(
                {
                    error: data?.error || data?.remarks || 'Delhivery rejected the cancellation',
                    details: data,
                },
                { status: response.status >= 400 ? response.status : 400 }
            );
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Delhivery API] Cancel error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to cancel Delhivery shipment',
                details: error.response?.data || error.message,
            },
            { status: error.response?.status || 500 }
        );
    }
}
