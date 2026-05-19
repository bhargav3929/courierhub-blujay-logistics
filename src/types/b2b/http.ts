// Wire shape for every B2B API response.
//
// Partners write `if (resp.error) ... else use resp.data`. The `error.code`
// is a stable, machine-readable string from ALL_API_ERROR_CODES — never
// parse `error.message` for branching logic. `meta.requestId` matches the
// X-Request-Id response header for one-shot trace correlation.

export interface ApiResponseMeta {
    readonly requestId: string;
    readonly version: 'v1';
}

export interface FieldError {
    readonly field: string;
    readonly code: string;
    readonly message: string;
}

export const ALL_API_ERROR_CODES = [
    'invalid_request',
    'authentication_failed',
    'permission_denied',
    'not_found',
    'idempotency_required',
    'idempotency_replay_mismatch',
    'idempotency_in_progress',
    'state_transition_forbidden',
    'authority_blocked',
    'courier_unavailable',
    'courier_rejected',
    'rate_limited',
    'internal_error',
    'service_unavailable',
] as const;
export type ApiErrorCode = typeof ALL_API_ERROR_CODES[number];

export interface ApiError {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly fieldErrors?: readonly FieldError[];
    readonly detail?: string;
}

export interface ApiSuccessBody<T> {
    readonly data: T;
    readonly error: null;
    readonly meta: ApiResponseMeta;
}

export interface ApiErrorBody {
    readonly data: null;
    readonly error: ApiError;
    readonly meta: ApiResponseMeta;
}

export type ApiResponseBody<T> = ApiSuccessBody<T> | ApiErrorBody;
