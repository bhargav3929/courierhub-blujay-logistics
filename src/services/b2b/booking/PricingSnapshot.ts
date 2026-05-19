import type { ParcelInput } from '@/types/b2b/address';
import type { CarrierQuote } from '@/types/b2b/courier-adapter';
import type { PartnerId } from '@/types/b2b/ids';
import type { PricingSnapshot, RateCard } from '@/types/b2b/pricing';
import { RateCardEngine } from '../quote/RateCardEngine';
import { verifyQuoteToken, computeQuoteRequestHash } from '../quote/quoteToken';

// Builds a PricingSnapshot at book time.
//
// Two paths:
//   1. Token-locked: partner passes a quote token. We verify it, re-quote
//      under current conditions for the same (courier, serviceCode), and
//      assert that the new total matches the locked total within a small
//      tolerance. If it matches, use the fresh snapshot. If it diverges,
//      surface as `quote_token_mismatch` — carrier prices have drifted
//      and the partner must re-quote.
//   2. Live: no token. Apply the current rate card to the carrier's quote
//      directly.
//
// Either path produces a fully-populated PricingSnapshot with breakdown,
// applied rules, rate-card identity, and timestamp.

const TOKEN_MISMATCH_TOLERANCE_PAISE = 100;   // ₹1 — tolerates minor rounding

export type SnapshotBuildResult =
    | { kind: 'ok'; snapshot: PricingSnapshot }
    | {
        kind: 'token_mismatch';
        tokenPaise: number;
        freshPaise: number;
        deltaPaise: number;
    }
    | { kind: 'token_invalid'; reason: 'malformed' | 'bad_signature' | 'expired' | 'partner_mismatch' | 'request_hash_mismatch' };

export interface BuildSnapshotInput {
    readonly partnerId: PartnerId;
    readonly courier: import('@/types/b2b/shipment').CourierCode;
    readonly carrierQuote: CarrierQuote;
    readonly rateCard: RateCard | null;
    readonly parcel: ParcelInput;
    readonly quoteToken?: string;
    readonly requestHashInputs: {
        originPincode: string;
        destinationPincode: string;
        weightGrams: number;
        isCod: boolean;
        codAmountPaise: number;
    };
}

export function buildPricingSnapshot(input: BuildSnapshotInput): SnapshotBuildResult {
    const markup = RateCardEngine.applyMarkup({
        card: input.rateCard,
        courier: input.courier,
        serviceCode: input.carrierQuote.serviceCode,
        carrierQuote: input.carrierQuote,
        parcel: input.parcel,
    });

    const freshSnapshot: PricingSnapshot = {
        courier: input.courier,
        serviceCode: input.carrierQuote.serviceCode,
        ...markup.breakdown,
        totalPaise: markup.totalPaise,
        currency: 'INR',
        rateCardId: input.rateCard?.id ?? null,
        rateCardVersion: input.rateCard?.version ?? null,
        quotedAt: new Date(),
        quoteToken: input.quoteToken ?? null,
        appliedRules: markup.appliedRules,
    };

    if (!input.quoteToken) {
        return { kind: 'ok', snapshot: freshSnapshot };
    }

    // Token path — verify and reconcile.
    const verified = verifyQuoteToken(input.quoteToken, input.partnerId);
    if (!verified.ok) {
        return { kind: 'token_invalid', reason: verified.reason };
    }

    const expectedHash = computeQuoteRequestHash(input.requestHashInputs);
    if (verified.payload.requestHash !== expectedHash) {
        return { kind: 'token_invalid', reason: 'request_hash_mismatch' };
    }

    const tokenPaise = verified.payload.totalPaise;
    const delta = Math.abs(tokenPaise - markup.totalPaise);
    if (delta > TOKEN_MISMATCH_TOLERANCE_PAISE) {
        return {
            kind: 'token_mismatch',
            tokenPaise,
            freshPaise: markup.totalPaise,
            deltaPaise: delta,
        };
    }
    return { kind: 'ok', snapshot: freshSnapshot };
}
