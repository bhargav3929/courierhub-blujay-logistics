# B2B Firestore Indexing Strategy

Composite-index strategy for the B2B platform. Every Firestore query
that combines two or more equality predicates, or an equality + a
non-matching `orderBy`, needs a composite index. This doc maps every
such query to the index that serves it.

Source of truth: [firestore.indexes.json](../../firestore.indexes.json)
(31 indexes across 5 collections).

---

## 1. Why composite indexes matter

Firestore creates **single-field indexes automatically**. They cover:
- `where('field', '==', 'x')` alone
- `where('field', '>=', N)` alone
- `orderBy('field')` alone

You need **composite indexes** when any of these combine:
- Equality on field A + orderBy on field B (where A ≠ B)
- Equality on field A + equality on field B + orderBy on anything
- Multiple equalities or any inequality + non-matching orderBy

The B2B platform hits dozens of compound query shapes — every dashboard
filter combination, every cron query, every Carrier Health aggregation.
Missing an index surfaces as a 9 `FAILED_PRECONDITION: The query requires
an index` error with a one-click URL to create it.

---

## 2. Deploy the indexes

```bash
# Requires firebase-tools installed: npm install -g firebase-tools
firebase login
firebase use blujay-dd8cd
firebase deploy --only firestore:indexes
```

Index builds take **1–5 minutes on a small dataset**, up to **30 minutes
on production-scale data**. Builds are visible in Firebase Console →
Firestore → Indexes (column "Status").

Do NOT skip this step in deployment — running the app without these
indexes means dashboards throw `FAILED_PRECONDITION` for any filter
beyond single-field.

---

## 3. The five collections

| Collection | Indexes | Purpose |
|---|---|---|
| `shipments` | 22 | Admin dashboard filters, polling, reconciliation, label retry, carrier health |
| `events` | 2 | Partner-scoped event timeline (asc + desc orderings) |
| `b2b_jobs` | 2 | Background job dispatcher (generic + topic-specific) |
| `rate_cards` | 1 | RateCardEngine — latest active card per partner/client |
| `b2b_sagas` | 1 | Compensation-failed queue |

---

## 4. Coverage map — admin dashboard queries

The admin dashboard at `/b2b/shipments` exposes 10 filter dropdowns. The
server-side `buildBaseQuery` in
[src/services/server/b2bShipmentAdminService.ts](../../src/services/server/b2bShipmentAdminService.ts)
applies them as a chain of equality predicates plus
`orderBy('createdAt', 'desc')`.

### Single-filter queries

Each of these has a dedicated index pairing the filter field with `createdAt desc`:

| Filter | Index |
|---|---|
| `partnerId` only | `partnerId asc + status asc + createdAt desc` (status is optional but kept) |
| `clientId` only | `clientId + createdAt desc` |
| `status` only | `status + createdAt desc` |
| `courier.code` only | `courier.code + createdAt desc` |
| `fulfillmentMode` only | `fulfillmentMode + createdAt desc` |
| `trackingMode` only | `trackingMode + createdAt desc` |
| `shipmentSource` only | `shipmentSource + createdAt desc` |
| `artifacts.label.status` only | `artifacts.label.status + createdAt desc` |
| `awaitingCarrierReconciliation` only | `awaitingCarrierReconciliation + createdAt desc` |
| `awb` lookup | `courier.code + courier.awb` (no order needed — unique) |

### Compound (2-field) queries

Most-likely combinations have dedicated indexes:

| Compound | Index |
|---|---|
| `partnerId + status` | `partnerId + status + createdAt desc` |
| `partnerId + clientId` | `partnerId + clientId + createdAt desc` |
| `partnerId + externalRef` | `partnerId + externalRef` (lookup) |
| `partnerId + courier.code` | `partnerId + courier.code + createdAt desc` |
| `partnerId + fulfillmentMode` | `partnerId + fulfillmentMode + createdAt desc` |
| `partnerId + artifacts.label.status` | `partnerId + artifacts.label.status + createdAt desc` |
| `status + courier.code` | `status + courier.code + createdAt desc` |
| `courier.code + fulfillmentMode` | `courier.code + fulfillmentMode + createdAt desc` |
| `artifacts.label.status + fulfillmentMode` | `artifacts.label.status + fulfillmentMode + createdAt desc` |

### Compound (3+ field) queries — not pre-indexed

The combinatorial explosion makes pre-indexing every 3-field combination
impractical. When operators trigger an unindexed 3-field query, Firestore
returns the `FAILED_PRECONDITION` error with a one-click URL. Behavior:

- **Operator clicks the URL** → Firebase Console pre-populates an index → click Create → wait 1–5 min → retry.
- **Engineer adds the new index to `firestore.indexes.json`** and re-deploys so the index is reproducible across environments.

This is the documented workflow. Treat the error as a feature, not a bug:
Firestore tells you exactly what index to add.

---

## 5. Coverage map — operational queries

The operations dashboard at `/b2b/operations` runs five aggregation
queries via
[src/services/server/b2bOperationsService.ts](../../src/services/server/b2bOperationsService.ts).

### Reconciliation queue

```
where('awaitingCarrierReconciliation', '==', true)
  .orderBy('reconcileNextAttemptAt', 'asc')
```

Served by: `awaitingCarrierReconciliation + reconcileNextAttemptAt`.

### Label failure queue (two sub-queries)

```
// Failed labels
where('artifacts.label.status', '==', 'failed')

// Pending labels with attempts >= 2
where('artifacts.label.status', '==', 'pending')
  .where('artifacts.label.attempts', '>=', 2)
```

Served by: `artifacts.label.status + artifacts.label.attempts`.

### Dead-letter jobs

```
collection('b2b_jobs').where('deadLetter', '==', true)
```

Single-field — uses Firestore's auto-index on `deadLetter`.

### Compensation-failed sagas

```
collection('b2b_sagas')
  .where('status', '==', 'compensation_failed')
  .orderBy('updatedAt', 'asc')
```

Served by: `b2b_sagas: status + updatedAt`.

### Carrier health (per carrier × 4 sub-queries)

For each carrier (BlueDart / Delhivery / DTDC):
1. Stuck-in-transit: `courier.code + status + tracking.lastEventAt`
2. Awaiting reconciliation: `reconcileCourier + awaitingCarrierReconciliation`
3. Pending labels: `courier.code + artifacts.label.status`
4. Failed labels: `courier.code + artifacts.label.status` (same index)

All four use Firestore's `count()` aggregation — a single read per query
regardless of result size.

---

## 6. Coverage map — saga + cron queries

| Cron / job | Query | Index |
|---|---|---|
| `BookingReconciler.runOnce` | `awaitingCarrierReconciliation == true + orderBy reconcileNextAttemptAt asc` | `awaitingCarrierReconciliation + reconcileNextAttemptAt` |
| `PollingWorker.runOnce` | `status == 'in_transit' + fulfillmentMode == 'courier' + orderBy tracking.lastEventAt asc` | `status + fulfillmentMode + tracking.lastEventAt` |
| `LabelRetrievalJob.runOnce` | `fulfillmentMode == 'courier' + artifacts.label.status == 'pending' + orderBy artifacts.label.attempts asc` | `fulfillmentMode + artifacts.label.status + artifacts.label.attempts` |
| `FirestoreJobQueue.pickDue` | `status == 'queued' + orderBy runAt asc` | `b2b_jobs: status + runAt` |
| `FirestoreJobQueue.pickByTopic` | `topic == X + status == 'queued' + orderBy runAt asc` | `b2b_jobs: topic + status + runAt` |
| `RateCardEngine.pickActive` | `partnerId == X + clientId == Y + orderBy activeFrom desc` | `rate_cards: partnerId + clientId + activeFrom` |
| Event timeline read | `partnerId == X + orderBy occurredAt asc/desc` | `events: partnerId + occurredAt` (asc + desc) |

---

## 7. Tenant-isolation invariant

Many queries scope by `partnerId` first. **Never run an unscoped query
that can leak across partners.** The indexes are designed so that
partner-scoped queries are always cheaper (and always served by an
index) than cross-partner ones. If a cross-partner query is unavoidable
(operations dashboards), it must:

1. Be admin-only (gated by route group)
2. Be aggregated (`count()`) or paginated (cursor + limit)
3. Never return tenant-specific PII without explicit operator action

---

## 8. Production deployment workflow

### One-time setup

```bash
npm install -g firebase-tools
firebase login
firebase use blujay-dd8cd
```

### Per-release

```bash
# After editing firestore.indexes.json
firebase deploy --only firestore:indexes

# Wait for builds to finish before exposing new queries
# Check progress at: Firebase Console → Firestore → Indexes
```

### Verifying coverage

```bash
node scripts/check-firestore-indexes.mjs
```

Outputs a coverage report: which declared indexes exist, which are
building, which are missing (compared to the local JSON file).

---

## 9. When you see `FAILED_PRECONDITION` in production

1. Firebase Console → Firestore → Indexes — is the index "Building"? If yes, wait.
2. If "Missing": follow the one-click URL in the error to create it ad-hoc.
3. Same hour, add it to `firestore.indexes.json` with a `_for` description.
4. Commit + deploy via `firebase deploy --only firestore:indexes`.
5. Add a regression test if the query is on a hot path.

**Never** ship code that depends on an unindexed query. The
one-click-URL recovery is a stopgap, not a strategy.

---

## 10. Cost notes

Each index has a write cost — every shipment write fans out to update
all 22 shipment indexes. For our write volume (booking + a few status
updates per shipment), this is acceptable. If write volume grows 10x,
audit `fieldOverrides` to disable single-field indexes on rarely-queried
fields (like internal IDs).

Current estimate at 1000 shipments/day:
- ~30 writes per shipment lifecycle (booking + events + label update + delivery)
- ~22 index updates per write on `shipments` (each index = one extra write)
- Total: ~660,000 index writes/day → well within free tier (20K writes/day for shipments alone; index writes are billed separately at lower cost)

Blaze plan recommended for production scale.
