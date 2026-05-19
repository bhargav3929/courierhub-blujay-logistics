import type { CarrierQuote } from '@/types/b2b/courier-adapter';
import type { ParcelInput } from '@/types/b2b/address';
import type {
    AppliedMarkupRule,
    MarkupRule,
    PricingBreakdown,
    RateCard,
} from '@/types/b2b/pricing';
import type { CourierCode } from '@/types/b2b/shipment';

// Applies a partner's rate-card rules to a carrier's raw quote and
// returns the final price with a per-rule breakdown.
//
// Order:
//   1. Start from the carrier's totalPaise as the baseline.
//   2. For each rule, in card order: if it matches (courier + serviceCode
//      filter), apply it and record the delta.
//   3. Sum deltas into `markupPaise`. Total = base + markup.
//   4. `min_charge` rules raise the total to a floor (not added on top).
//
// Stateless and pure — easy to unit-test, easy to reason about for
// auditors when partners ask "why this price?".

export interface ApplyMarkupInput {
    readonly card: RateCard | null;        // null = no card; use list price
    readonly courier: CourierCode;
    readonly serviceCode: string;
    readonly carrierQuote: CarrierQuote;
    readonly parcel: ParcelInput;
}

export interface ApplyMarkupResult {
    readonly breakdown: PricingBreakdown;
    readonly totalPaise: number;
    readonly appliedRules: readonly AppliedMarkupRule[];
}

export const RateCardEngine = {
    applyMarkup(input: ApplyMarkupInput): ApplyMarkupResult {
        const base = input.carrierQuote.totalPaise;
        const breakdownIn = input.carrierQuote.breakdown;

        if (!input.card) {
            // No rate card → list price, no markup, no rules.
            return {
                breakdown: {
                    baseFreightPaise: base,
                    fuelSurchargePaise: numberField(breakdownIn, 'fuelSurcharge'),
                    codHandlingPaise: numberField(breakdownIn, 'codHandling'),
                    otherChargesPaise: numberField(breakdownIn, 'other'),
                    gstPaise: numberField(breakdownIn, 'gst'),
                    markupPaise: 0,
                },
                totalPaise: base,
                appliedRules: [],
            };
        }

        let total = base;
        let markup = 0;
        const applied: AppliedMarkupRule[] = [];

        for (const rule of input.card.rules) {
            if (!ruleMatches(rule, input.courier, input.serviceCode)) continue;

            const delta = computeRuleDelta(rule, total, input.parcel);
            if (rule.type === 'min_charge') {
                // Floor: raise total but record only the actual increase.
                const before = total;
                total = Math.max(total, delta);
                const lift = total - before;
                if (lift > 0) {
                    applied.push({ ruleId: rule.id, ruleType: rule.type, deltaPaise: lift });
                    markup += lift;
                }
                continue;
            }
            if (delta !== 0) {
                applied.push({ ruleId: rule.id, ruleType: rule.type, deltaPaise: delta });
                total += delta;
                markup += delta;
            }
        }

        return {
            breakdown: {
                baseFreightPaise: base,
                fuelSurchargePaise: numberField(breakdownIn, 'fuelSurcharge'),
                codHandlingPaise: numberField(breakdownIn, 'codHandling'),
                otherChargesPaise: numberField(breakdownIn, 'other'),
                gstPaise: numberField(breakdownIn, 'gst'),
                markupPaise: markup,
            },
            totalPaise: total,
            appliedRules: applied,
        };
    },
};

function ruleMatches(
    rule: MarkupRule,
    courier: CourierCode,
    serviceCode: string,
): boolean {
    if (rule.courier && rule.courier !== courier) return false;
    if (rule.serviceCode && rule.serviceCode !== serviceCode) return false;
    return true;
}

function computeRuleDelta(rule: MarkupRule, currentTotal: number, parcel: ParcelInput): number {
    switch (rule.type) {
        case 'flat':
            return rule.addPaise;
        case 'percent':
            return Math.round((currentTotal * rule.percent) / 100);
        case 'weight_tier': {
            const tier = rule.tiers.find(t => parcel.weightGrams <= t.maxWeightGrams);
            return tier ? tier.addPaise : 0;
        }
        case 'min_charge':
            return rule.minTotalPaise;
    }
}

function numberField(obj: Readonly<Record<string, number>>, key: string): number {
    const v = obj[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
