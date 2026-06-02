/**
 * TrackerCourier.io integration — universal tracking via a single API key.
 *
 * Supports 171+ couriers including Blue Dart, DTDC, Delhivery, and all major
 * Indian logistics providers.  No per-client carrier credentials required.
 *
 * API docs: https://api.trackcourier.io/docs
 *
 * Actual response format (verified live 2026-05-27):
 *   data.Checkpoints[]  — PascalCase: Activity, CheckpointState, CourierName, Date, Location, Time
 *   data.ShipmentState   — "pending" | "intransit" | "outfordelivery" | "delivered" | "exception"
 *   data.MostRecentStatus — human-readable status string
 *   data.Result           — "success" | "failure"
 */

import axios from 'axios';

// ---------------------------------------------------------------------------
// Types — matched to actual API response (PascalCase fields)
// ---------------------------------------------------------------------------

export interface TCCheckpoint {
    Activity: string;
    CheckpointState: string;
    CourierName: string;
    Date: string;
    Location: string;
    Time: string;
}

export interface TCTrackingData {
    Checkpoints: TCCheckpoint[];
    ShipmentState: string;
    MostRecentStatus: string;
    Result: 'success' | 'failure';
    AdditionalInfo: string;
    PODImageUrl: string;
    FetchTime: string;
    ExecutionTime: string;
    isEmptyTable: boolean;
}

export interface TCUsage {
    used: number;
    quota: number;
    plan: string;
    percent: number;
}

export interface TCTrackResponse {
    success: boolean;
    data: TCTrackingData;
    usage: TCUsage;
}

export interface TCCourier {
    slug: string;
    name: string;
}

// Normalized type for consumers of this service
export interface NormalizedTracking {
    courier_slug: string;
    courier_name: string;
    tracking_number: string;
    status: string;
    status_message: string;
    result: 'success' | 'failure';
    checkpoints: Array<{
        date: string;
        time: string;
        location: string;
        activity: string;
        state: string;
    }>;
    raw: TCTrackingData;
}

// ---------------------------------------------------------------------------
// Slug mapping — our internal courier names → TrackerCourier slugs
// ---------------------------------------------------------------------------

const COURIER_SLUG_MAP: Record<string, string> = {
    'bluedart': 'bluedart',
    'Blue Dart': 'bluedart',
    'blue dart': 'bluedart',
    'dtdc': 'dtdc',
    'DTDC': 'dtdc',
    'delhivery': 'delhivery',
    'Delhivery': 'delhivery',
    'ecom_express': 'ecomexpress',
    'Ecom Express': 'ecomexpress',
    'xpressbees': 'xpressbees',
    'Xpressbees': 'xpressbees',
    'indiapost': 'indiapost',
    'India Post': 'indiapost',
    'ekart': 'ekart',
    'Ekart': 'ekart',
};

export function resolveSlug(courier: string): string | null {
    return COURIER_SLUG_MAP[courier] ?? COURIER_SLUG_MAP[courier.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Cache — 10-minute TTL per (slug, trackingNumber) to stay within free quota
// ---------------------------------------------------------------------------

interface CacheEntry {
    data: NormalizedTracking;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function cacheKey(slug: string, trackingNumber: string): string {
    return `tc:${slug}:${trackingNumber}`;
}

function getCached(slug: string, trackingNumber: string): NormalizedTracking | null {
    const entry = cache.get(cacheKey(slug, trackingNumber));
    if (entry && entry.expiresAt > Date.now()) return entry.data;
    return null;
}

function setCache(slug: string, trackingNumber: string, data: NormalizedTracking): void {
    cache.set(cacheKey(slug, trackingNumber), {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

function normalize(
    slug: string,
    trackingNumber: string,
    raw: TCTrackingData
): NormalizedTracking {
    const courierName = raw.Checkpoints?.[0]?.CourierName || slug;
    return {
        courier_slug: slug,
        courier_name: courierName,
        tracking_number: trackingNumber,
        status: raw.ShipmentState || 'unknown',
        status_message: raw.MostRecentStatus || '',
        result: raw.Result,
        checkpoints: (raw.Checkpoints || []).map(cp => ({
            date: cp.Date,
            time: cp.Time,
            location: cp.Location,
            activity: cp.Activity,
            state: cp.CheckpointState,
        })),
        raw,
    };
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.trackcourier.io/v1';
const TIMEOUT_MS = 12_000;

function getApiKey(): string {
    const key = process.env.TRACKERCOURIER_API_KEY;
    if (!key) throw new Error('TRACKERCOURIER_API_KEY env var is not configured');
    return key;
}

/**
 * Track a shipment via TrackerCourier.io.
 *
 * @param courierSlug  TC slug (e.g. 'bluedart', 'dtdc') — use `resolveSlug()` to convert from internal names
 * @param trackingNumber  AWB / consignment number
 * @returns Normalized tracking data or null if not found / API error
 */
export async function trackShipment(
    courierSlug: string,
    trackingNumber: string
): Promise<NormalizedTracking | null> {
    const cached = getCached(courierSlug, trackingNumber);
    if (cached) {
        console.log(`[TrackerCourier] Cache hit for ${courierSlug}:${trackingNumber}`);
        return cached;
    }

    try {
        const res = await axios.get<TCTrackResponse>(`${BASE_URL}/track`, {
            params: { courier: courierSlug, tracking_number: trackingNumber },
            headers: { 'X-API-Key': getApiKey() },
            timeout: TIMEOUT_MS,
        });

        if (res.data.success && res.data.data) {
            const normalized = normalize(courierSlug, trackingNumber, res.data.data);
            setCache(courierSlug, trackingNumber, normalized);

            const usage = res.data.usage;
            const remaining = usage.quota - usage.used;
            console.log(
                `[TrackerCourier] ${courierSlug}:${trackingNumber} → ${normalized.status} ` +
                `(quota: ${remaining}/${usage.quota})`
            );
            return normalized;
        }

        return null;
    } catch (err: any) {
        const status = err.response?.status;
        const code = err.response?.data?.error?.code;

        if (status === 404 && code === 'TRACKING_NOT_FOUND') {
            console.log(`[TrackerCourier] ${courierSlug}:${trackingNumber} — not found`);
            return null;
        }
        if (status === 402) {
            console.error('[TrackerCourier] Quota exceeded — upgrade plan or wait for next month');
            return null;
        }
        if (status === 401) {
            console.error('[TrackerCourier] Invalid API key');
            return null;
        }

        console.error(
            `[TrackerCourier] Error tracking ${courierSlug}:${trackingNumber}:`,
            err.response?.data || err.message
        );
        return null;
    }
}

/**
 * Track a shipment using our internal courier name (e.g. "Blue Dart", "DTDC").
 * Resolves the slug automatically.
 */
export async function trackByInternalCourier(
    courier: string,
    trackingNumber: string
): Promise<NormalizedTracking | null> {
    const slug = resolveSlug(courier);
    if (!slug) {
        console.warn(`[TrackerCourier] No slug mapping for courier "${courier}"`);
        return null;
    }
    return trackShipment(slug, trackingNumber);
}

/**
 * Try the supported Indian carriers for a given tracking number and return the
 * one that actually has the shipment (Result === 'success').
 *
 * This runs SEQUENTIALLY, not in parallel, and short-circuits on the first
 * real hit. Firing all carriers concurrently caused two problems: (1) TC's
 * rate limit would drop one of the bursted calls, so a genuine success (e.g.
 * a delivered Blue Dart AWB with 9 scans) could be lost and a "no information"
 * stub from the wrong carrier returned instead; (2) every lookup burned 3x
 * quota even when the first carrier already matched. Sequential + early-return
 * is deterministic and quota-friendly (a real hit costs a single call).
 */
export async function trackAutoDetect(
    trackingNumber: string
): Promise<NormalizedTracking | null> {
    const primarySlugs = ['bluedart', 'dtdc', 'delhivery'];

    // Fast path — a cached success for any carrier wins outright.
    for (const slug of primarySlugs) {
        const cached = getCached(slug, trackingNumber);
        if (cached && cached.result === 'success') return cached;
    }

    // Try each carrier in turn. Return immediately on a real success; otherwise
    // remember the first non-null "failure"/pending result as a last resort so
    // the caller still gets *something* when no carrier recognizes the AWB.
    let firstNonSuccess: NormalizedTracking | null = null;
    for (const slug of primarySlugs) {
        const result = await trackShipment(slug, trackingNumber);
        if (result && result.result === 'success') {
            return result;
        }
        if (result && !firstNonSuccess) {
            firstNonSuccess = result;
        }
    }

    return firstNonSuccess;
}

/**
 * List all available couriers from TrackerCourier.io.
 * This endpoint does NOT count against the quota.
 */
export async function listCouriers(): Promise<TCCourier[]> {
    try {
        const res = await axios.get<{ success: boolean; data: { couriers: TCCourier[] } }>(
            `${BASE_URL}/couriers`,
            {
                headers: { 'X-API-Key': getApiKey() },
                timeout: TIMEOUT_MS,
            }
        );
        return res.data.success ? res.data.data.couriers : [];
    } catch (err: any) {
        console.error('[TrackerCourier] Failed to list couriers:', err.message);
        return [];
    }
}
