import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
    buildError,
    buildRequestContext,
    err,
    errBody,
    okBody,
    ok,
} from '../envelope';

function makeReq(headers: Record<string, string> = {}, url = 'http://x/api/v1/b2b/x'): NextRequest {
    return new NextRequest(url, { headers });
}

describe('buildRequestContext', () => {
    it('echoes a valid incoming X-Request-Id', () => {
        const ctx = buildRequestContext(makeReq({ 'X-Request-Id': 'req_abc123' }));
        expect(ctx.requestId).toBe('req_abc123');
    });

    it('mints a fresh req_ id when header is absent', () => {
        const ctx = buildRequestContext(makeReq());
        expect(ctx.requestId).toMatch(/^req_[a-f0-9-]{36}$/);
    });

    it('mints a fresh id when incoming header is too long', () => {
        const ctx = buildRequestContext(makeReq({ 'X-Request-Id': 'x'.repeat(200) }));
        expect(ctx.requestId).toMatch(/^req_/);
    });

    it('accepts lowercase header name', () => {
        const ctx = buildRequestContext(makeReq({ 'x-request-id': 'req_lower' }));
        expect(ctx.requestId).toBe('req_lower');
    });
});

describe('okBody / errBody', () => {
    const ctx = { requestId: 'req_test' };

    it('wraps data in a success envelope with meta', () => {
        const body = okBody({ awb: 'AWB123' }, ctx);
        expect(body.data).toEqual({ awb: 'AWB123' });
        expect(body.error).toBeNull();
        expect(body.meta).toEqual({ requestId: 'req_test', version: 'v1' });
    });

    it('wraps error in an error envelope with meta', () => {
        const body = errBody(buildError('not_found', 'Shipment not found'), ctx);
        expect(body.data).toBeNull();
        expect(body.error).toEqual({ code: 'not_found', message: 'Shipment not found' });
        expect(body.meta.requestId).toBe('req_test');
    });
});

describe('ok / err', () => {
    const ctx = { requestId: 'req_test' };

    it('ok() sets default 200 and echoes X-Request-Id header', () => {
        const response = ok({ id: 1 }, ctx);
        expect(response.status).toBe(200);
        expect(response.headers.get('X-Request-Id')).toBe('req_test');
    });

    it('ok() supports custom status', () => {
        const response = ok({ id: 1 }, ctx, { status: 201 });
        expect(response.status).toBe(201);
    });

    it('err() uses the given status and echoes X-Request-Id', () => {
        const response = err(buildError('not_found', 'gone'), 404, ctx);
        expect(response.status).toBe(404);
        expect(response.headers.get('X-Request-Id')).toBe('req_test');
    });
});

describe('buildError', () => {
    it('attaches fieldErrors and detail when provided', () => {
        const e = buildError('invalid_request', 'bad', {
            fieldErrors: [{ field: 'a', code: 'required', message: 'missing' }],
            detail: 'extra',
        });
        expect(e.code).toBe('invalid_request');
        expect(e.fieldErrors).toHaveLength(1);
        expect(e.detail).toBe('extra');
    });
});
