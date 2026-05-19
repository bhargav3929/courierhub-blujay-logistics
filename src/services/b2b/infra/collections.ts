// Centralized Firestore collection paths for the B2B platform.
//
// One place to look when introducing a new collection, and one place to
// update if a path is ever renamed. Do not use raw string literals for
// collection names anywhere in `services/b2b/infra/*` — always import from
// here.
//
// ─── Required composite indexes ─────────────────────────────────────────
// Keep `firestore.indexes.json` in sync when this list changes.
//
//   shipments:
//     (partnerId ASC, status ASC,        createdAt DESC)
//     (partnerId ASC, externalRef ASC)
//     (courier.code ASC, courier.awb ASC)
//     (partnerId ASC, clientId ASC,      createdAt DESC)
//     (status ASC,    tracking.lastEventAt ASC)            ← stuck-shipment ops
//
//   shipments/{id}/events:                ← auto-indexed by doc id (dedupKey)
//     no composite index required for current queries
//
//   b2b_jobs:
//     (status ASC, runAt ASC)
//     (topic ASC, status ASC, runAt ASC)
//
//   shipment_idempotency:
//     no composite index required (point lookup by doc id)

export const COLLECTIONS = {
    SHIPMENTS: 'shipments',
    SHIPMENT_EVENTS: 'events',              // subcollection under shipments
    PARTNERS: 'partners',
    B2B_JOBS: 'b2b_jobs',
    B2B_DEAD_LETTER: 'b2b_dead_letter',
    SHIPMENT_IDEMPOTENCY: 'shipment_idempotency',

    // Phase 3 Step 2 — production infrastructure additions:
    B2B_SHIPMENT_IDEMPOTENCY_INDEX: 'b2b_shipment_idempotency_index',
    B2B_SAGAS: 'b2b_sagas',
    B2B_RATE_CARDS: 'rate_cards',
    B2B_SERVICEABILITY: 'b2b_serviceability',   // doc id = `${courier}__${pincode}`
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
