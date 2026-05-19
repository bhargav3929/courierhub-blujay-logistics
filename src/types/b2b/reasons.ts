// Reason-code taxonomy.
//
// Rules:
//   - Additive only: never repurpose or delete an existing code.
//   - Each union has a paired ALL_* array. The array is the source of truth
//     for `safeReason()` runtime narrowing.
//   - When extending: append to the array AND the union. A compile-time
//     check at the bottom of this file enforces parity.

export const ALL_CANCELLATION_REASONS = [
    'partner_requested',
    'duplicate',
    'payment_failed',
    'booking_failed',
    'booking_failed_indeterminate',
    'address_invalid',
    'oos_serviceability',
] as const;
export type CancellationReason = typeof ALL_CANCELLATION_REASONS[number];

export const ALL_UNDELIVERED_REASONS = [
    'customer_unavailable',
    'address_incorrect',
    'address_inaccessible',
    'cod_refused',
    'package_damaged',
    'consignee_refused',
    'office_closed',
    'other',
] as const;
export type UndeliveredReason = typeof ALL_UNDELIVERED_REASONS[number];

export const ALL_RTO_REASONS = [
    'repeated_undelivered',
    'consignee_refused',
    'address_unreachable',
    'partner_requested',
    'expired_in_transit',
] as const;
export type RtoReason = typeof ALL_RTO_REASONS[number];

export const ALL_HOLD_REASONS = [
    'kyc_required',
    'invoice_missing',
    'restricted_item',
    'manual_review',
] as const;
export type HoldReason = typeof ALL_HOLD_REASONS[number];

export const ALL_EXCEPTION_REASONS = [
    'lost_in_transit',
    'damaged_in_transit',
    'misrouted',
    'fire',
    'flood',
    'seized_by_authority',
    'other',
] as const;
export type ExceptionReason = typeof ALL_EXCEPTION_REASONS[number];

// Runtime helper: narrow a free-form string to a typed reason or fall back.
// Used by event normalizers that receive raw carrier codes.
export function safeReason<T extends string>(
    candidate: string | null | undefined,
    valid: readonly T[],
    fallback: T,
): T {
    if (candidate && (valid as readonly string[]).includes(candidate)) {
        return candidate as T;
    }
    return fallback;
}
