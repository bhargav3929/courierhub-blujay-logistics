// Next.js API Route - Delhivery Create Order (Manifest)
//
// POST /api/cmu/create.json
// Auth:  Authorization: Token <api_token>
// Body:  application/x-www-form-urlencoded — `format=json&data=<URL-encoded JSON>`
//
// The body MUST be form-urlencoded with the JSON payload as a string in the
// `data` field, not a normal application/json body. Delhivery returns 400/HTML
// otherwise.

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { resolveDelhiveryCreds } from '@/services/server/resolveCourierCreds';
import { DELHIVERY_API_CONFIG, DELHIVERY_PREDEFINED } from '@/config/delhiveryConfig';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const clientId: string | undefined = body?.__clientId;
        if (clientId !== undefined) delete body.__clientId;

        const creds = await resolveDelhiveryCreds(clientId);
        if (!creds || !creds.apiToken) {
            return NextResponse.json(
                { error: 'Delhivery API token not configured for this account. Connect Delhivery in Integrations.' },
                { status: 400 }
            );
        }

        // If caller didn't supply a pickup_location, fill from the client's
        // connected Delhivery account first, then platform env fallback.
        if (!body.pickup_location || !body.pickup_location.name) {
            const fallbackName = creds.pickupLocationName || DELHIVERY_PREDEFINED.pickupLocationName;
            if (!fallbackName) {
                return NextResponse.json(
                    {
                        error:
                            'Delhivery pickup_location.name is required. Set the "Default Pickup Location Name" ' +
                            'when connecting Delhivery in Integrations, or configure DELHIVERY_PICKUP_LOCATION_NAME. ' +
                            'The name must match a warehouse you registered with Delhivery exactly (case-sensitive).',
                    },
                    { status: 400 }
                );
            }
            body.pickup_location = {
                name: fallbackName,
                add: DELHIVERY_PREDEFINED.pickupAddress,
                city: DELHIVERY_PREDEFINED.pickupCity,
                pin_code: DELHIVERY_PREDEFINED.pickupPincode,
                country: DELHIVERY_PREDEFINED.pickupCountry,
                phone: DELHIVERY_PREDEFINED.pickupPhone,
            };
        }

        const baseUrl = creds.isProduction
            ? 'https://track.delhivery.com'
            : 'https://staging-express.delhivery.com';

        const formBody = `format=json&data=${encodeURIComponent(JSON.stringify(body))}`;

        console.log(
            `[Delhivery API] Creating order (${creds.isProduction ? 'PROD' : 'STAGING'}) for ${clientId || 'platform'}`
        );

        const response = await axios.post(
            `${baseUrl}/api/cmu/create.json`,
            formBody,
            {
                headers: {
                    Authorization: `Token ${creds.apiToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
                timeout: 30000,
                validateStatus: () => true,
            }
        );

        // Delhivery returns 200 with `{success: false, ...}` on validation errors
        // — surface those as 400 so the UI shows them.
        const data = response.data;
        const success = data?.success !== false && data?.packages?.[0]?.status !== 'Fail';
        if (!success) {
            return NextResponse.json(
                {
                    error: data?.rmk || data?.error || data?.packages?.[0]?.remarks || 'Delhivery rejected the order',
                    details: data,
                },
                { status: response.status >= 400 ? response.status : 400 }
            );
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[Delhivery API] Create order error:', error.response?.data || error.message);
        return NextResponse.json(
            {
                error: 'Failed to create Delhivery order',
                details: error.response?.data || error.message,
            },
            { status: error.response?.status || 500 }
        );
    }
}
