// B2B partner API key types.
//
// Stored at clientApiKeys/{id} with scope='b2b_partner'. Merchant keys
// (no scope field) live alongside but are untouched by this module.

export const ALL_B2B_API_KEY_ENVIRONMENTS = ['production', 'sandbox'] as const;
export type B2BApiKeyEnvironment = typeof ALL_B2B_API_KEY_ENVIRONMENTS[number];

// Only one scope today; the field exists so future granular scopes
// (b2b_partner_read, b2b_partner_book) slot in without schema changes.
export type B2BApiKeyScope = 'b2b_partner';

export interface B2BApiKeySummary {
    readonly id: string;
    readonly partnerId: string;
    readonly label: string;
    readonly keyPrefix: string;
    readonly maskedKey: string;
    readonly scope: B2BApiKeyScope;
    readonly environment: B2BApiKeyEnvironment;
    readonly createdAt: Date;
    readonly createdBy: string | null;
    readonly lastUsedAt: Date | null;
    readonly disabled: boolean;
    readonly disabledAt: Date | null;
    readonly disabledBy: string | null;
    readonly revokedAt: Date | null;
    readonly revokedBy: string | null;
    readonly revokeReason: string | null;
    readonly expiresAt: Date | null;
}

// Returned exactly once on mint. `rawKey` is the only field that
// contains the secret — never persisted, never re-derivable from the
// stored doc.
export interface B2BApiKeyMinted {
    readonly id: string;
    readonly partnerId: string;
    readonly label: string;
    readonly keyPrefix: string;
    readonly rawKey: string;
    readonly createdAt: number;
    readonly environment: B2BApiKeyEnvironment;
    readonly scope: B2BApiKeyScope;
    readonly expiresAt: number | null;
}

// Operational status derived from the persisted fields. The UI uses
// this — the auth layer derives its own decision directly from the doc.
export type B2BApiKeyStatus = 'active' | 'disabled' | 'revoked' | 'expired';

export function statusOf(key: B2BApiKeySummary, now: Date = new Date()): B2BApiKeyStatus {
    if (key.revokedAt) return 'revoked';
    if (key.expiresAt && key.expiresAt.getTime() < now.getTime()) return 'expired';
    if (key.disabled) return 'disabled';
    return 'active';
}
