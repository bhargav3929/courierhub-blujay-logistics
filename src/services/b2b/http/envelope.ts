import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type {
    ApiError,
    ApiErrorBody,
    ApiErrorCode,
    ApiResponseBody,
    ApiSuccessBody,
    FieldError,
} from '@/types/b2b/http';

export interface RequestContext {
    readonly requestId: string;
}

const REQ_ID_HEADER = 'X-Request-Id';
const MAX_INCOMING_REQ_ID = 128;

// Accepts a partner-supplied X-Request-Id if it's short and printable;
// otherwise mints a fresh one. Echoed in the response header for
// correlation in partner-side logs.
export function buildRequestContext(req: NextRequest): RequestContext {
    const incoming = req.headers.get(REQ_ID_HEADER) || req.headers.get('x-request-id');
    if (incoming && incoming.length > 0 && incoming.length <= MAX_INCOMING_REQ_ID) {
        return { requestId: incoming };
    }
    return { requestId: `req_${randomUUID()}` };
}

export function okBody<T>(data: T, ctx: RequestContext): ApiSuccessBody<T> {
    return {
        data,
        error: null,
        meta: { requestId: ctx.requestId, version: 'v1' },
    };
}

export function errBody(error: ApiError, ctx: RequestContext): ApiErrorBody {
    return {
        data: null,
        error,
        meta: { requestId: ctx.requestId, version: 'v1' },
    };
}

export function jsonResponse<T>(
    body: ApiResponseBody<T>,
    status: number,
    requestId: string,
    extraHeaders?: HeadersInit,
): NextResponse {
    return NextResponse.json(body, {
        status,
        headers: { [REQ_ID_HEADER]: requestId, ...(extraHeaders ?? {}) },
    });
}

export function ok<T>(
    data: T,
    ctx: RequestContext,
    init?: { status?: number; headers?: HeadersInit },
): NextResponse {
    return jsonResponse(okBody(data, ctx), init?.status ?? 200, ctx.requestId, init?.headers);
}

export function err(
    error: ApiError,
    status: number,
    ctx: RequestContext,
    headers?: HeadersInit,
): NextResponse {
    return jsonResponse(errBody(error, ctx), status, ctx.requestId, headers);
}

export function buildError(
    code: ApiErrorCode,
    message: string,
    opts?: { fieldErrors?: readonly FieldError[]; detail?: string },
): ApiError {
    return { code, message, ...(opts ?? {}) };
}
