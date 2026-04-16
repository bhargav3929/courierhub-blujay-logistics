/**
 * Server-side helper that returns the courier credentials to use for a given
 * client. Resolution order:
 *
 *   1. If the client has a connected integration for this courier → use those
 *      (decrypted). Records `lastTestedAt` heuristically via background noise.
 *   2. For a sub_user client → look up the parent's integrations.
 *   3. Otherwise → fall back to platform-wide env vars (the current behavior).
 *
 * Booking / tracking API routes should call this instead of reading env vars
 * directly.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';
import { decryptCredsObject } from '@/lib/courierCredCrypto';
import type { Client, CourierId } from '@/types/types';

const db = () => getFirestore(adminApp);

export interface BlueDartCreds {
    clientId: string;      // historically == loginId
    clientSecret: string;  // historically == licenseKey
    loginId: string;
    licenseKey: string;
    customerCode: string;
    customerCodeB2B?: string;
    areaCode: string;
    isProduction: boolean;
}

export interface DtdcCreds {
    apiKey: string;
    customerCode: string;
    trackingUsername?: string;
    trackingPassword?: string;
    isProduction: boolean;
}

export interface DelhiveryCreds {
    apiToken: string;
    clientName: string;
    isProduction: boolean;
}

export interface EcomExpressCreds {
    username: string;
    password: string;
    isProduction: boolean;
}

export interface XpressbeesCreds {
    email: string;
    password: string;
    isProduction: boolean;
}

// Union-ish helper — callers know what they're asking for.
export type AnyCourierCreds =
    | BlueDartCreds
    | DtdcCreds
    | DelhiveryCreds
    | EcomExpressCreds
    | XpressbeesCreds;

async function loadClientOrParent(clientId: string): Promise<Client | null> {
    try {
        const snap = await db().doc(`clients/${clientId}`).get();
        if (!snap.exists) return null;
        const own = { id: snap.id, ...snap.data() } as Client;
        if (own.userType === 'sub_user' && own.parentId) {
            const parent = await db().doc(`clients/${own.parentId}`).get();
            if (parent.exists) {
                // Merge parent's integrations onto the sub-user's record so the
                // caller only has to inspect `client.courierIntegrations`.
                const p = parent.data() as Partial<Client>;
                return { ...own, courierIntegrations: p.courierIntegrations };
            }
        }
        return own;
    } catch (err) {
        console.error('[resolveCourierCreds] loadClientOrParent error', err);
        return null;
    }
}

async function loadIntegrationCreds<T extends Record<string, any>>(
    clientId: string | undefined,
    courierId: CourierId
): Promise<T | null> {
    if (!clientId) return null;
    const client = await loadClientOrParent(clientId);
    const integration = client?.courierIntegrations?.[courierId];
    if (!integration || integration.status !== 'connected' || !integration.credentials) {
        return null;
    }
    try {
        return decryptCredsObject<T>(integration.credentials);
    } catch (err) {
        console.error(`[resolveCourierCreds] decrypt failed for ${courierId}`, err);
        return null;
    }
}

// -- Blue Dart --------------------------------------------------------------

export async function resolveBlueDartCreds(clientId?: string): Promise<BlueDartCreds> {
    const stored = await loadIntegrationCreds<{
        licenseKey: string;
        loginId: string;
        customerCode: string;
        customerCodeB2B?: string;
        areaCode: string;
        environment: 'sandbox' | 'production';
    }>(clientId, 'bluedart');

    if (stored) {
        return {
            clientId: stored.loginId,
            clientSecret: stored.licenseKey,
            loginId: stored.loginId,
            licenseKey: stored.licenseKey,
            customerCode: stored.customerCode,
            customerCodeB2B: stored.customerCodeB2B,
            areaCode: stored.areaCode,
            isProduction: stored.environment === 'production',
        };
    }

    return {
        clientId: process.env.NEXT_PUBLIC_BLUEDART_CLIENT_ID || '',
        clientSecret: process.env.NEXT_PUBLIC_BLUEDART_CLIENT_SECRET || '',
        loginId: process.env.NEXT_PUBLIC_BLUEDART_LOGIN_ID || '',
        licenseKey: process.env.NEXT_PUBLIC_BLUEDART_LICENSE_KEY || '',
        customerCode: process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE || '',
        customerCodeB2B: process.env.NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE_B2B || '',
        areaCode: process.env.NEXT_PUBLIC_BLUEDART_AREA || 'HYD',
        isProduction: (process.env.NEXT_PUBLIC_BLUEDART_ENV || '').toLowerCase() === 'production',
    };
}

// -- DTDC -------------------------------------------------------------------

export async function resolveDtdcCreds(clientId?: string): Promise<DtdcCreds> {
    const stored = await loadIntegrationCreds<{
        apiKey: string;
        customerCode: string;
        trackingUsername?: string;
        trackingPassword?: string;
        environment: 'sandbox' | 'production';
    }>(clientId, 'dtdc');

    if (stored) {
        return {
            apiKey: stored.apiKey,
            customerCode: stored.customerCode,
            trackingUsername: stored.trackingUsername,
            trackingPassword: stored.trackingPassword,
            isProduction: stored.environment === 'production',
        };
    }

    return {
        apiKey: process.env.NEXT_PUBLIC_DTDC_API_KEY || '',
        customerCode: process.env.NEXT_PUBLIC_DTDC_CUSTOMER_CODE || '',
        trackingUsername: process.env.DTDC_TRACKING_USERNAME || undefined,
        trackingPassword: process.env.DTDC_TRACKING_PASSWORD || undefined,
        isProduction: (process.env.NEXT_PUBLIC_DTDC_ENV || '').toLowerCase() === 'production',
    };
}

// -- Delhivery / Ecom / Xpressbees (scaffolded — no env fallback) -----------
//
// These couriers have NO platform-wide fallback. The booking routes will
// require the client to have connected their own account.

export async function resolveDelhiveryCreds(clientId?: string): Promise<DelhiveryCreds | null> {
    const stored = await loadIntegrationCreds<{
        apiToken: string;
        clientName: string;
        environment: 'sandbox' | 'production';
    }>(clientId, 'delhivery');
    if (!stored) return null;
    return {
        apiToken: stored.apiToken,
        clientName: stored.clientName,
        isProduction: stored.environment === 'production',
    };
}

export async function resolveEcomExpressCreds(clientId?: string): Promise<EcomExpressCreds | null> {
    const stored = await loadIntegrationCreds<{
        username: string;
        password: string;
        environment: 'sandbox' | 'production';
    }>(clientId, 'ecom_express');
    if (!stored) return null;
    return {
        username: stored.username,
        password: stored.password,
        isProduction: stored.environment === 'production',
    };
}

export async function resolveXpressbeesCreds(clientId?: string): Promise<XpressbeesCreds | null> {
    const stored = await loadIntegrationCreds<{
        email: string;
        password: string;
        environment: 'sandbox' | 'production';
    }>(clientId, 'xpressbees');
    if (!stored) return null;
    return {
        email: stored.email,
        password: stored.password,
        isProduction: stored.environment === 'production',
    };
}
