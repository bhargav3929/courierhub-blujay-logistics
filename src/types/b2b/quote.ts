import type { AddressInput, ParcelInput } from './address';
import type { ClientId, PartnerId } from './ids';
import type { CourierCode } from './shipment';
import type { PricingSnapshot } from './pricing';

// ─── Quote engine input ────────────────────────────────────────────────

export interface QuoteRequest {
    readonly partnerId: PartnerId;
    readonly clientId?: ClientId;
    readonly origin: AddressInput;
    readonly destination: AddressInput;
    readonly parcel: ParcelInput;
    readonly preferredCouriers?: readonly CourierCode[];   // empty = all
    readonly preferredServiceCode?: string;
}

// ─── Quote engine output ───────────────────────────────────────────────

// One quote per (courier, serviceCode). `pricingSnapshot.totalPaise` is the
// final price the partner pays. `etaDays` is best-effort from the carrier.

export interface Quote {
    readonly courier: CourierCode;
    readonly serviceCode: string;
    readonly etaDays: number | null;
    readonly pricingSnapshot: PricingSnapshot;
    readonly quoteToken: string;
    readonly expiresAt: Date;
}

// Per-carrier failure surfaced alongside successful quotes. Lets the
// partner see e.g. "Delhivery: pincode not serviceable" without failing
// the whole quote response.

export interface QuoteFailure {
    readonly courier: CourierCode;
    readonly code: QuoteFailureCode;
    readonly message: string;
}

export type QuoteFailureCode =
    | 'not_serviceable'
    | 'not_eligible'
    | 'carrier_unavailable'
    | 'rate_card_excludes';

export interface QuoteResponse {
    readonly quotes: readonly Quote[];
    readonly failures: readonly QuoteFailure[];
}

// ─── Serviceability ─────────────────────────────────────────────────────

export interface ServiceabilityResult {
    readonly serviceable: boolean;
    readonly reason?: string;
}

// ─── Quote token (HMAC-signed envelope) ────────────────────────────────
//
// Stateless lockable price. The token is a single string in the form
//   bjqt_<base64url(payload)>.<hex(hmac)>
// where `payload` is JSON of QuoteTokenPayload and `hmac` is SHA-256 over
// the payload bytes using the platform secret (or partner-rotating secret
// when we add per-partner rotation later).

export interface QuoteTokenPayload {
    readonly version: 1;
    readonly partnerId: PartnerId;
    readonly courier: CourierCode;
    readonly serviceCode: string;
    readonly totalPaise: number;
    readonly issuedAt: number;     // unix-ms
    readonly expiresAt: number;    // unix-ms
    readonly nonce: string;        // randomness so identical quotes have different tokens
    // Hash of the request snapshot (origin pincode, destination pincode,
    // weightGrams, isCod). Mismatch at book time → 400 quote_token_mismatch.
    readonly requestHash: string;
}

export type VerifyQuoteTokenResult =
    | { ok: true; payload: QuoteTokenPayload }
    | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'partner_mismatch' };
