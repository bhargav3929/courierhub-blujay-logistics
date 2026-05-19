import type { ClientId, PartnerId } from './ids';
import type { CourierCode } from './shipment';

// ─── PricingSnapshot ────────────────────────────────────────────────────
//
// Immutable record of what the shipment cost at book time. Stored on the
// shipment doc; never updated. Cancellations may produce a separate refund
// record but do not alter this snapshot.
//
// totalPaise = baseFreightPaise + fuelSurchargePaise + codHandlingPaise
//            + otherChargesPaise + gstPaise + markupPaise

export interface PricingBreakdown {
    readonly baseFreightPaise: number;
    readonly fuelSurchargePaise: number;
    readonly codHandlingPaise: number;
    readonly otherChargesPaise: number;
    readonly gstPaise: number;
    readonly markupPaise: number;
}

export interface PricingSnapshot extends PricingBreakdown {
    readonly courier: CourierCode | null;       // null for self_shipment
    readonly serviceCode: string;
    readonly totalPaise: number;
    readonly currency: 'INR';
    readonly rateCardId: string | null;          // null = no rate card (list price)
    readonly rateCardVersion: number | null;
    readonly quotedAt: Date;
    readonly quoteToken: string | null;          // if booking used a token, retained for audit
    readonly appliedRules: readonly AppliedMarkupRule[];
}

// Per-rule record kept on the snapshot. Audit-grade: if a partner asks
// "why was this shipment ₹73 more than my rate card says?", every applied
// rule and its delta is here.
export interface AppliedMarkupRule {
    readonly ruleId: string;
    readonly ruleType: MarkupRuleType;
    readonly deltaPaise: number;
}

// ─── RateCard ───────────────────────────────────────────────────────────

export type MarkupRuleType = 'flat' | 'percent' | 'weight_tier' | 'min_charge';

export type MarkupRule =
    | {
        readonly id: string;
        readonly type: 'flat';
        readonly courier?: CourierCode;          // optional filter
        readonly serviceCode?: string;
        readonly addPaise: number;
    }
    | {
        readonly id: string;
        readonly type: 'percent';
        readonly courier?: CourierCode;
        readonly serviceCode?: string;
        readonly percent: number;                 // e.g. 15 means +15%
    }
    | {
        readonly id: string;
        readonly type: 'weight_tier';
        readonly courier?: CourierCode;
        readonly serviceCode?: string;
        // Tiers are evaluated in order. The first whose `maxWeightGrams`
        // is >= the parcel's weight wins. A final open-ended tier should
        // set maxWeightGrams to Number.POSITIVE_INFINITY.
        readonly tiers: readonly WeightTier[];
    }
    | {
        readonly id: string;
        readonly type: 'min_charge';
        readonly courier?: CourierCode;
        readonly serviceCode?: string;
        readonly minTotalPaise: number;           // raise total to at least this
    };

export interface WeightTier {
    readonly maxWeightGrams: number;
    readonly addPaise: number;
}

export interface RateCard {
    readonly id: string;
    readonly partnerId: PartnerId;
    readonly clientId?: ClientId;                 // null = applies to all sub-clients
    readonly name: string;
    readonly version: number;
    readonly rules: readonly MarkupRule[];
    readonly activeFrom: Date;
    readonly activeUntil: Date | null;            // null = open-ended
}
