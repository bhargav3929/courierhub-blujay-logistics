/**
 * Server-side DTDC serviceability lookup against the TAT data DTDC publishes
 * for each origin city (XLSX → JSON in src/data/dtdc-tat/).
 *
 * Used by /api/dtdc/serviceability and the create-order route to give the
 * user fast, accurate feedback before hitting DTDC's live API.
 */

import fs from 'fs';
import path from 'path';

export interface ServiceabilityResult {
    serviceable: boolean;
    /** ISO city name we resolved as the pickup origin. Null if pickup pincode is in an unsupported city. */
    originCity: string | null;
    /** Forward delivery TAT in days (null if not serviceable). */
    tat: number | null;
    /** Return TAT in days. */
    rtoTat: number | null;
    /** COD allowed at the destination. */
    cod: boolean;
    prepaid: boolean;
    forwardPickup: boolean;
    reversePickup: boolean;
    destinationCity: string | null;
    destinationState: string | null;
    zone: string | null;
    category: string | null;
    /** Human-readable reason when not serviceable. */
    reason?: string;
}

interface CompactRow {
    t: number | null;
    r: number | null;
    cd: boolean;
    pp: boolean;
    fp: boolean;
    rp: boolean;
    c: string;
    s: string;
    z: string;
    cat: string;
}

/**
 * Map the first 3 digits of an Indian pincode to one of the origin cities
 * we have TAT data for. Add more entries here as DTDC sends more files.
 *
 * Hyderabad: 500xxx, 501xxx, 502xxx, 503xxx, 504xxx, 505xxx, 506xxx, 507xxx, 508xxx, 509xxx
 * Kolkata:   700xxx, 711xxx, 712xxx, 713xxx (West Bengal first 3 digits)
 */
export function getOriginCityFromPincode(pincode: string): string | null {
    if (!/^\d{6}$/.test(pincode)) return null;
    const prefix2 = pincode.slice(0, 2);
    const prefix3 = pincode.slice(0, 3);

    if (prefix2 === '50') return 'HYDERABAD';      // Telangana / parts of AP
    if (['700', '711', '712', '713', '741', '742', '743'].includes(prefix3)) return 'KOLKATA';

    return null;
}

// In-memory cache so we don't reparse the JSON on every lookup.
const cache: Record<string, Record<string, CompactRow>> = {};

function loadOrigin(city: string): Record<string, CompactRow> | null {
    if (cache[city]) return cache[city];

    const filePath = path.join(process.cwd(), 'src', 'data', 'dtdc-tat', `${city}.json`);
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, CompactRow>;
        cache[city] = parsed;
        return parsed;
    } catch {
        return null;
    }
}

export function lookupServiceability(
    originPincode: string,
    destinationPincode: string
): ServiceabilityResult {
    const empty: ServiceabilityResult = {
        serviceable: false,
        originCity: null,
        tat: null,
        rtoTat: null,
        cod: false,
        prepaid: false,
        forwardPickup: false,
        reversePickup: false,
        destinationCity: null,
        destinationState: null,
        zone: null,
        category: null,
    };

    const originCity = getOriginCityFromPincode(originPincode);
    if (!originCity) {
        return { ...empty, reason: `Pickup pincode ${originPincode} is not in a DTDC-supported origin city.` };
    }

    const table = loadOrigin(originCity);
    if (!table) {
        return { ...empty, originCity, reason: `TAT data for ${originCity} not loaded.` };
    }

    const row = table[destinationPincode];
    if (!row) {
        return {
            ...empty,
            originCity,
            reason: `Destination pincode ${destinationPincode} is not serviceable from ${originCity} via DTDC.`,
        };
    }

    return {
        serviceable: true,
        originCity,
        tat: row.t,
        rtoTat: row.r,
        cod: row.cd,
        prepaid: row.pp,
        forwardPickup: row.fp,
        reversePickup: row.rp,
        destinationCity: row.c,
        destinationState: row.s,
        zone: row.z,
        category: row.cat,
    };
}
