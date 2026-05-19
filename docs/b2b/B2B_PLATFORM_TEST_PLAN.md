# B2B Platform — System Test Plan

End-to-end validation for the B2B Logistics Platform. Covers all backend
services, REST APIs, sagas, webhooks, admin pages, security, operations,
and deployment readiness.

For client-portal self-shipment testing, see
[../CLIENT_SELF_SHIPMENT_TEST_PLAN.md](../CLIENT_SELF_SHIPMENT_TEST_PLAN.md).

Existing companion docs (do not re-execute manually; reference them):

| Companion | Purpose |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Infra deploy checklist |
| [FIREBASE.md](FIREBASE.md) | Firestore rules, emulator, backup |
| [TESTING.md](TESTING.md) | Unit / integration / smoke test layers |
| [FAILURE_DRILLS.md](FAILURE_DRILLS.md) | 10 saga + network drills |
| [WEBHOOK_VALIDATION.md](WEBHOOK_VALIDATION.md) | Webhook capture / verify / replay |
| [RUNBOOK.md](RUNBOOK.md) | 15 symptom-indexed incident workflows |
| [PRODUCTION_ROLLOUT.md](PRODUCTION_ROLLOUT.md) | Phased rollout gates |
| [carriers/](carriers/) | Per-carrier sandbox validation |

---

## 0. Overview

7 sections · ~80 test IDs · estimated **8–10 hours** to execute
top-to-bottom for one engineer (much of it parallelizable while waiting
on emulator boots, carrier sandbox responses, etc.).

**Recommended order** (each gates the next):

1. Pre-flight (§1) — 30 min
2. Section A — Deployment readiness — 30 min
3. Section B — Security boundaries — 1 h
4. Section C — B2B REST APIs — 2 h
5. Section D — Webhooks + Event ingestion — 1.5 h
6. Section E — Saga + Recovery drills — 2 h
7. Section F — Operations dashboards — 1 h
8. Section G — Carrier validation (per-carrier, separate per carrier)

---

## 1. Pre-flight

| # | Check | Command / Action |
|---|---|---|
| PF-1 | `.env.local` complete | `node scripts/validate-b2b-env.mjs` |
| PF-2 | License gate passes | `npm run dev` boots without `LICENSE ERROR` |
| PF-3 | Firebase Admin SDK works | `node scripts/promote-to-admin.mjs` lists users |
| PF-4 | Firestore composite indexes deployed | Console → Firestore → Indexes ≥ 13 "Enabled" |
| PF-5 | Storage bucket reachable | Open the bucket in Firebase Console |
| PF-6 | A test admin user exists | `role=admin` confirmed |
| PF-7 | Dev server boots on `:3000` | `npm run dev` → 200 |
| PF-8 | Firebase emulator installed | `firebase --version` returns a version |

If any of PF-1..PF-8 fails, stop and fix before continuing.

---

## 2. Severity tiers

| Tier | Meaning | Action |
|---|---|---|
| **P0** | Blocks production. Data corruption, money loss, security. | Stop. Fix before any rollout. |
| **P1** | Should fix before broad rollout. | Fix before Phase-2. |
| **P2** | Nice-to-have. | Backlog. |

---

## A. Deployment readiness

### A-01  Env validation passes                                       [P0]

```bash
node scripts/validate-b2b-env.mjs
```

Expected: exit 0. Summary lists all required env vars as present:
`BLUJAY_LICENSE_KEY`, `B2B_QUOTE_TOKEN_SECRET`, `CRON_SECRET`,
`FIREBASE_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_APP_URL`.

### A-02  License gate enforced                                       [P0]

Steps: temporarily rename `BLUJAY_LICENSE_KEY` to a wrong value → `npm run dev`.

Expected: process exits with `LICENSE ERROR` from `scripts/validate-license.mjs`.

Restore the correct value before continuing.

### A-03  Firebase Admin SDK init                                    [P0]

`node scripts/promote-to-admin.mjs` runs and lists users without auth errors.

### A-04  Cron job auth                                               [P0]

```bash
curl -X POST http://localhost:3000/api/cron/poll-tracking
curl -X POST http://localhost:3000/api/cron/poll-tracking -H "Authorization: Bearer wrong-value"
curl -X POST http://localhost:3000/api/cron/poll-tracking -H "Authorization: Bearer $CRON_SECRET"
```

Expected: 401, 401, 200.

### A-05  Firestore composite indexes                                 [P0]

Console → Firestore → Indexes. Count must be ≥ 13. None "Building".
Compare against `firestore.indexes.json`.

### A-06  Storage signed URL TTL                                      [P1]

Validates: label URLs expire as configured.

Steps: fetch a label URL, note time, wait past TTL, retry.

Expected: post-TTL the URL returns 403 from Storage.

### A-07  Rollback drill                                              [P1]

Against staging (not prod):
1. Deploy a known-good commit.
2. Deploy a deliberately-broken commit.
3. Use Vercel "Promote to Production" on the known-good.

Expected: rollback completes in < 60 s. No data corruption.

---

## B. Security

### B-01  API key authentication required                             [P0]

```bash
curl http://localhost:3000/api/v1/b2b/shipments
curl http://localhost:3000/api/v1/b2b/rates -X POST -d '{}'
curl http://localhost:3000/api/v1/b2b/shipments/nonexistent/tracking
```

Expected: all return 401 with a structured error envelope. Body contains `error.code`, `error.message`, no stack traces.

### B-02  Mint a key                                                  [P0]

Steps:
1. Sign in as admin → open `/b2b/api-keys`.
2. **Create key** → name "Smoke Test" → submit.
3. Copy the raw key (`bj_...`) — shown once only.
4. Make any GET against the API with this key → 200.

Expected: minting works, key authenticates.

### B-03  Revoked keys reject                                         [P0]

Steps:
1. Mint Key-A → confirm a request returns 200.
2. From `/b2b/api-keys` → revoke Key-A.
3. Same request → 401.

Expected: revocation takes effect immediately (no cache). Error doesn't say "revoked" specifically — just `authentication_failed`.

### B-04  Disabled keys reject                                        [P0]

Steps:
1. Mint Key-B.
2. From the UI, toggle "disabled" to true.
3. Same request → 401.

Expected: identical to revoked behavior (error doesn't leak the distinction).

### B-05  Expired keys reject                                         [P1]

Steps:
1. In Firebase Console, edit a key's `expiresAt` to a past timestamp.
2. Request → 401.

### B-06  Tenant isolation                                            [P0 — CANARY]

Validates: Partner A cannot read Partner B's data.

Steps:
1. Mint a key for `partner_a`.
2. Mint a key for `partner_b`.
3. Partner A books a shipment → record the shipmentId.
4. Using Partner B's key, attempt to read it:
```bash
curl http://localhost:3000/api/v1/b2b/shipments/<shipmentId-from-A>/tracking \
  -H "Authorization: Bearer $PARTNER_B_KEY"
```

Expected: **404 `not_found`** (NOT 403). Same response shape as a truly-nonexistent shipment. No tenant existence leak.

Failure modes:
- 200 with data → **P0 CRITICAL security bug. Stop deployment.**
- 403 → leaks existence; downgrade to 404

### B-07  Secret hygiene                                              [P1]

Steps: DevTools → Sources → search the browser JS bundle for: `bj_`, `whsec_`, `FIREBASE_SERVICE_ACCOUNT_KEY`, the actual values from `.env.local`.

Expected: zero matches.

Known exception: `NEXT_PUBLIC_BLUEDART_*` env vars currently leak BlueDart creds to the bundle (documented in `CLAUDE.md` as a pre-existing issue). Do not introduce new `NEXT_PUBLIC_*` for anything sensitive.

### B-08  Admin route group blocks non-admins                         [P0]

Steps: signed in as a client user (not admin), try:
- `/b2b/shipments`
- `/b2b/operations`
- `/b2b/api-keys`

Expected: each redirects to `/client-dashboard` within ~300 ms.

---

## C. B2B REST APIs

### C-01  Smoke script — full happy path                              [P0]

```bash
HOST=http://localhost:3000 \
  B2B_API_KEY=bj_<smoke-key> \
  CRON_SECRET=<value> \
  node scripts/smoke-b2b.mjs --crons
```

Expected: all 10 checks pass:
1. Unauth → 401
2. Rate quote → 200 with quotes
3. Self-shipment booking → 201
4. Idempotency replay → identical body, `Idempotency-Replay: true` header
5. Tracking history → 200
6. Manual event push → 200, outcome `applied`
7. Label fetch → 200 (available or pending)
8. Cron `poll-tracking` → 200
9. Cron `reconcile-bookings` → 200
10. Cron `retrieve-labels` → 200

Failure modes per check noted in `b2b/TESTING.md` §HTTP smoke.

### C-02  Rollout smoke — strict latency budgets                      [P0]

```bash
HOST=http://localhost:3000 \
  B2B_API_KEY=bj_<key> \
  CRON_SECRET=<value> \
  node scripts/rollout-smoke.mjs
```

Expected: 9 checks pass, P95 latency assertions all green. Final line: "rollout smoke passed".

Failure modes:
- "response leaks internal detail" → security issue. P0.
- Booking latency > 8 s → carrier or sandbox issue.

### C-03  Quote API                                                   [P1]

```bash
curl http://localhost:3000/api/v1/b2b/rates -X POST \
  -H "Authorization: Bearer $B2B_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"origin": {...}, "destination": {...}, "parcel": {...}}'
```

Expected: 200 with array of quotes. Each quote has `courier`, `service`, `pricePaise`, `etaDays`, `quoteToken` (HMAC-signed, time-bounded).

### C-04  Booking with idempotency                                    [P0]

Steps:
1. POST `/api/v1/b2b/shipments` with `Idempotency-Key: idem-c04`.
2. Repeat the same POST with the same body and same key.

Expected: both return the same `shipmentId`. Second response has `Idempotency-Replay: true` header.

Carrier API was called **once** (verify in logs).

Failure modes:
- Two AWBs created at carrier → **P0 CRITICAL**. Idempotency layer regression.

### C-05  Different idempotency keys produce different shipments      [P1]

Same body, different `Idempotency-Key` → different shipmentIds.

### C-06  Cancel booking                                              [P1]

```bash
curl -X POST http://localhost:3000/api/v1/b2b/shipments/<id>/cancel \
  -H "Authorization: Bearer $B2B_API_KEY" \
  -H "Idempotency-Key: cancel-c06" \
  -d '{"reason": "uat"}'
```

Expected: 200, `data.cancelledAt` set. Shipment status → `cancelled`.

Edge: cancel after pickup → 409 `not_cancellable` with reason `post_pickup`. This is correct behavior.

### C-07  Label retrieval                                             [P1]

```bash
curl http://localhost:3000/api/v1/b2b/shipments/<id>/label \
  -H "Authorization: Bearer $B2B_API_KEY"
```

Expected: 200. `data.status` is `available` or `pending`. If `available`, `data.labelUrl` is a signed Storage URL that downloads a PDF.

### C-08  Tracking history                                            [P0]

```bash
curl http://localhost:3000/api/v1/b2b/shipments/<id>/tracking \
  -H "Authorization: Bearer $B2B_API_KEY"
```

Expected: 200. `data.currentStatus`, `data.events[]` array sorted by `occurredAt`. Each event has `type`, `occurredAt`, `location`, `description`.

### C-09  Manual event push (operator override)                       [P1]

```bash
curl -X POST http://localhost:3000/api/v1/b2b/shipments/<id>/events \
  -H "Authorization: Bearer $B2B_API_KEY" \
  -H "Idempotency-Key: evt-c09" \
  -d '{"status": "picked_up", "occurredAt": "2026-05-15T10:00:00Z"}'
```

Expected: 200, outcome `applied`. The shipment's projected status advances.

---

## D. Webhooks & Event Ingestion

### D-01  Webhook receiver — happy path                               [P0]

Pick BlueDart as the carrier (or whichever is most relevant).

Steps:
1. From the BlueDart sandbox, trigger a status update on a real test shipment.
2. Inspect the webhook arrival in your server logs.

Expected: log line `webhook batch ingested` with `applied: 1, failed: 0`.

For a comprehensive matrix, see [WEBHOOK_VALIDATION.md](WEBHOOK_VALIDATION.md) §5 — execute all 10 cells:

| Cell | Test | Expected |
|---|---|---|
| 1 | Capture a live event | Fixture saved |
| 2 | Offline verify signature | `match: true` |
| 3 | Replay verbatim (twice) | First applied, second duplicate |
| 4 | Replay with wrong secret | 401 |
| 5 | Replay with truncated body | 400 or 401 |
| 6 | Replay with unknown AWB | 200, per-event skipped |
| 7 | Replay stale event | 200, no_change/stale_by_rank |
| 8 | Replay same-status event | 200, no_change/same_status |
| 9 | Batch of 5 events same shipment | applied:5 |
| 10 | Batch with one malformed | other events still ingest |

### D-02  Duplicate webhook → outcome duplicate                       [P0]

Tested by `test/integration/idempotency-replay.test.ts`. Run:

```bash
firebase emulators:start --only firestore,storage &
sleep 10
FIRESTORE_EMULATOR_HOST=localhost:8080 \
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199 \
npx vitest run --config=vitest.integration.config.ts test/integration/idempotency-replay.test.ts
```

Expected: all 5 cases green.

### D-03  Stale-by-rank events                                        [P0]

Same test suite. Confirms shipment doesn't regress to a lower status.

### D-04  Same-status events                                          [P1]

Same suite — confirms `outcome: no_change, reason: same_status`.

### D-05  Out-of-order arrival                                        [P0]

Validates: regardless of arrival order, projection settles to the highest-rank seen.

```bash
npx vitest run test/integration/e2e-smoke.test.ts -t "courier"
```

### D-06  Invalid transition rejected                                 [P1]

Steps:
1. Progress a shipment to `delivered`.
2. POST an event implying `in_transit` with future `occurredAt`.

Expected: ingest result `no_change`, reason `invalid_transition`.

### D-07  Authority gating (hybrid mode)                              [P1]

See [carriers/BLUEDART.md](carriers/BLUEDART.md) §3 → "Hybrid mode".

### D-08  Timeline consistency                                        [P1]

Open a shipment in `/b2b/shipments/<id>` → Event Timeline. No two events should share a `dedupKey`.

---

## E. Saga & Recovery

Refer to [FAILURE_DRILLS.md](FAILURE_DRILLS.md) for the full drill text.
Record pass/fail per drill below.

| ID | Drill | Severity | Result |
|---|---|---|---|
| E-01 | Drill 1 — Booking timeout (indeterminate) | P0 | |
| E-02 | Drill 2 — Booking succeeds, response lost (CANARY) | **P0** | |
| E-03 | Drill 3 — Webhook timeout, carrier retries | P0 | |
| E-04 | Drill 4 — Delayed label | P1 | |
| E-05 | Drill 5 — Intermittent 5xx + circuit breaker | P0 | |
| E-06 | Drill 6 — Slow polling | P1 | |
| E-07 | Drill 7 — Orphan AWB reconciliation | P0 | |
| E-08 | Drill 8 — Compensation failure | P0 | |
| E-09 | Drill 9 — Replay-after-crash | P1 | |
| E-10 | Drill 10 — Manual reconciliation flow | P1 | |

**E-02 is the canary.** If it fails, do not deploy under any circumstance — duplicate-AWB risk.

---

## F. Operations dashboards

### F-01  Operations dashboard loads                                  [P0]

Open `/b2b/operations` as admin.

Expected: 5 panels render — Carrier Health, Reconciliation Queue, Label Failures, Dead-Letter, Compensation Failed. Initial counts probably 0.

### F-02  Populated reconciliation queue (after E-01)                 [P1]

After Drill 1, refresh `/b2b/operations`.

Expected: Reconciliation Queue shows count ≥ 1; clicking the entry opens shipment details.

### F-03  Manual recovery actions                                     [P1]

On the queue entry: click **Retry now** or **Mark as no-orphan**.

Expected: entry disappears within ~5 s. A `reconciliation_resolved` event appended to the shipment's events subcollection.

### F-04  Dead-letter retry                                           [P1]

See FAILURE_DRILLS.md Drill 8. Confirm the entry surfaces, click **Acknowledge** → it clears.

### F-05  Carrier Health panel                                        [P2]

Each enabled carrier shows aggregated metrics: stuck shipment count, reconciliation depth, label failure rate over 1h.

### F-06  Operational alerts wired                                    [P2]

External wiring (PagerDuty / Opsgenie). Refer to [carriers/README.md → alerts](carriers/README.md#production-alert-recommendations). Sign-off requires production alerting system has the rules configured.

---

## G. Carrier validation (per carrier)

Execute the carrier-specific runbook against a sandbox account for every
carrier you plan to enable. Each runbook is its own checklist (~30
steps per carrier).

| Carrier | Runbook | Notes |
|---|---|---|
| BlueDart | [carriers/BLUEDART.md](carriers/BLUEDART.md) | HMAC signature; AWBs are numeric |
| Delhivery | [carriers/DELHIVERY.md](carriers/DELHIVERY.md) | HMAC or token-in-query; waybills 13-digit numeric |
| DTDC | [carriers/DTDC.md](carriers/DTDC.md) | Static token only; webhooks are flaky — polling is primary |

Each runbook ends with an "Observed deviations" log. Populate it during
sandbox validation.

---

## H. Production readiness rubric

### Must-fix before any production deploy (P0)

- [ ] All P0 tests in §A–F green
- [ ] Test **B-06** (tenant isolation) executed and green
- [ ] Test **E-02** (CANARY — no duplicate AWBs) executed and green
- [ ] No critical alerts active in operations dashboard
- [ ] At least one carrier's full runbook (§G) executed against sandbox
- [ ] Backup script (`FIREBASE.md` §backup) tested at least once

### Platform-level production blockers (predate Phase 1–4)

These exist in the legacy codebase and must be addressed before serving
real customer traffic. They are not caused by B2B platform work.

| Blocker | Source | Severity |
|---|---|---|
| `firestore.rules` has `read, write: if true` on every collection | CLAUDE.md | **P0** |
| `NEXT_PUBLIC_BLUEDART_*` env vars expose BlueDart credentials to the browser bundle | CLAUDE.md | **P0** |
| Two lockfiles (`bun.lockb` + `package-lock.json`) | CLAUDE.md | P1 |

### Pre-rollout improvements (P1)

- [ ] Per-partner BlueDart webhook signature scheme override (currently hardcoded HMAC)
- [ ] DTDC webhook IP allowlist enforced at edge (not just app-layer token)
- [ ] Saga-resume cron for crashed-mid-flight shipments (only `BookingReconciler` exists)

### Backlog (P2)

- [ ] CSV export includes `fulfillmentMode` / `trackingMode`
- [ ] Reports pages bucket Self Shipment as a line item

### Edge-case findings template

```
Found:        <one-line description>
Test ID:      <which test surfaced it>
Severity:     <P0 / P1 / P2>
Reproduction: <exact steps>
Workaround:   <if any>
Owner:        <engineer assigned>
```

---

## I. Sign-off

| Section | Tester | Date | Pass / Conditional / Fail | Notes |
|---|---|---|---|---|
| Pre-flight (PF-1..8) | | | | |
| A — Deployment | | | | |
| B — Security | | | | |
| C — REST APIs | | | | |
| D — Webhooks & Events | | | | |
| E — Saga & Recovery | | | | |
| F — Operations | | | | |
| G — Carrier validation (per carrier) | | | | |

**Production deployment is gated on all sections being Pass or
Conditional with documented waivers.** A Fail in any P0 test blocks
deployment until remediated.

---

## J. Quick-reference

```bash
# Deployment readiness
node scripts/validate-b2b-env.mjs

# Security boundary smoke
# (manual; B-01..B-08)

# REST API smoke + cron
HOST=http://localhost:3000 B2B_API_KEY=bj_xxx CRON_SECRET=xxx \
  node scripts/smoke-b2b.mjs --crons

# REST API rollout (strict latency)
HOST=http://localhost:3000 B2B_API_KEY=bj_xxx CRON_SECRET=xxx \
  node scripts/rollout-smoke.mjs

# Webhook validation
node scripts/capture-webhook.mjs
node scripts/verify-webhook-signature.mjs --fixture ...
node scripts/replay-webhook.mjs --fixture ... --target ...

# Event ingestion + saga recovery (integration)
firebase emulators:start --only firestore,storage &
sleep 10
FIRESTORE_EMULATOR_HOST=localhost:8080 \
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199 \
  npx vitest run --config=vitest.integration.config.ts

# Operations dashboard (manual; open after drills)
open http://localhost:3000/b2b/operations
```

---

## Final production-readiness recommendation (B2B platform)

| Domain | Code quality | Test coverage | Operational readiness | Verdict |
|---|---|---|---|---|
| Backend (Booking, Tracking, Saga) | High | High (unit + integration + smoke) | High | **Ready** |
| REST API | High | High | High | **Ready** |
| Webhook receiver | High | High (per-carrier) | High | **Ready** with sandbox validation per carrier |
| Admin UI (`/b2b/*`) | High | Medium (manual click-through) | High | **Ready** with manual UAT |
| Carrier integration | Documented | Not run against real sandboxes | Documented | **Gating** — execute per-carrier runbook |
| Production rules / secrets | **Not addressed** (pre-existing) | n/a | n/a | **P0 BLOCKER** — see §H |

**Overall: conditionally ready.** Phase 1–4 work is production-grade.
Platform-level blockers (Firestore rules wide open, `NEXT_PUBLIC_BLUEDART_*`
exposed) predate this work and must be addressed in a separate
hardening pass before real customer traffic.

Recommended path:
1. Execute Sections A–F (this document)
2. Fix the platform-level P0 blockers above
3. Execute the per-carrier sandbox runbook (Section G) with real creds
4. Run [PRODUCTION_ROLLOUT.md](PRODUCTION_ROLLOUT.md) Phase 0 → Phase 1
5. Watch the operations dashboard daily
6. Expand per the rollout doc
