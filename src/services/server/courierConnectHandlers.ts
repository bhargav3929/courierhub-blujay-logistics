/**
 * Server-side courier "connect" test handlers.
 *
 * Each handler is responsible for taking credentials the user pasted into the
 * connect form, calling the courier's auth/ping endpoint, and returning either
 * `{ ok: true, accountIdentifier? }` or `{ ok: false, error }`.
 *
 * STATUS LEGEND:
 *   ✅ validated     — tested end-to-end against the real courier API
 *   🟡 scaffolded    — code is written to the public docs but has NOT been
 *                      validated against a real sandbox account. Flip to ✅
 *                      only after a successful real-account smoke test.
 *
 * BLUE DART:     ✅ validated (uses existing working JWT login flow)
 * DTDC:          ✅ validated (uses existing Shipsy api-key header)
 * DELHIVERY:     ✅ validated 2026-04-28 against production (token-based auth)
 * ECOM EXPRESS:  🟡 scaffolded — needs sandbox validation
 * XPRESSBEES:    🟡 scaffolded — needs sandbox validation
 */

import axios from 'axios';
import type { CourierId } from '@/types/types';

export interface TestResult {
    ok: boolean;
    error?: string;
    accountIdentifier?: string;   // e.g. "CC 302282 (Production)"
    warnings?: string[];
}

export type CourierTestHandler = (creds: Record<string, string>) => Promise<TestResult>;

// ---------- Blue Dart ------------------------------------------------------
//
// Docs: Blue Dart APIGATEWAY SPECIFICATION — Token Generation (GET /token/v1/login).
// Auth header form validated working in the existing platform integration
// (see src/app/api/bluedart/generate-waybill/route.ts).

const testBlueDart: CourierTestHandler = async (creds) => {
    const { licenseKey, loginId, customerCode, environment } = creds;
    if (!licenseKey || !loginId || !customerCode) {
        return { ok: false, error: 'License key, login ID and customer code are all required.' };
    }
    const isProd = environment === 'production';
    // Blue Dart's gateway uses `ClientID` / `clientSecret` header names at the token
    // endpoint. We use loginId as ClientID and licenseKey as clientSecret — this
    // mirrors the working platform-wide flow today.
    const base = isProd
        ? 'https://apigateway.bluedart.com/in/transportation'
        : 'https://apigateway-sandbox.bluedart.com/in/transportation';
    try {
        const resp = await axios.get(`${base}/token/v1/login`, {
            timeout: 15000,
            headers: {
                accept: 'application/json',
                ClientID: loginId,
                clientSecret: licenseKey,
            },
            validateStatus: () => true,
        });
        const token = resp.data?.JWTToken || resp.data?.token;
        if (resp.status >= 400 || !token) {
            return {
                ok: false,
                error: resp.data?.error_description || resp.data?.message || `Blue Dart rejected the credentials (HTTP ${resp.status})`,
            };
        }
        return {
            ok: true,
            accountIdentifier: `CC ${customerCode}${isProd ? ' · Production' : ' · Sandbox'}`,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'Unreachable Blue Dart API' };
    }
};

// ---------- DTDC -----------------------------------------------------------
//
// DTDC Shipsy uses a static `api-key` header. There isn't a dedicated "ping"
// endpoint — the softdata POST is the only thing exposed. We do the cheapest
// possible validation: a GET to the tracking customer endpoint which returns
// 401 when the key is invalid.
//
// If this turns out to be too chatty in production, swap to a "test softdata"
// with a bogus payload and accept 400 (valid key) vs 401/403 (invalid key).

const testDtdc: CourierTestHandler = async (creds) => {
    const { apiKey, customerCode, environment } = creds;
    if (!apiKey || !customerCode) {
        return { ok: false, error: 'API key and customer code are required.' };
    }
    const isProd = environment === 'production';
    const base = isProd ? 'https://dtdcapi.shipsy.io' : 'https://alphademodashboardapi.shipsy.io';
    try {
        // Cheap health check: any authenticated GET that returns 401 on bad key.
        // We intentionally call a minimal endpoint and accept 200/404 as "key accepted".
        const resp = await axios.get(`${base}/api/customer/integration/consignment/trackingDetails?reference_numbers=__dtdc_test__`, {
            timeout: 15000,
            headers: { 'api-key': apiKey },
            validateStatus: () => true,
        });
        if (resp.status === 401 || resp.status === 403) {
            return { ok: false, error: `DTDC rejected the API key (HTTP ${resp.status}).` };
        }
        // Any non-auth error (400, 404, 500) means the key was accepted but the
        // request itself was bad — that's fine for our "auth check".
        return {
            ok: true,
            accountIdentifier: `${customerCode}${isProd ? ' · Production' : ' · Sandbox'}`,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'Unreachable DTDC API' };
    }
};

// ---------- Delhivery (scaffolded, not validated) --------------------------
//
// Docs: https://track.delhivery.com/api/ — PIN-code API returns 200 on valid
// token. Flip STATUS in courierRegistry.ts → 'available' once validated.

const testDelhivery: CourierTestHandler = async (creds) => {
    const { apiToken, environment } = creds;
    if (!apiToken) return { ok: false, error: 'API token is required.' };
    const base = environment === 'production'
        ? 'https://track.delhivery.com'
        : 'https://staging-express.delhivery.com';
    try {
        const resp = await axios.get(`${base}/c/api/pin-codes/json/?filter_codes=110001`, {
            timeout: 15000,
            headers: { Authorization: `Token ${apiToken}` },
            validateStatus: () => true,
        });
        if (resp.status === 401 || resp.status === 403) {
            return { ok: false, error: 'Delhivery rejected the token.' };
        }
        return {
            ok: true,
            accountIdentifier: `${creds.clientName || 'Delhivery'}${environment === 'production' ? ' · Production' : ' · Staging'}`,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'Unreachable Delhivery API' };
    }
};

// ---------- Ecom Express (scaffolded) --------------------------------------
//
// Docs: Ecom Express uses username/password passed as form fields to the
// manifest/awb endpoints. We can't cheaply "auth ping" without creating an
// awb. Minimum test: POST to fetch-awb with a bogus-count and check we get an
// auth-failure vs business-error response.

const testEcomExpress: CourierTestHandler = async (creds) => {
    const { username, password, environment } = creds;
    if (!username || !password) return { ok: false, error: 'Username and password are required.' };
    const base = environment === 'production'
        ? 'https://api.ecomexpress.in'
        : 'https://clbeta.ecomexpress.in';
    try {
        const form = new URLSearchParams();
        form.set('username', username);
        form.set('password', password);
        form.set('count', '1');
        form.set('type', 'PPD');
        const resp = await axios.post(`${base}/apiv2/fetch_awb/`, form.toString(), {
            timeout: 15000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            validateStatus: () => true,
        });
        const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        if (/unauth|invalid username|invalid password/i.test(body)) {
            return { ok: false, error: 'Ecom Express rejected the credentials.' };
        }
        return {
            ok: true,
            accountIdentifier: `${username}${environment === 'production' ? ' · Production' : ' · Staging'}`,
            warnings: ['Ecom Express integration is pending end-to-end verification with a real account.'],
        };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'Unreachable Ecom Express API' };
    }
};

// ---------- Xpressbees (scaffolded) ----------------------------------------
//
// Docs: POST https://shipment.xpressbees.com/api/users/login with
// { email, password } returns a token on success, 401 on failure.

const testXpressbees: CourierTestHandler = async (creds) => {
    const { email, password, environment } = creds;
    if (!email || !password) return { ok: false, error: 'Email and password are required.' };
    const base = environment === 'production'
        ? 'https://shipment.xpressbees.com/api'
        : 'https://shipment.xpressbees.com/api'; // Xpressbees uses same URL; flag on our side
    try {
        const resp = await axios.post(`${base}/users/login`, { email, password }, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' },
            validateStatus: () => true,
        });
        if (resp.status === 401 || resp.status === 403 || resp.data?.status === false) {
            return { ok: false, error: resp.data?.message || 'Xpressbees rejected the credentials.' };
        }
        return {
            ok: true,
            accountIdentifier: `${email}${environment === 'production' ? ' · Production' : ' · Sandbox'}`,
            warnings: ['Xpressbees integration is pending end-to-end verification with a real account.'],
        };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'Unreachable Xpressbees API' };
    }
};

// ---------- Registry -------------------------------------------------------

export const COURIER_TEST_HANDLERS: Record<CourierId, CourierTestHandler> = {
    bluedart: testBlueDart,
    dtdc: testDtdc,
    delhivery: testDelhivery,
    ecom_express: testEcomExpress,
    xpressbees: testXpressbees,
};
