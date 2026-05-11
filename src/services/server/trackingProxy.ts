// Server-side tracking proxy for the chatbot.
//
// Given an AWB, tries each carrier (BlueDart, Delhivery, DTDC) in
// parallel and returns the first one that recognises it. Each carrier's
// existing /api/<carrier>/track-shipment route handles its own auth
// and credential resolution.
//
// Cached for 10 minutes per (carrier, awb) to keep cost down — repeat
// queries for the same AWB during a chat session don't hammer the carrier APIs.

import axios from 'axios';

export type TrackingCarrier = 'bluedart' | 'delhivery' | 'dtdc';

export interface TrackingResult {
    found: true;
    carrier: TrackingCarrier;
    carrierLabel: string;
    awb: string;
    status?: string;
    lastLocation?: string;
    lastActivity?: string;
    lastUpdated?: string;
    eta?: string;
}

export interface TrackingNotFound {
    found: false;
    awb: string;
    triedCarriers: TrackingCarrier[];
}

const cache = new Map<string, { value: TrackingResult; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const PER_CARRIER_TIMEOUT_MS = 6000;

function internalBaseUrl(): string {
    return (
        process.env.INTERNAL_API_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        `http://localhost:${process.env.PORT || 3000}`
    );
}

function cacheKey(carrier: TrackingCarrier, awb: string): string {
    return `${carrier}:${awb}`;
}

async function tryBlueDart(awb: string): Promise<TrackingResult | null> {
    try {
        const res = await axios.get(
            `${internalBaseUrl()}/api/bluedart/track-shipment`,
            { params: { awb }, timeout: PER_CARRIER_TIMEOUT_MS, validateStatus: () => true }
        );
        if (res.status !== 200) return null;
        const data = res.data;
        const ship = data?.ShipmentData?.[0]?.Shipment ?? data?.shipmentData?.[0]?.shipment ?? data?.Shipment;
        if (!ship) return null;
        const status: string | undefined = ship?.Status || ship?.status;
        const scans = ship?.Scans ?? ship?.scans ?? [];
        const lastScan = Array.isArray(scans) && scans.length ? scans[scans.length - 1] : null;
        if (!status && !lastScan) return null;
        return {
            found: true,
            carrier: 'bluedart',
            carrierLabel: 'Blue Dart',
            awb,
            status: status || lastScan?.Scan || lastScan?.scan || 'In Transit',
            lastLocation: lastScan?.ScannedLocation || lastScan?.location,
            lastActivity: lastScan?.Scan || lastScan?.scan,
            lastUpdated: lastScan?.ScanDate || lastScan?.scanDate,
        };
    } catch {
        return null;
    }
}

async function tryDelhivery(awb: string): Promise<TrackingResult | null> {
    try {
        const res = await axios.get(
            `${internalBaseUrl()}/api/delhivery/track-shipment`,
            { params: { waybill: awb }, timeout: PER_CARRIER_TIMEOUT_MS, validateStatus: () => true }
        );
        if (res.status !== 200) return null;
        const data = res.data;
        const ship =
            data?.ShipmentData?.[0]?.Shipment ??
            data?.shipmentData?.[0]?.shipment ??
            data?.Shipment;
        const status: string | undefined =
            ship?.Status?.Status || ship?.status?.Status || ship?.Status?.status;
        if (!status) return null;
        const scans = ship?.Scans ?? [];
        const lastScan = Array.isArray(scans) && scans.length ? scans[0] : null;
        return {
            found: true,
            carrier: 'delhivery',
            carrierLabel: 'Delhivery',
            awb,
            status,
            lastLocation: lastScan?.ScanDetail?.ScannedLocation,
            lastActivity: lastScan?.ScanDetail?.Instructions,
            lastUpdated: lastScan?.ScanDetail?.ScanDateTime,
            eta: ship?.ExpectedDeliveryDate,
        };
    } catch {
        return null;
    }
}

async function tryDTDC(awb: string): Promise<TrackingResult | null> {
    try {
        const res = await axios.get(
            `${internalBaseUrl()}/api/dtdc/track-shipment`,
            { params: { awb }, timeout: PER_CARRIER_TIMEOUT_MS, validateStatus: () => true }
        );
        if (res.status !== 200) return null;
        const data = res.data;
        const trackHeader = data?.trackHeader;
        const status: string | undefined = trackHeader?.strStatus;
        if (!status) return null;
        const details = data?.trackDetails;
        const lastDetail = Array.isArray(details) && details.length ? details[0] : null;
        return {
            found: true,
            carrier: 'dtdc',
            carrierLabel: 'DTDC',
            awb,
            status,
            lastLocation: lastDetail?.strAction || lastDetail?.strLocation,
            lastActivity: lastDetail?.strAction,
            lastUpdated: lastDetail?.strDateOfOperation,
        };
    } catch {
        return null;
    }
}

/** Try all carriers in parallel and return the first hit. */
export async function lookupAwb(
    awb: string
): Promise<TrackingResult | TrackingNotFound> {
    const carriers: TrackingCarrier[] = ['bluedart', 'delhivery', 'dtdc'];

    // Cache check across carriers.
    for (const c of carriers) {
        const hit = cache.get(cacheKey(c, awb));
        if (hit && hit.expiresAt > Date.now()) return hit.value;
    }

    const results = await Promise.allSettled([
        tryBlueDart(awb),
        tryDelhivery(awb),
        tryDTDC(awb),
    ]);

    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
            cache.set(cacheKey(r.value.carrier, awb), {
                value: r.value,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });
            return r.value;
        }
    }

    return { found: false, awb, triedCarriers: carriers };
}
