/**
 * POST /api/v1/b2b/shipments
 *
 * Books a shipment. Idempotent on `Idempotency-Key`. Either pass a
 * `quoteToken` (price-locked) or a `preferredCourier` (live-quote at book
 * time). Auth: B2B partner API key.
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminApp } from '@/lib/firebaseAdmin';
import { authenticateB2BRequest } from '@/lib/b2bAuth';
import {
    buildError,
    buildRequestContext,
    commitIdempotency,
    computeRequestHash,
    err,
    errBody,
    getLogger,
    jsonResponse,
    okBody,
    reserveIdempotency,
    validateIdempotencyKey,
    zodErrorToApiError,
} from '@/services/b2b/http';
import { buildBookingService, FirestoreIdempotencyStore } from '@/services/b2b/infra';
import {
    ALL_COURIER_CODES,
    ALL_FULFILLMENT_MODES,
    ALL_TRACKING_MODES,
} from '@/types/b2b/shipment';
import type { BookingRequest, BookingResult } from '@/types/b2b/booking';

const log = getLogger('api.v1.b2b.shipments');

const AddressSchema = z.object({
    name: z.string().min(1).max(100),
    phone: z.string().regex(/^\+?[0-9]{10,15}$/),
    email: z.string().email().optional(),
    line1: z.string().min(1),
    line2: z.string().optional(),
    landmark: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/),
    country: z.string().min(1),
});

const ParcelSchema = z.object({
    weightGrams: z.number().int().positive().max(50_000),
    dimensionsCm: z.object({
        length: z.number().positive(),
        width: z.number().positive(),
        height: z.number().positive(),
    }),
    declaredValuePaise: z.number().int().nonnegative(),
    contents: z.string().min(1).max(200),
    invoiceNumber: z.string().optional(),
    isCod: z.boolean(),
    codAmountPaise: z.number().int().nonnegative(),
});

const Body = z.object({
    externalRef: z.string().min(1).max(64).optional(),
    clientId: z.string().optional(),
    fulfillmentMode: z.enum(ALL_FULFILLMENT_MODES),
    trackingMode: z.enum(ALL_TRACKING_MODES).optional(),
    origin: AddressSchema,
    destination: AddressSchema,
    parcel: ParcelSchema,
    quoteToken: z.string().optional(),
    preferredCourier: z.enum(ALL_COURIER_CODES).optional(),
    preferredServiceCode: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const FAILURE_HTTP_STATUS: Record<string, number> = {
    validation_failed: 422,
    serviceability_failed: 400,
    no_carrier_eligible: 400,
    quote_token_invalid: 400,
    quote_token_expired: 410,
    quote_token_mismatch: 409,
    rate_card_excludes: 400,
    carrier_rejected: 422,
    carrier_unavailable: 503,
    booking_failed_indeterminate: 202,    // accepted; resolution pending
    projection_failed: 500,
    idempotency_mismatch: 409,
    idempotency_in_progress: 409,
    internal_error: 500,
};

export async function POST(req: NextRequest) {
    const ctx = buildRequestContext(req);

    // ─── 1. Auth ────────────────────────────────────────────────────
    const auth = await authenticateB2BRequest(req);
    if (!auth.ok) {
        const status = auth.failure.kind === 'unauthorized' ? 401 : 500;
        const code = status === 401 ? 'authentication_failed' as const : 'internal_error' as const;
        return err(buildError(code, auth.failure.reason), status, ctx);
    }
    const { partnerId, apiKeyId } = auth.partner;

    // ─── 2. Idempotency-Key required ────────────────────────────────
    const idempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');
    if (!idempotencyKey || !validateIdempotencyKey(idempotencyKey)) {
        return err(
            buildError('idempotency_required', 'A valid Idempotency-Key header is required'),
            400, ctx,
        );
    }

    // ─── 3. Parse body ──────────────────────────────────────────────
    let json: unknown;
    try { json = await req.json(); }
    catch { return err(buildError('invalid_request', 'Body must be valid JSON'), 400, ctx); }

    const parsed = Body.safeParse(json);
    if (!parsed.success) return err(zodErrorToApiError(parsed.error), 422, ctx);
    const body = parsed.data;

    // ─── 4. Reserve idempotency at HTTP layer ───────────────────────
    const db = getFirestore(adminApp);
    const idStore = new FirestoreIdempotencyStore(db);
    const requestHash = computeRequestHash('POST', req.nextUrl.pathname, body);

    let reservation;
    try {
        reservation = await reserveIdempotency(idStore, partnerId, idempotencyKey, requestHash);
    } catch (e) {
        log.error('idempotency reserve failed', {
            requestId: ctx.requestId, partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Idempotency reservation failed'), 500, ctx);
    }

    if (reservation.kind === 'replay') {
        log.info('idempotency replay', { requestId: ctx.requestId, partnerId });
        return jsonResponse(
            reservation.response.body as never,
            reservation.response.httpStatus,
            ctx.requestId,
            { 'Idempotency-Replay': 'true' },
        );
    }
    if (reservation.kind === 'in_progress') {
        return err(
            buildError('idempotency_in_progress', 'Another request with this Idempotency-Key is in progress'),
            409, ctx,
        );
    }
    if (reservation.kind === 'mismatch') {
        return err(
            buildError('idempotency_replay_mismatch', 'Idempotency-Key was reused with a different request body'),
            409, ctx,
        );
    }

    // ─── 5. Build BookingRequest and invoke the service ─────────────
    const bookingRequest: BookingRequest = {
        partnerId,
        idempotencyKey,
        apiKeyId,
        externalRef: body.externalRef,
        clientId: body.clientId as never,
        fulfillmentMode: body.fulfillmentMode,
        trackingMode: body.trackingMode,
        origin: body.origin,
        destination: body.destination,
        parcel: body.parcel,
        quoteToken: body.quoteToken,
        preferredCourier: body.preferredCourier,
        preferredServiceCode: body.preferredServiceCode,
        metadata: body.metadata,
    };

    let result: BookingResult;
    try {
        const service = buildBookingService(db);
        result = await service.book(bookingRequest, ctx.requestId);
    } catch (e) {
        log.error('booking service threw', {
            requestId: ctx.requestId, partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Booking failed unexpectedly'), 500, ctx);
    }

    // ─── 6. Map BookingResult → HTTP response ───────────────────────
    const { status, body: respBody } = mapBookingResult(result, ctx);

    // ─── 7. Cache the response body for partner retries ─────────────
    try {
        await commitIdempotency(idStore, partnerId, idempotencyKey, status, respBody);
    } catch (e) {
        log.warn('idempotency commit failed', {
            requestId: ctx.requestId, partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
    }

    log.info('booking result', {
        requestId: ctx.requestId, partnerId,
        outcome: result.kind,
        shipmentId: 'shipmentId' in result ? result.shipmentId : undefined,
    });
    return jsonResponse(respBody as never, status, ctx.requestId);
}

function mapBookingResult(
    result: BookingResult,
    ctx: { requestId: string },
): { status: number; body: unknown } {
    if (result.kind === 'booked') {
        return {
            status: result.replay ? 200 : 201,
            body: okBody({
                shipmentId: result.shipmentId,
                courier: result.courier,
                awb: result.awb,
                pricing: result.pricing,
                label: result.label,
            }, ctx),
        };
    }
    if (result.kind === 'cancelled_during_booking') {
        const httpStatus = FAILURE_HTTP_STATUS[result.reason] ?? 409;
        return {
            status: httpStatus,
            body: errBody(buildError('state_transition_forbidden', `Booking aborted: ${result.reason}`, {
                detail: result.detail,
            }), ctx),
        };
    }
    // kind === 'failed'
    const httpStatus = FAILURE_HTTP_STATUS[result.reason] ?? 500;
    const code = httpStatus >= 500 ? 'internal_error' as const :
                 httpStatus === 503 ? 'courier_unavailable' as const :
                 httpStatus === 422 ? 'invalid_request' as const :
                 httpStatus === 410 ? 'invalid_request' as const :
                 httpStatus === 409 ? 'state_transition_forbidden' as const : 'invalid_request' as const;
    return {
        status: httpStatus,
        body: errBody(buildError(code, `Booking failed: ${result.reason}`, {
            detail: result.detail,
        }), ctx),
    };
}
