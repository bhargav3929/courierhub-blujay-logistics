/**
 * Courier error humanizer.
 *
 * Carrier APIs (Blue Dart, DTDC, Delhivery) return terse, cryptic error
 * strings ("Auto allocated hub not found", "UnauthorizedUser", "An internal
 * Error has occurred"). This module translates them into a short title + a
 * plain-language, actionable description a non-technical operator can act on.
 *
 * Add a new rule by appending to RULES. The first rule whose `match` tests
 * true (optionally scoped to a courier) wins. If nothing matches, a generic
 * per-courier fallback is returned with the raw detail cleaned up.
 */

export type CourierName = 'Blue Dart' | 'DTDC' | 'Delhivery' | 'Self Shipment' | string;

export interface FriendlyError {
    /** Short headline for the toast (what went wrong, in human terms). */
    title: string;
    /** One or two sentences: what it means and how to fix it. */
    description: string;
}

interface Rule {
    /** Substring (case-insensitive) or RegExp tested against the raw error text. */
    match: string | RegExp;
    /** Restrict this rule to a specific courier; omit to apply to any. */
    courier?: CourierName;
    title: string;
    description: string;
}

const matches = (raw: string, m: string | RegExp): boolean =>
    typeof m === 'string' ? raw.toLowerCase().includes(m.toLowerCase()) : m.test(raw);

/**
 * Ordered list of known carrier failure signatures. Most specific first.
 */
const RULES: Rule[] = [
    // ─────────────────────────── DTDC ───────────────────────────
    {
        courier: 'DTDC',
        match: 'auto allocated hub not found',
        title: 'Pickup pincode not registered with DTDC',
        description:
            'Your pickup pincode is not set up as a pickup location on your DTDC account, so DTDC could not find a hub for it. Use your DTDC-registered pickup pincode (e.g. 500028), or ask DTDC support to enable this origin.',
    },
    {
        courier: 'DTDC',
        match: 'pincode is not serviceable',
        title: 'Pincode not serviceable by DTDC',
        description:
            'One of the pincodes on this shipment is not serviceable by DTDC (or is not a valid Indian pincode). Double-check both the pickup and delivery pincodes — e.g. New Delhi is 110001, not 100018.',
    },
    {
        courier: 'DTDC',
        match: /service.?type|not.*activated|not.*allowed.*service/i,
        title: 'DTDC service not available on this contract',
        description:
            'The selected DTDC service tier is not activated on your contract for this route. Use DTDC Smart Express, or contact DTDC support to activate other tiers.',
    },

    // ───────────────────────── Blue Dart ─────────────────────────
    {
        courier: 'Blue Dart',
        match: 'not authorized to register pickup',
        title: 'Blue Dart customer code not authorized for this area',
        description:
            'The Blue Dart customer code is not enabled for pickup in this area. Confirm the customer code is correct (no extra spaces), or ask Blue Dart to authorize this code for the pickup area.',
    },
    {
        courier: 'Blue Dart',
        match: /unauthorizeduser/i,
        title: 'Blue Dart rejected the account credentials',
        description:
            'Blue Dart did not authorize this booking with the current account details. Verify the LoginID, licence key, and customer code on the Blue Dart integration are correct and active.',
    },
    {
        courier: 'Blue Dart',
        match: 'waybill already',
        title: 'This order is already booked with Blue Dart',
        description:
            'Blue Dart already generated a waybill for this order. Refresh and check the Shipments page — the existing AWB should be attached. Do not re-book; it would create a duplicate pickup.',
    },
    {
        courier: 'Blue Dart',
        match: /pincode|servic(e|able)/i,
        title: 'Blue Dart pincode issue',
        description:
            'Blue Dart could not service one of the pincodes on this shipment. Check that both the pickup and delivery pincodes are valid and serviceable.',
    },

    // ───────────────────────── Delhivery ─────────────────────────
    {
        courier: 'Delhivery',
        match: /pickup.?location|clientwarehouse|warehouse.*not.*found/i,
        title: 'Delhivery pickup warehouse not recognized',
        description:
            'The pickup location name does not exactly match a warehouse registered with Delhivery. The name must match Delhivery’s records character-for-character — check the registered warehouse name and update the pickup configuration.',
    },
    {
        courier: 'Delhivery',
        match: /not serviceable|non.?serviceable|pin.*not/i,
        title: 'Pincode not serviceable by Delhivery',
        description:
            'Delhivery does not service one of the pincodes on this shipment. Verify both the pickup and delivery pincodes are valid and within Delhivery’s network.',
    },
    {
        courier: 'Delhivery',
        match: 'internal error has occurred',
        title: 'Delhivery rejected the pickup location',
        description:
            'This generic Delhivery error almost always means the pickup location name does not match a warehouse registered on their side. Confirm the registered warehouse name and try again.',
    },

    // ─────────────────────── Cross-carrier ───────────────────────
    {
        match: /phone|mobile.*(invalid|digit)/i,
        title: 'Invalid phone number',
        description:
            'A phone number on this shipment is invalid. Both the sender and receiver numbers must be 10–15 digits with no spaces or symbols.',
    },
    {
        match: /timeout|ETIMEDOUT|ECONNREFUSED|network|socket hang/i,
        title: 'Could not reach the courier',
        description:
            'The courier’s servers did not respond in time. This is usually temporary — wait a moment and try booking again.',
    },
];

/** Strip our own "X Booking Failed:" prefixes and JSON noise for a clean fallback. */
function cleanRaw(raw: string): string {
    let s = raw
        .replace(/^[A-Za-z ]+Booking Failed:\s*/i, '')
        .replace(/^[A-Za-z ]+Error:\s*/i, '')
        .trim();
    // If it looks like JSON, try to surface a human field rather than dump braces.
    const info = s.match(/"StatusInformation"\s*:\s*"([^"]+)"/i)
        || s.match(/"message"\s*:\s*"([^"]+)"/i)
        || s.match(/"error"\s*:\s*"([^"]+)"/i);
    if (info?.[1]) return info[1];
    // Otherwise drop obvious JSON wrappers.
    if (s.startsWith('{') || s.startsWith('[')) {
        return 'The courier rejected this booking. Please review the address and package details, then try again.';
    }
    return s;
}

/**
 * Translate a raw courier error into a friendly title + description.
 *
 * @param courier  The courier the booking was attempted with.
 * @param rawError The thrown error message (may include our prefixes / JSON).
 */
export function humanizeCourierError(courier: CourierName, rawError: string): FriendlyError {
    const raw = (rawError || '').toString();

    for (const rule of RULES) {
        if (rule.courier && rule.courier !== courier) continue;
        if (matches(raw, rule.match)) {
            return { title: rule.title, description: rule.description };
        }
    }

    const cleaned = cleanRaw(raw);
    return {
        title: `${courier} booking failed`,
        description:
            cleaned ||
            'The booking could not be completed. Please check the pickup and delivery details and try again.',
    };
}
