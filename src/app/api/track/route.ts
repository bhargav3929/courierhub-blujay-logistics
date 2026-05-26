/**
 * Unified Tracking API — /api/track
 *
 * Single endpoint for tracking any shipment across all supported couriers.
 * Uses TrackerCourier.io as the primary source (no per-client carrier
 * credentials needed). Falls back to direct carrier APIs when the TC key
 * isn't configured or the request explicitly asks for it.
 *
 * Query params:
 *   awb            (required)  tracking / AWB / consignment number
 *   courier        (optional)  internal name or TC slug — "Blue Dart", "bluedart", "DTDC", etc.
 *                              If omitted, tries auto-detection across primary carriers.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    trackShipment,
    trackAutoDetect,
    resolveSlug,
    type NormalizedTracking,
} from '@/services/server/trackerCourierService';

export async function GET(request: NextRequest) {
    const awb = request.nextUrl.searchParams.get('awb');
    const courier = request.nextUrl.searchParams.get('courier');

    if (!awb) {
        return NextResponse.json(
            { success: false, error: 'awb query parameter is required' },
            { status: 400 }
        );
    }

    // Determine the TC slug
    let slug: string | null = null;
    if (courier) {
        slug = resolveSlug(courier) ?? courier.toLowerCase();
    }

    try {
        let result: NormalizedTracking | null = null;
        let _debug_error: string | null = null;

        try {
            if (slug) {
                result = await trackShipment(slug, awb);
            } else {
                result = await trackAutoDetect(awb);
            }
        } catch (tcErr: any) {
            _debug_error = tcErr.message || String(tcErr);
        }

        if (!result) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Tracking information not found',
                    tracking_number: awb,
                    courier_tried: slug || 'bluedart, dtdc, delhivery (auto-detect)',
                    _debug_key_configured: !!process.env.TRACKERCOURIER_API_KEY,
                    _debug_key_prefix: process.env.TRACKERCOURIER_API_KEY?.slice(0, 10) || 'MISSING',
                    _debug_tc_error: _debug_error,
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            source: 'trackercourier',
            ...result,
        });
    } catch (error: any) {
        console.error('[/api/track] Error:', error.message);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch tracking information', details: error.message },
            { status: 500 }
        );
    }
}
