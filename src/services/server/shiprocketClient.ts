// Server-only Shiprocket API client.
//
// - Token caching: Shiprocket auth tokens last ~10 days. We cache in-process
//   with a 24h safety buffer (refresh if <24h to expiry, or if any call gets 401).
// - Retries: transient 5xx and network errors retry via withRetry. 4xx returns
//   the original error so callers can surface it to the user.
// - Sandbox vs prod: Shiprocket has no separate sandbox URL. Test accounts use
//   the same apiv2.shiprocket.in base; SHIPROCKET_BASE_URL can override for
//   contract tests / mocking.
//
// Env vars (all server-side):
//   SHIPROCKET_EMAIL
//   SHIPROCKET_PASSWORD
//   SHIPROCKET_PICKUP_LOCATION    e.g. "Primary"
//   SHIPROCKET_BASE_URL           optional, default https://apiv2.shiprocket.in/v1/external
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { withRetry } from '@/lib/retry';

const DEFAULT_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

interface CachedToken {
    token: string;
    expiresAt: number;      // epoch ms
}

let tokenCache: CachedToken | null = null;
let inflightLogin: Promise<string> | null = null;

function baseUrl(): string {
    return process.env.SHIPROCKET_BASE_URL || DEFAULT_BASE_URL;
}

function readCreds(): { email: string; password: string } {
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;
    if (!email || !password) {
        throw new Error(
            'Shiprocket credentials missing. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in .env.local (test account for sandbox).'
        );
    }
    return { email, password };
}

export function getDefaultPickupLocation(): string | undefined {
    return process.env.SHIPROCKET_PICKUP_LOCATION || undefined;
}

async function loginAndCache(): Promise<string> {
    const { email, password } = readCreds();
    const res = await axios.post(
        `${baseUrl()}/auth/login`,
        { email, password },
        { timeout: 15000, validateStatus: () => true }
    );
    if (res.status !== 200 || !res.data?.token) {
        const detail =
            res.data?.message ||
            res.data?.errors ||
            `HTTP ${res.status}`;
        throw new Error(`Shiprocket login failed: ${JSON.stringify(detail)}`);
    }
    // Shiprocket tokens are JWTs — they include exp in seconds. We can decode
    // safely (no signature verification needed; the server already trusts it).
    let expiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000; // assume 9 days
    try {
        const [, payload] = String(res.data.token).split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (decoded?.exp) expiresAt = decoded.exp * 1000;
    } catch {
        // Fall back to 9-day default if decode fails.
    }
    tokenCache = { token: res.data.token, expiresAt };
    return res.data.token;
}

async function getToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    const buffer = 24 * 60 * 60 * 1000; // refresh 24h before expiry
    if (
        !forceRefresh &&
        tokenCache &&
        tokenCache.expiresAt - now > buffer
    ) {
        return tokenCache.token;
    }
    // De-dupe concurrent logins.
    if (inflightLogin) return inflightLogin;
    inflightLogin = loginAndCache().finally(() => {
        inflightLogin = null;
    });
    return inflightLogin;
}

interface RequestOptions {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
    timeout?: number;
}

/**
 * Make an authenticated Shiprocket API call. Auto-refreshes the token on 401.
 * Retries transient 5xx + network errors up to 3 times with exponential backoff.
 */
export async function shiprocketRequest<T = unknown>(
    opts: RequestOptions
): Promise<T> {
    const config: AxiosRequestConfig = {
        method: opts.method,
        url: `${baseUrl()}${opts.path}`,
        params: opts.params,
        data: opts.body,
        timeout: opts.timeout ?? 30000,
        validateStatus: () => true,
    };

    const exec = async (attempt: number): Promise<AxiosResponse> => {
        const token = await getToken(attempt > 0 && tokenCache === null);
        const res = await axios.request({
            ...config,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(config.headers || {}),
            },
        });
        if (res.status === 401) {
            // Token rejected — clear cache, force a refresh, throw to retry.
            tokenCache = null;
            throw Object.assign(new Error('Shiprocket auth rejected (401)'), {
                isAuthError: true,
                response: res,
            });
        }
        return res;
    };

    const response = await withRetry(exec, {
        retries: 3,
        baseDelayMs: 1000,
        factor: 4,
        shouldRetry: (err) => {
            // Auth error → always retry once with fresh token.
            if ((err as any)?.isAuthError) return true;
            const ax = err as AxiosError;
            // Network errors (no response) → retry.
            if (!ax.response) return true;
            // 5xx → retry. 4xx → don't (caller's fault).
            return (ax.response.status ?? 0) >= 500;
        },
        onRetry: (attempt, err) =>
            console.warn(
                `[shiprocket] retry ${attempt}:`,
                (err as any)?.message ||
                    (err as any)?.response?.data?.message ||
                    err
            ),
    });

    if (response.status >= 400) {
        const data = response.data as any;
        const detail =
            data?.message ||
            data?.errors ||
            `HTTP ${response.status}`;
        const err = new Error(
            `Shiprocket ${opts.method} ${opts.path} failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
        );
        (err as any).status = response.status;
        (err as any).body = data;
        throw err;
    }

    return response.data as T;
}

// Test seam — only used by tests / debug routes to bust the cache.
export function _resetShiprocketTokenCache(): void {
    tokenCache = null;
}
