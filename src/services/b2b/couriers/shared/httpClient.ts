// Thin axios wrapper that:
//   - enforces a per-operation timeout budget
//   - converts axios errors into CarrierError with classification
//   - logs every request/response with the request-id propagated from
//     the calling context
//   - threads through the circuit breaker + retry layer
//
// Every CourierAdapter calls `carrierRequest(...)` rather than touching
// axios directly. The result: a single chokepoint for timeout/retry/
// circuit/logging policy — change it here, every carrier feels it.

import axios, { type AxiosRequestConfig, type AxiosError } from 'axios';
import { withRetry } from '@/lib/retry';
import type { CourierCode } from '@/types/b2b/shipment';
import { getLogger } from '@/services/b2b/http/logger';
import {
    CarrierError,
    classifyHttpStatus,
    shouldRetryCarrierError,
    type CarrierErrorCategory,
} from './carrierErrors';
import { DEFAULT_BREAKER, type CircuitBreaker } from './circuitBreaker';

// Per-operation timeout budgets in ms. Tight enough that one bad call
// doesn't tie up a worker; loose enough that a slow-but-healthy carrier
// API gets a fair shot.
export const TIMEOUT_BUDGET = {
    quote: 10_000,
    book: 15_000,
    cancel: 10_000,
    generateLabel: 30_000,
    pollStatus: 8_000,
    lookupByReference: 6_000,
} as const;
export type CarrierOperation = keyof typeof TIMEOUT_BUDGET;

const log = getLogger('b2b.couriers.http');

export interface CarrierRequestInput {
    readonly courier: CourierCode;
    readonly operation: CarrierOperation;
    readonly config: AxiosRequestConfig;
    readonly requestId?: string;
    readonly retries?: number;      // overrides default
    readonly breaker?: CircuitBreaker;
}

export interface CarrierRequestOutput<T> {
    readonly status: number;
    readonly data: T;
    readonly headers: Record<string, string>;
}

// One call into a carrier API. Wraps circuit-breaker, retry, timeout,
// logging, and CarrierError normalization. The carrier-specific adapter
// passes a fully-formed AxiosRequestConfig (URL, method, body, auth
// headers) — this function does not know anything about the carrier.

export async function carrierRequest<T = unknown>(
    input: CarrierRequestInput,
): Promise<CarrierRequestOutput<T>> {
    const { courier, operation, requestId } = input;
    const breaker = input.breaker ?? DEFAULT_BREAKER;
    const breakerKey = `${courier}::${operation}`;
    const timeoutMs = TIMEOUT_BUDGET[operation];

    const config: AxiosRequestConfig = {
        timeout: timeoutMs,
        validateStatus: () => true,    // we classify by status ourselves
        ...input.config,
    };

    return breaker.exec(breakerKey, () =>
        withRetry(
            async (attempt) => {
                const startMs = Date.now();
                try {
                    const res = await axios.request<T>(config);
                    const durationMs = Date.now() - startMs;

                    if (res.status >= 200 && res.status < 300) {
                        log.debug('carrier call ok', {
                            requestId, courier, operation,
                            httpStatus: res.status, durationMs, attempt,
                        });
                        return {
                            status: res.status,
                            data: res.data as T,
                            headers: normalizeHeaders(res.headers),
                        };
                    }
                    throw fromHttpError({
                        courier,
                        operation,
                        httpStatus: res.status,
                        rawCode: pickString(res.data, 'code'),
                        rawMessage: pickString(res.data, 'message') ?? pickString(res.data, 'error'),
                    });
                } catch (err) {
                    const durationMs = Date.now() - startMs;
                    if (err instanceof CarrierError) {
                        log.warn('carrier call failed', {
                            requestId, courier, operation,
                            category: err.category,
                            httpStatus: err.httpStatus,
                            rawCode: err.rawCode,
                            durationMs, attempt,
                        });
                        throw err;
                    }
                    // Axios timeout / network / DNS failure.
                    const axiosErr = err as AxiosError;
                    const category: CarrierErrorCategory =
                        axiosErr.code === 'ECONNABORTED' ? 'transient'
                        : axiosErr.code === 'ENOTFOUND' ? 'transient'
                        : axiosErr.code === 'ECONNREFUSED' ? 'transient'
                        : 'unknown';
                    log.warn('carrier call threw', {
                        requestId, courier, operation,
                        errorCode: axiosErr.code,
                        durationMs, attempt,
                    });
                    throw new CarrierError({
                        courier, operation, category,
                        rawMessage: axiosErr.message,
                    });
                }
            },
            {
                retries: input.retries ?? 3,
                baseDelayMs: 500,
                maxDelayMs: 5_000,
                factor: 2,
                shouldRetry: shouldRetryCarrierError,
            },
        ),
    );
}

function fromHttpError(opts: {
    courier: CourierCode;
    operation: CarrierOperation;
    httpStatus: number;
    rawCode: string | undefined;
    rawMessage: string | undefined;
}): CarrierError {
    return new CarrierError({
        courier: opts.courier,
        operation: opts.operation,
        category: classifyHttpStatus(opts.httpStatus),
        httpStatus: opts.httpStatus,
        rawCode: opts.rawCode,
        rawMessage: opts.rawMessage,
    });
}

function pickString(data: unknown, key: string): string | undefined {
    if (data && typeof data === 'object' && key in data) {
        const v = (data as Record<string, unknown>)[key];
        if (typeof v === 'string') return v;
    }
    return undefined;
}

function normalizeHeaders(h: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!h || typeof h !== 'object') return out;
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
        if (typeof v === 'string') out[k.toLowerCase()] = v;
    }
    return out;
}
