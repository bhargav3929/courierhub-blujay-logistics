// API key types — unified storage for B2C merchant keys + B2B partner keys.
//
// Storage model:
//   /clientApiKeys/{keyId}   ← top-level collection, indexed for fast lookup
//     - hash      : SHA-256 of the raw key (we never store the raw key)
//     - clientId  : owner (Blujay tenant)
//     - label     : human-friendly name (e.g. "Production website")
//     - keyPrefix : first 11 chars of raw key (safe to expose)
//     - createdAt
//     - lastUsedAt
//     - revokedAt : optional — when set, key is rejected on auth
//     - scope     : 'merchant' (default, B2C) | 'b2b_partner' (B2B)
//     - partnerId, partnerName, environment, webhookUrl, webhookSecret
//                 : populated when scope === 'b2b_partner'
//
// Key wire format: `bj_<32 hex chars>`.
//   - The `bj_` prefix lets us recognise our own keys at a glance.
//   - 32 hex chars = 128 bits of entropy = sufficient.
//   - Shown to the user ONCE on creation; we only keep the hash.
import { Timestamp } from 'firebase/firestore';

export type ApiKeyScope = 'merchant' | 'b2b_partner';
export type ApiKeyEnvironment = 'sandbox' | 'production';

export interface ApiKeyRecord {
    id: string;
    clientId: string;
    hash: string;
    keyPrefix: string;
    label: string;
    createdAt: Timestamp;
    lastUsedAt?: Timestamp;
    revokedAt?: Timestamp;
    // Type discrimination — undefined means legacy merchant key.
    scope?: ApiKeyScope;
    // B2B-only fields (only populated when scope === 'b2b_partner').
    partnerId?: string;
    partnerName?: string;
    environment?: ApiKeyEnvironment;
    webhookUrl?: string;
    webhookSecret?: string;
}

/**
 * Shape returned to the client when a NEW key is minted. This is the ONLY
 * time the raw key is visible — the server never stores it.
 */
export interface ApiKeyMinted {
    id: string;
    label: string;
    rawKey: string;
    createdAt: number;
    scope: ApiKeyScope;
    // For B2B keys we also return the webhook secret once (if generated),
    // so the partner can verify webhook signatures from us.
    webhookSecret?: string;
}

/**
 * Public-safe summary for list views — never includes hash or raw key.
 */
export interface ApiKeySummary {
    id: string;
    label: string;
    createdAt: number;
    lastUsedAt?: number;
    revokedAt?: number;
    maskedKey: string;
    scope: ApiKeyScope;     // resolved (undefined → 'merchant' in summary)
    // B2B-only display fields.
    partnerName?: string;
    environment?: ApiKeyEnvironment;
    webhookUrl?: string;
}

/**
 * Body shape accepted by POST /api/client/api-keys.
 * Discriminated on `keyType`.
 */
export type CreateApiKeyRequest =
    | { keyType: 'b2c'; label: string }
    | {
          keyType: 'b2b';
          label: string;
          partnerName: string;
          environment: ApiKeyEnvironment;
          webhookUrl?: string;
      };
