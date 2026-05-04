// Delhivery Pre-defined Configuration
//
// Server-only env vars (NO NEXT_PUBLIC_ prefix) — the API token must never
// leak to the browser. All Delhivery API calls go through /api/delhivery/* routes.

const IS_PRODUCTION = (process.env.DELHIVERY_ENV || 'production').toLowerCase() === 'production';

export const DELHIVERY_API_CONFIG = {
    baseUrl: IS_PRODUCTION
        ? 'https://track.delhivery.com'
        : 'https://staging-express.delhivery.com',
    isProduction: IS_PRODUCTION,
};

export const DELHIVERY_PREDEFINED = {
    // Required by Delhivery on every order — must match the warehouse you
    // registered with them (case-sensitive). Set this once per deployment.
    pickupLocationName: process.env.DELHIVERY_PICKUP_LOCATION_NAME || '',
    clientName: process.env.DELHIVERY_CLIENT_NAME || '',

    // Pickup address used in pickup_location block when not overridden by client
    pickupAddress: process.env.DELHIVERY_PICKUP_ADDRESS || 'CAPITAL PARK MADHAPUR HYD',
    pickupCity: process.env.DELHIVERY_PICKUP_CITY || 'Hyderabad',
    pickupPincode: process.env.DELHIVERY_PICKUP_PINCODE || '500081',
    pickupState: process.env.DELHIVERY_PICKUP_STATE || 'Telangana',
    pickupCountry: 'India',
    pickupPhone: process.env.DELHIVERY_PICKUP_PHONE || '9876543210',

    // Defaults
    defaultPaymentMode: 'Prepaid' as 'Prepaid' | 'COD' | 'Pickup',
    defaultShippingMode: 'Surface' as 'Surface' | 'Express',
    defaultProductDesc: 'General Merchandise',
    // Note: Delhivery's create-order API only accepts 'Surface' or 'Express'
    // as `shipping_mode`. There is no separate Air or Same-Day tier exposed
    // via the public API — Air is internal routing, not a bookable service.
    defaultHsnCode: '999999',
    defaultWeightGrams: 500,
    defaultDimensionsCm: { length: 10, width: 10, height: 10 },

    // Forbidden characters in payload per Delhivery spec — strip before sending
    forbiddenChars: /[&#%;\\"]/g,
};

// Helper: Delhivery rejects certain characters in name/address fields. Apply to
// every user-supplied string before serializing the order body.
export const sanitizeDelhiveryField = (value: string | undefined | null): string => {
    if (!value) return '';
    return String(value).replace(DELHIVERY_PREDEFINED.forbiddenChars, '').trim();
};

// The two Delhivery services exposed via the public create-order API.
// Both are bookable end-to-end (auth, manifest, label, track, cancel).
export const DELHIVERY_SERVICE_TYPES = {
    Express: {
        code: 'Express',
        displayName: 'Delhivery Express',
        etaDays: '1–3 days',
        description: 'Faster delivery via air-assisted routes',
    },
    Surface: {
        code: 'Surface',
        displayName: 'Delhivery Surface',
        etaDays: '4–7 days',
        description: 'Economical ground delivery',
    },
} as const;

export type DelhiveryServiceType = keyof typeof DELHIVERY_SERVICE_TYPES;
