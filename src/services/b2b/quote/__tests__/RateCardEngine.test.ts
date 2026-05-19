import { describe, it, expect } from 'vitest';
import { RateCardEngine } from '../RateCardEngine';
import { PartnerId } from '../../../../types/b2b/ids';
import type { CarrierQuote } from '../../../../types/b2b/courier-adapter';
import type { ParcelInput } from '../../../../types/b2b/address';
import type { MarkupRule, RateCard } from '../../../../types/b2b/pricing';

const baseQuote: CarrierQuote = {
    courier: 'bluedart',
    serviceCode: 'A',
    totalPaise: 10_000,        // ₹100
    breakdown: { fuelSurcharge: 1_500, gst: 1_800 },
    currency: 'INR',
    etaDays: 3,
};

const parcel: ParcelInput = {
    weightGrams: 500,
    dimensionsCm: { length: 20, width: 15, height: 10 },
    declaredValuePaise: 50_000,
    contents: 'test',
    isCod: false,
    codAmountPaise: 0,
};

function card(rules: MarkupRule[]): RateCard {
    return {
        id: 'rc_test',
        partnerId: PartnerId('p_1'),
        name: 'test card',
        version: 1,
        rules,
        activeFrom: new Date('2026-01-01'),
        activeUntil: null,
    };
}

describe('RateCardEngine — no card (list price)', () => {
    it('returns the carrier total with no markup', () => {
        const r = RateCardEngine.applyMarkup({
            card: null,
            courier: 'bluedart',
            serviceCode: 'A',
            carrierQuote: baseQuote,
            parcel,
        });
        expect(r.totalPaise).toBe(10_000);
        expect(r.breakdown.markupPaise).toBe(0);
        expect(r.appliedRules).toEqual([]);
        // Component fields are populated from carrierQuote.breakdown where present
        expect(r.breakdown.fuelSurchargePaise).toBe(1_500);
        expect(r.breakdown.gstPaise).toBe(1_800);
    });
});

describe('RateCardEngine — flat rule', () => {
    it('adds a flat amount and records the delta', () => {
        const c = card([
            { id: 'r1', type: 'flat', addPaise: 5_000 },
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(15_000);
        expect(r.breakdown.markupPaise).toBe(5_000);
        expect(r.appliedRules).toEqual([
            { ruleId: 'r1', ruleType: 'flat', deltaPaise: 5_000 },
        ]);
    });
});

describe('RateCardEngine — percent rule', () => {
    it('computes percent against running total', () => {
        const c = card([
            { id: 'r1', type: 'percent', percent: 15 },
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(11_500);     // 10000 + 15%
        expect(r.appliedRules[0].deltaPaise).toBe(1_500);
    });

    it('stacks flat then percent (percent applies after flat)', () => {
        const c = card([
            { id: 'r1', type: 'flat', addPaise: 2_000 },     // → 12000
            { id: 'r2', type: 'percent', percent: 10 },       // → 13200
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(13_200);
        expect(r.breakdown.markupPaise).toBe(3_200);
    });
});

describe('RateCardEngine — weight_tier', () => {
    it('picks the first matching tier (≤ maxWeightGrams)', () => {
        const c = card([
            {
                id: 'r1',
                type: 'weight_tier',
                tiers: [
                    { maxWeightGrams: 250, addPaise: 1_000 },
                    { maxWeightGrams: 1000, addPaise: 5_000 },
                    { maxWeightGrams: Number.POSITIVE_INFINITY, addPaise: 10_000 },
                ],
            },
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote,                  // weight = 500g
            parcel,
        });
        expect(r.totalPaise).toBe(15_000);             // baseline + 500g tier
        expect(r.appliedRules[0].deltaPaise).toBe(5_000);
    });

    it('matches the top tier for over-weight parcels', () => {
        const c = card([
            {
                id: 'r1', type: 'weight_tier',
                tiers: [
                    { maxWeightGrams: 250, addPaise: 1_000 },
                    { maxWeightGrams: Number.POSITIVE_INFINITY, addPaise: 9_000 },
                ],
            },
        ]);
        const heavyParcel = { ...parcel, weightGrams: 5_000 };
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel: heavyParcel,
        });
        expect(r.totalPaise).toBe(19_000);
    });
});

describe('RateCardEngine — min_charge', () => {
    it('raises total to floor when current total is below', () => {
        const c = card([
            { id: 'r1', type: 'min_charge', minTotalPaise: 15_000 },
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(15_000);
        expect(r.appliedRules[0].deltaPaise).toBe(5_000);     // the lift amount only
    });

    it('is a no-op when total is already above the floor', () => {
        const c = card([
            { id: 'r1', type: 'min_charge', minTotalPaise: 5_000 },
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(10_000);
        expect(r.appliedRules).toEqual([]);
    });
});

describe('RateCardEngine — filtering by courier and serviceCode', () => {
    it('skips rules that target a different courier', () => {
        const c = card([
            { id: 'r1', type: 'flat', courier: 'delhivery', addPaise: 9_999 },
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(10_000);   // unchanged — rule did not match
        expect(r.appliedRules).toEqual([]);
    });

    it('applies rules that match the right serviceCode', () => {
        const c = card([
            { id: 'r1', type: 'flat', serviceCode: 'A', addPaise: 500 },
            { id: 'r2', type: 'flat', serviceCode: 'B', addPaise: 9_999 },
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(10_500);
        expect(r.appliedRules.map(x => x.ruleId)).toEqual(['r1']);
    });
});

describe('RateCardEngine — combined rules', () => {
    it('applies rules in order: flat → percent → min_charge', () => {
        const c = card([
            { id: 'r1', type: 'flat', addPaise: 1_000 },           // 10000 → 11000
            { id: 'r2', type: 'percent', percent: 10 },              // 11000 → 12100
            { id: 'r3', type: 'min_charge', minTotalPaise: 12_500 }, // 12100 → 12500
        ]);
        const r = RateCardEngine.applyMarkup({
            card: c, courier: 'bluedart', serviceCode: 'A',
            carrierQuote: baseQuote, parcel,
        });
        expect(r.totalPaise).toBe(12_500);
        expect(r.appliedRules.map(x => x.ruleId)).toEqual(['r1', 'r2', 'r3']);
        expect(r.breakdown.markupPaise).toBe(2_500);
    });
});
