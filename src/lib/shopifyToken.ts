/**
 * Shopify offline-token lifecycle (expiring tokens + refresh + migration).
 *
 * Shopify deprecated permanent/non-expiring offline access tokens for public
 * apps (enforced for new apps from 2026-04-01, all apps from 2027-01-01).
 * The Admin API now returns 403 "Non-expiring access tokens are no longer
 * accepted" for legacy tokens. Offline tokens now:
 *   - expire (`access_token` ~1h) and ship with a `refresh_token` (~90d),
 *   - are obtained by adding `expiring: 1` to the authorization-code exchange,
 *   - are renewed via a `grant_type=refresh_token` call (refresh token is
 *     single-use — always persist the NEW one from each response).
 *
 * A legacy non-expiring token can be upgraded server-side WITHOUT the merchant
 * reinstalling, via token exchange (offline → expiring offline).
 *
 * Docs:
 *  - https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
 *  - https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */

import { encryptTokenWithSecret, decryptTokenWithSecret } from './shopifyTokenCrypto';

export type ShopifyAppId = 'public' | 'looms' | 'gayatri' | 'app2' | 'app3' | 'default';

interface AppCreds {
    apiKey: string;
    apiSecret: string;
}

/** Resolve the {apiKey, apiSecret} env pair for a given appId. */
export function getShopifyAppCreds(appId?: string): AppCreds {
    const e = process.env;
    switch (appId) {
        case 'public':
            return { apiKey: (e.SHOPIFY_PUBLIC_API_KEY || '').trim(), apiSecret: (e.SHOPIFY_PUBLIC_API_SECRET || '').trim() };
        case 'looms':
            return { apiKey: (e.SHOPIFY_LOOMS_API_KEY || '').trim(), apiSecret: (e.SHOPIFY_LOOMS_API_SECRET || '').trim() };
        case 'gayatri':
            return { apiKey: (e.SHOPIFY_GAYATRI_API_KEY || '').trim(), apiSecret: (e.SHOPIFY_GAYATRI_API_SECRET || '').trim() };
        case 'app2':
            return { apiKey: (e.SHOPIFY2_API_KEY || '').trim(), apiSecret: (e.SHOPIFY2_API_SECRET || '').trim() };
        case 'app3':
            return { apiKey: (e.SHOPIFY3_API_KEY || '').trim(), apiSecret: (e.SHOPIFY3_API_SECRET || '').trim() };
        default:
            return { apiKey: (e.SHOPIFY_API_KEY || '').trim(), apiSecret: (e.SHOPIFY_API_SECRET || '').trim() };
    }
}

export function encryptForApp(plain: string, appId?: string): string {
    return encryptTokenWithSecret(plain, getShopifyAppCreds(appId).apiSecret);
}
export function decryptForApp(enc: string, appId?: string): string {
    return decryptTokenWithSecret(enc, getShopifyAppCreds(appId).apiSecret);
}

export interface TokenBundle {
    accessToken: string;            // plaintext
    refreshToken?: string;          // plaintext
    scope?: string;
    accessTokenExpiresAt?: number;  // epoch ms
    refreshTokenExpiresAt?: number; // epoch ms
}

function bundleFromResponse(d: any): TokenBundle {
    const now = Date.now();
    return {
        accessToken: d.access_token,
        refreshToken: d.refresh_token,
        scope: d.scope,
        accessTokenExpiresAt: d.expires_in ? now + d.expires_in * 1000 : undefined,
        refreshTokenExpiresAt: d.refresh_token_expires_in ? now + d.refresh_token_expires_in * 1000 : undefined,
    };
}

/**
 * Authorization-code grant → EXPIRING offline token (adds `expiring: 1`).
 * Use this in every OAuth callback in place of the old code exchange.
 */
export async function exchangeCodeForToken(shop: string, code: string, appId?: string): Promise<TokenBundle> {
    const { apiKey, apiSecret } = getShopifyAppCreds(appId);
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code, expiring: 1 }),
    });
    if (!res.ok) {
        throw new Error(`Shopify token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    return bundleFromResponse(await res.json());
}

/** Renew an expiring offline token. The returned refresh_token is single-use — persist it. */
export async function refreshOfflineToken(shop: string, refreshToken: string, appId?: string): Promise<TokenBundle> {
    const { apiKey, apiSecret } = getShopifyAppCreds(appId);
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: apiKey,
            client_secret: apiSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    });
    if (!res.ok) {
        throw new Error(`Shopify token refresh failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    return bundleFromResponse(await res.json());
}

/**
 * Migrate a LEGACY non-expiring offline token to an expiring one via token
 * exchange — no merchant reinstall needed. The old token is revoked on success.
 */
export async function migrateNonExpiringToken(shop: string, oldOfflineToken: string, appId?: string): Promise<TokenBundle> {
    const { apiKey, apiSecret } = getShopifyAppCreds(appId);
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: apiKey,
            client_secret: apiSecret,
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token: oldOfflineToken,
            subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
            requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
            expiring: 1,
        }),
    });
    if (!res.ok) {
        throw new Error(`Shopify token migration failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    return bundleFromResponse(await res.json());
}

/** The encrypted token fields stored on `users/{uid}.shopifyConfig`. */
export interface StoredShopifyTokenState {
    shopUrl: string;
    appId?: string;
    accessToken: string;             // encrypted
    refreshToken?: string;           // encrypted
    accessTokenExpiresAt?: number;
    refreshTokenExpiresAt?: number;
}

/** Build the Firestore field-update map for a freshly obtained bundle. */
export function tokenBundleToConfigUpdate(bundle: TokenBundle, appId?: string): Record<string, any> {
    const update: Record<string, any> = {
        'shopifyConfig.accessToken': encryptForApp(bundle.accessToken, appId),
        'shopifyConfig.updatedAt': new Date().toISOString(),
    };
    if (bundle.accessTokenExpiresAt) update['shopifyConfig.accessTokenExpiresAt'] = bundle.accessTokenExpiresAt;
    if (bundle.refreshToken) update['shopifyConfig.refreshToken'] = encryptForApp(bundle.refreshToken, appId);
    if (bundle.refreshTokenExpiresAt) update['shopifyConfig.refreshTokenExpiresAt'] = bundle.refreshTokenExpiresAt;
    return update;
}

/**
 * Return a VALID, decrypted Admin-API access token for a stored config,
 * refreshing or migrating as needed and persisting any new token via `persist`.
 *
 * - Expiring token, not expired  → decrypt and return as-is.
 * - Expiring token, expired      → refresh, persist, return new.
 * - Legacy non-expiring token    → migrate via token exchange, persist, return new.
 *   (If migration fails, fall back to the legacy token so a transient error
 *    doesn't hard-break a store that Shopify hasn't enforced on yet.)
 *
 * @param cfg     stored shopifyConfig (token fields).
 * @param persist async fn applying a `{ 'shopifyConfig.x': ... }` field map to the doc.
 */
export async function getValidAccessToken(
    cfg: StoredShopifyTokenState,
    persist: (update: Record<string, any>) => Promise<void>,
): Promise<string> {
    const appId = cfg.appId || 'default';
    const SKEW_MS = 2 * 60 * 1000; // refresh 2 min early

    // Case 1: legacy non-expiring token (no refresh token, no expiry recorded) → migrate.
    if (!cfg.refreshToken && !cfg.accessTokenExpiresAt) {
        const legacy = decryptForApp(cfg.accessToken, appId);
        try {
            const bundle = await migrateNonExpiringToken(cfg.shopUrl, legacy, appId);
            await persist(tokenBundleToConfigUpdate(bundle, appId));
            return bundle.accessToken;
        } catch (e) {
            console.error('[shopifyToken] Legacy token migration failed, using existing token:', (e as Error).message);
            return legacy;
        }
    }

    // Case 2: expiring token still valid.
    if (cfg.accessTokenExpiresAt && Date.now() < cfg.accessTokenExpiresAt - SKEW_MS) {
        return decryptForApp(cfg.accessToken, appId);
    }

    // Case 3: expired (or unknown expiry) but we have a refresh token → refresh.
    if (cfg.refreshToken) {
        const refresh = decryptForApp(cfg.refreshToken, appId);
        const bundle = await refreshOfflineToken(cfg.shopUrl, refresh, appId);
        await persist(tokenBundleToConfigUpdate(bundle, appId));
        return bundle.accessToken;
    }

    // Fallback: return whatever we have.
    return decryptForApp(cfg.accessToken, appId);
}
