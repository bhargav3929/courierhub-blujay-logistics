/**
 * GET /api/dtdc/serviceability?origin=500072&destination=110001
 *
 * Returns DTDC serviceability info (TAT, COD availability, etc.) for a route,
 * derived from the offline TAT tables DTDC publishes per origin city.
 *
 * Used by the booking UI to give instant feedback before the user attempts
 * a real booking against DTDC's live API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { lookupServiceability } from '@/lib/dtdcServiceability';

export async function GET(request: NextRequest) {
    const origin = request.nextUrl.searchParams.get('origin') || '';
    const destination = request.nextUrl.searchParams.get('destination') || '';

    if (!/^\d{6}$/.test(origin) || !/^\d{6}$/.test(destination)) {
        return NextResponse.json(
            { error: 'Both origin and destination must be 6-digit pincodes.' },
            { status: 400 }
        );
    }

    const result = lookupServiceability(origin, destination);
    return NextResponse.json(result);
}
