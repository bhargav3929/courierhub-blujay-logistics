// API key types — used for merchant webhook authentication.
//
// Storage model:
//   /clientApiKeys/{keyId}   ← top-level collection, indexed for fast lookup
//     - hash      : SHA-256 of the raw key (we never store the raw key)
//     - clientId  : owner (Blujay tenant)
//     - label     : human-friendly name (e.g. "Production website")
//     - createdAt
//     - lastUsedAt
//     - revokedAt : optional — when set, key is rejected on auth
//
// Key wire format: `bj_<32 hex chars>`.
//   - The `bj_` prefix lets us recognise our own keys at a glance.
//   - 32 hex chars = 128 bits of entropy = sufficient.
//   - Shown to the user ONCE on creation; we only keep the hash.
import { Timestamp } from 'firebase/firestore';

export interface ApiKeyRecord {
    id: string;                 // doc id (also the public key id)
    clientId: string;           // Blujay tenant uid that owns this key
    hash: string;               // sha256 of the raw key
    keyPrefix: string;          // first 11 chars of raw key — safe to expose, used for UI identification
    label: string;
    createdAt: Timestamp;
    lastUsedAt?: Timestamp;
    revokedAt?: Timestamp;
}

/**
 * Shape returned to the client when a NEW key is minted. This is the ONLY
 * time the raw key is visible — the server never stores it.
 */
export interface ApiKeyMinted {
    id: string;
    label: string;
    rawKey: string;             // bj_<32hex> — show once, then drop
    createdAt: number;          // epoch ms (serialised for transport)
}

/**
 * Public-safe summary used in list views — never includes hash or raw key.
 */
export interface ApiKeySummary {
    id: string;
    label: string;
    createdAt: number;          // epoch ms
    lastUsedAt?: number;
    revokedAt?: number;
    // First 8 chars of the raw key, padded with •. Lets the user identify
    // which key is which without exposing the full secret.
    maskedKey: string;
}
