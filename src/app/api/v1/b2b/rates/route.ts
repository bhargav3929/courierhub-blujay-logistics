/**
 * POST /api/v1/b2b/rates
 *
 * Multi-carrier quote endpoint. Returns one quote per eligible courier,
 * sorted by lowest total. Each quote carries an HMAC-signed `quoteToken`
 * the partner can pass back to /shipments to lock the price.
 */
import { type NextRequest } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminApp } from '@/lib/firebaseAdmin';
import { authenticateB2BRequest } from '@/lib/b2bAuth';
import {
    buildError,
    buildRequestContext,
    err,
    getLogger,
    ok,
    zodErrorToApiError,
} from '@/services/b2b/http';
import { buildQuoteEngine } from '@/services/b2b/infra';
import { ALL_COURIER_CODES } from '@/types/b2b/shipment';

const log = getLogger('api.v1.b2b.rates');

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
    clientId: z.string().optional(),
    origin: AddressSchema,
    destination: AddressSchema,
    parcel: ParcelSchema,
    preferredCouriers: z.array(z.enum(ALL_COURIER_CODES)).optional(),
    preferredServiceCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
    const ctx = buildRequestContext(req);

    const auth = await authenticateB2BRequest(req);
    if (!auth.ok) {
        const status = auth.failure.kind === 'unauthorized' ? 401 : 500;
        return err(
            buildError(status === 401 ? 'authentication_failed' : 'internal_error', auth.failure.reason),
            status, ctx,
        );
    }
    const { partnerId } = auth.partner;

    let json: unknown;
    try { json = await req.json(); }
    catch { return err(buildError('invalid_request', 'Body must be valid JSON'), 400, ctx); }

    const parsed = Body.safeParse(json);
    if (!parsed.success) return err(zodErrorToApiError(parsed.error), 422, ctx);

    try {
        const engine = buildQuoteEngine(getFirestore(adminApp));
        const resp = await engine.quote({
            partnerId,
            clientId: parsed.data.clientId as never,
            origin: parsed.data.origin,
            destination: parsed.data.destination,
            parcel: parsed.data.parcel,
            preferredCouriers: parsed.data.preferredCouriers,
            preferredServiceCode: parsed.data.preferredServiceCode,
        });
        log.info('rates ok', {
            requestId: ctx.requestId, partnerId,
            quoteCount: resp.quotes.length, failureCount: resp.failures.length,
        });
        return ok(resp, ctx);
    } catch (e) {
        log.error('rates failed', {
            requestId: ctx.requestId, partnerId,
            error: e instanceof Error ? e.message : String(e),
        });
        return err(buildError('internal_error', 'Failed to fetch rates'), 500, ctx);
    }
}
