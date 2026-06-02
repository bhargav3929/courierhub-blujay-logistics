/**
 * Client-side universal tracking service.
 *
 * Calls the unified /api/track endpoint (backed by TrackerCourier.io).
 * Returns data shaped so existing UI parsers can consume it seamlessly.
 */

import axios from 'axios';

export interface UnifiedTrackingCheckpoint {
    date: string;
    time: string;
    location: string;
    activity: string;
    state: string;
}

export interface UnifiedTrackingResult {
    __source: 'trackercourier';
    courier_slug: string;
    courier_name: string;
    tracking_number: string;
    status: string;
    status_message: string;
    result: 'success' | 'failure';
    checkpoints: UnifiedTrackingCheckpoint[];
}

/**
 * Track a shipment via the unified /api/track endpoint.
 * @param awb  tracking number
 * @param courier  optional courier name (our internal format: "Blue Dart", "DTDC", etc.)
 */
export async function trackUnified(
    awb: string,
    courier?: string
): Promise<UnifiedTrackingResult> {
    const params: Record<string, string> = { awb };
    if (courier && courier !== 'Self Shipment') {
        params.courier = courier;
    }

    const response = await axios.get('/api/track', { params });
    const data = response.data;

    return {
        __source: 'trackercourier',
        courier_slug: data.courier_slug,
        courier_name: data.courier_name,
        tracking_number: data.tracking_number,
        status: data.status,
        status_message: data.status_message,
        result: data.result,
        checkpoints: data.checkpoints || [],
    };
}

/**
 * Check if tracking data came from TrackerCourier.io.
 */
export function isTrackerCourierData(data: any): data is UnifiedTrackingResult {
    return data?.__source === 'trackercourier';
}

/**
 * Parse TrackerCourier checkpoints into the standard scan format
 * used by the tracking timeline UI.
 */
export function parseTrackerCourierScans(
    data: UnifiedTrackingResult
): Array<{ date: string; time: string; location: string; activity: string; statusCode?: string }> {
    if (!data?.checkpoints?.length) return [];
    return data.checkpoints
        // Drop carrier "no information present for consignment …" placeholders —
        // these come back when the AWB isn't recognized and would otherwise
        // render as a raw HTML <a> blob in the timeline. Filtering them lets the
        // UI fall through to its clean "No movement scans yet" empty state.
        .filter(cp => !/no information present/i.test(cp.activity || ''))
        .map(cp => ({
            date: cp.date,
            time: cp.time,
            location: cp.location,
            activity: stripHtml(cp.activity),
            statusCode: cp.state,
        }))
        .reverse(); // Most recent first (matching existing parser behavior)
}

/** Strip HTML tags from a checkpoint activity string (carriers sometimes embed <a> links). */
function stripHtml(s: string): string {
    if (!s) return '';
    return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Get the current status string from TC data (for normalizeTrackingStatus).
 */
export function getTrackerCourierStatus(data: UnifiedTrackingResult): string {
    return data.status_message || data.status || 'Unknown';
}
