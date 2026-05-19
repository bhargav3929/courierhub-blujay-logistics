import type { AddressInput } from '@/types/b2b/address';
import type { CreateShipmentInput } from '@/types/b2b/shipment';

// Pure, synchronous validation of partner-supplied input. Returns a structured
// list of errors so the API layer (Phase 2 step 4) can translate to a 422
// fieldErrors response without re-implementing per-field logic.
//
// What lives here:  field-shape rules, intra-input cross-checks, business
//                   constraints derivable from the input alone.
// What does NOT:    serviceability checks (need pincode DB), partner-tier
//                   limits (need partner doc), idempotency (separate layer).

export interface ValidationError {
    readonly field: string;
    readonly code: string;
    readonly message: string;
}

export type ValidationResult =
    | { ok: true }
    | { ok: false; errors: readonly ValidationError[] };

// India-specific. Pincodes start with 1-9, six digits total.
const PINCODE_RE = /^[1-9][0-9]{5}$/;
// E.164-ish — 10–15 digits, optional leading +. Permissive on purpose; the
// carrier APIs do their own validation downstream.
const PHONE_RE = /^\+?[0-9]{10,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_WEIGHT_GRAMS = 50_000;        // 50 kg default. Per-partner override comes later.
const MAX_METADATA_BYTES = 4 * 1024;    // 4 KB cap
const MAX_EXTERNAL_REF_LEN = 64;
const MAX_NAME_LEN = 100;

export function validateCreateShipmentInput(
    input: CreateShipmentInput,
): ValidationResult {
    const errors: ValidationError[] = [];

    // Mode coherence
    if (input.fulfillmentMode === 'self_shipment' && input.preferredCourier) {
        errors.push({
            field: 'preferredCourier',
            code: 'incompatible_with_fulfillment_mode',
            message: 'self_shipment cannot specify preferredCourier',
        });
    }

    // Addresses
    errors.push(...validateAddress('origin', input.origin));
    errors.push(...validateAddress('destination', input.destination));
    if (input.returnAddress) {
        errors.push(...validateAddress('returnAddress', input.returnAddress));
    }

    // Parcel
    const p = input.parcel;
    if (p.weightGrams <= 0) {
        errors.push({ field: 'parcel.weightGrams', code: 'must_be_positive', message: 'weight must be greater than 0' });
    } else if (p.weightGrams > MAX_WEIGHT_GRAMS) {
        errors.push({
            field: 'parcel.weightGrams',
            code: 'exceeds_max',
            message: `weight exceeds maximum of ${MAX_WEIGHT_GRAMS}g`,
        });
    }

    if (p.dimensionsCm.length <= 0 || p.dimensionsCm.width <= 0 || p.dimensionsCm.height <= 0) {
        errors.push({
            field: 'parcel.dimensionsCm',
            code: 'must_be_positive',
            message: 'all dimensions must be greater than 0',
        });
    }

    if (p.declaredValuePaise < 0) {
        errors.push({
            field: 'parcel.declaredValuePaise',
            code: 'must_be_non_negative',
            message: 'declared value cannot be negative',
        });
    }

    if (p.isCod) {
        if (p.codAmountPaise <= 0) {
            errors.push({
                field: 'parcel.codAmountPaise',
                code: 'required_for_cod',
                message: 'COD shipments must specify codAmountPaise greater than 0',
            });
        }
    } else if (p.codAmountPaise !== 0) {
        errors.push({
            field: 'parcel.codAmountPaise',
            code: 'must_be_zero_for_non_cod',
            message: 'codAmountPaise must be 0 when isCod is false',
        });
    }

    if (!p.contents || p.contents.trim().length === 0) {
        errors.push({ field: 'parcel.contents', code: 'required', message: 'contents description is required' });
    }

    // Optional fields
    if (input.externalRef !== undefined) {
        if (input.externalRef.length === 0 || input.externalRef.length > MAX_EXTERNAL_REF_LEN) {
            errors.push({
                field: 'externalRef',
                code: 'invalid_length',
                message: `externalRef must be 1–${MAX_EXTERNAL_REF_LEN} characters`,
            });
        }
    }

    if (input.metadata) {
        const size = JSON.stringify(input.metadata).length;
        if (size > MAX_METADATA_BYTES) {
            errors.push({
                field: 'metadata',
                code: 'too_large',
                message: `metadata exceeds ${MAX_METADATA_BYTES} bytes (got ${size})`,
            });
        }
    }

    return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateAddress(prefix: string, a: AddressInput): ValidationError[] {
    const errs: ValidationError[] = [];

    if (!a.name || a.name.trim().length === 0 || a.name.length > MAX_NAME_LEN) {
        errs.push({ field: `${prefix}.name`, code: 'invalid', message: `name is required (1–${MAX_NAME_LEN} chars)` });
    }
    if (!a.phone || !PHONE_RE.test(a.phone)) {
        errs.push({ field: `${prefix}.phone`, code: 'invalid', message: 'phone must be 10–15 digits, optional leading +' });
    }
    if (a.email && !EMAIL_RE.test(a.email)) {
        errs.push({ field: `${prefix}.email`, code: 'invalid', message: 'email format is invalid' });
    }
    if (!a.line1 || a.line1.trim().length === 0) {
        errs.push({ field: `${prefix}.line1`, code: 'required', message: 'line1 is required' });
    }
    if (!a.city || a.city.trim().length === 0) {
        errs.push({ field: `${prefix}.city`, code: 'required', message: 'city is required' });
    }
    if (!a.state || a.state.trim().length === 0) {
        errs.push({ field: `${prefix}.state`, code: 'required', message: 'state is required' });
    }
    if (!PINCODE_RE.test(a.pincode)) {
        errs.push({
            field: `${prefix}.pincode`,
            code: 'invalid_pincode',
            message: 'pincode must be 6 digits, not starting with 0',
        });
    }
    if (!a.country || a.country.trim().length === 0) {
        errs.push({ field: `${prefix}.country`, code: 'required', message: 'country is required (ISO-3166 alpha-2)' });
    }

    return errs;
}
