# B2B Failure & Reconciliation Drills

The platform is designed so that every failure mode has a documented
recovery path. This document is the operational proof that each path
works. Execute every drill against sandbox (or, where noted, the
production-shaped staging environment) before a carrier or partner is
enabled for production traffic.

Each drill section is structured:

- **Setup** — preconditions
- **Inject** — what to break
- **Observe** — what the platform should do
- **Verify** — assertions to confirm correctness
- **Recovery** — what should heal automatically and what requires
  operator action

---

## How to inject failures

The integration test harness ([test/integration/](../../test/integration/))
already supports failure injection via the `MockCourierAdapter`. For the
drills below to run against a *deployed* environment, the same failure
modes are reproduced by:

1. **Carrier timeouts**: temporarily set the partner's
   `clients/{partnerId}.courierIntegrations.<courier>.apiBaseUrl` to a
   URL that black-holes connections (`https://10.255.255.1` is a
   reliable RFC 5737 sinkhole for connection timeouts;
   `https://httpstat.us/200?sleep=60000` for read timeouts).
2. **Carrier 5xx**: point `apiBaseUrl` to `https://httpstat.us` —
   honors `/{status}` paths.
3. **Webhook signature failure**: clear `webhookSecret` for the partner.
4. **Stale webhook**: use `scripts/replay-webhook.mjs` with a captured
   fixture from an earlier point in the lifecycle.

Restore the real URL after each drill.

---

## Drill 1 — Booking timeout (indeterminate result)

**Setup**

- Test partner `partner_drill_1` with BlueDart credentials.
- `apiBaseUrl` swapped to `https://10.255.255.1`.

**Inject**

POST `/api/v1/b2b/shipments` with a valid booking request.

**Observe**

- Request hangs for 25 s (the booking read timeout).
- Saga's `book_courier` step throws → step records `indeterminate`.
- Saga proceeds to `lookupByReference` — also fails (no carrier).
- Saga records `markAwaitingReconciliation` and returns
  `kind: 'cancelled_during_booking'`, `reason: 'booking_failed_indeterminate'`.
- Client sees a 503 response with structured error.

**Verify**

- Shipment doc exists with `status: 'cancelled_during_booking'`.
- Shipment doc has `awaitingCarrierReconciliation: true`,
  `reconcileAttempts: 1`, `reconcileNextAttemptAt` ≈ now + 5 min.
- The `/b2b/operations` dashboard shows this shipment in the
  Reconciliation Queue.

**Recovery**

- Restore the real `apiBaseUrl`.
- Either wait 5 min for the cron, or hit
  `POST /api/cron/reconcile-bookings` with cron auth.
- If the carrier never created a real shipment (the timeout was true),
  reconciler's `lookupByReference` returns `not_found`; after 5 attempts
  it abandons → flag cleared, shipment stays cancelled.
- If the carrier *did* create the shipment, lookup returns the AWB; the
  reconciler issues a cancel and clears the flag.

---

## Drill 2 — Booking succeeds at carrier, response lost in-flight

This is the **canary** drill — duplicate-prevention is the most
important platform property.

**Setup**

- Partner `partner_drill_2`.
- Healthy carrier connection.

**Inject**

1. Issue a booking with `Idempotency-Key: drill-2-001`.
2. While the request is in flight (or immediately after), simulate a
   network drop by killing the requesting client.
3. Wait 1 s.
4. Re-issue the *same* request with the *same* idempotency key.

**Observe**

The second request should return *identical* response data (same AWB),
not a new booking.

**Verify**

- Exactly one shipment doc exists for that idempotency key.
- Carrier-side: exactly one AWB issued (check carrier dashboard).
- Response carries `Idempotency-Replay: true` header.

**Recovery**

None needed — this is the happy-path of idempotency.

**Failure signal**

If two AWBs exist on the carrier side, the platform's idempotency layer
has a bug — escalate immediately. The drill is the canary that this
hasn't regressed.

---

## Drill 3 — Webhook timeout (carrier retries)

**Setup**

- Partner `partner_drill_3`.
- Healthy webhook config.

**Inject**

Add a 60 s `sleep` to the webhook handler (locally) or simulate a
deployment-level slow response. The carrier's webhook delivery has a
typical timeout of 10–30 s; on timeout, all three carriers retry.

**Observe**

- Carrier retries the same webhook 1–5 times (per carrier policy).
- All retries carry the **same body** and **same signature**.

**Verify**

- Shipment events subcollection has each unique event exactly once.
- Per-event ingest result: first attempt `applied`, subsequent
  attempts `duplicate` (caught by dedupKey).
- No duplicate status transitions.

**Recovery**

Remove the artificial delay. Carriers stop retrying once they get a 2xx.

---

## Drill 4 — Delayed label

**Setup**

- Partner `partner_drill_4`.
- Carrier: DTDC (longest typical label delay).

**Inject**

Book a shipment normally; do not retrieve the label immediately.

**Observe**

- Booking returns with `data.label.status: 'pending'` (or 'available'
  for fast carriers).
- The `retrieve-labels` cron fires every 5 min; each run retries
  pending labels.
- DTDC labels typically resolve within 30–90 s in production.

**Verify**

- Within 3 cron cycles (15 min), label status flips to `'available'`.
- A signed Storage URL is present.
- The label PDF opens.

**Recovery**

If label is still `'pending'` after 30 min, the shipment surfaces in the
Label Failure Queue on `/b2b/operations`. Operator can:

- Click "Retry retrieval" — forces a fresh fetch.
- Or click "Mark manual" — operator uploads a label PDF manually
  (rare; partner contacts carrier support).

---

## Drill 5 — Carrier intermittent 5xx

**Setup**

- Partner `partner_drill_5`.
- Healthy carrier connection.

**Inject**

Set `apiBaseUrl` to a host that fails ~30% of requests
(`https://httpstat.us/random/200,500,503`). Run 20 bookings.

**Observe**

- ~6 bookings will hit a 5xx response.
- For each: saga's `book_courier` records the result of
  `lookupByReference` after the failure:
  - If lookup says `not_found`: saga returns
    `cancelled_during_booking`, shipment flagged for reconciliation.
  - If lookup finds an AWB: saga adopts it, booking succeeds.
- Circuit breaker (`src/services/b2b/couriers/shared/circuitBreaker.ts`)
  for that carrier will **open** if the 5xx ratio crosses its threshold
  (3 failures in 30 s by default).

**Verify**

- No duplicate AWBs across all 20 bookings.
- Circuit-breaker state is observable in logs (search for
  `circuit-breaker state-change`).
- Once open, subsequent booking attempts fail fast with
  `carrier_unavailable`, not 25 s timeouts.
- After 60 s of no traffic, breaker moves to half-open; one probe
  request allowed.

**Recovery**

- Once carrier health restores, breaker probe succeeds → closes.
- Reconciliation queue drains as the reconciler runs.

---

## Drill 6 — Slow polling responses

**Setup**

- Partner `partner_drill_6` with 10 shipments in transit.

**Inject**

Set `apiBaseUrl` for the carrier to `https://httpstat.us/200?sleep=8000`
— each track call takes 8 s. The polling worker has a 10 s read timeout
per shipment.

**Observe**

- Cron `/api/cron/poll-tracking` runs the polling worker.
- Worker processes shipments concurrently (default concurrency: 5).
- With 8 s per call and concurrency 5, 10 shipments process in 2 batches
  ≈ 16 s.
- Vercel's cron has a 60 s budget — should comfortably fit.

**Verify**

- All 10 shipments have an updated `tracking.lastPolledAt`.
- Log line `polling worker completed` shows
  `errors: 0, processed: 10`.

**Failure signal**

If `processed` is less than total backlog or errors > 0, the polling
budget is exceeded. Solutions:

- Increase cron schedule frequency.
- Increase concurrency (carefully — rate-limit-bound).
- Reduce per-call timeout.

---

## Drill 7 — Reconciliation drill (orphan AWB)

This is the most operationally important drill. It validates the
recovery path for the worst-case booking failure: AWB was created on the
carrier side but never recorded in our system.

**Setup**

- Partner `partner_drill_7`.
- BlueDart sandbox account.

**Inject**

1. Configure a transparent proxy between our app and the carrier (or
   use the harness in `test/integration/mocks/` for a deployed
   staging environment).
2. Allow the booking request through to the carrier.
3. Drop the **response** before it reaches our app.
4. Wait 25 s (our read timeout).

**Observe**

- Our saga records the booking as indeterminate.
- `lookupByReference` is invoked with the idempotency key.
  - In **sandbox**: lookup may return `not_found` for ~60 s due to
    propagation delay.
  - In **production**: lookup usually returns the AWB within 10 s.
- If `not_found`: shipment is flagged for reconciliation,
  `reconcileNextAttemptAt` set to now + 5 min.
- Reconciler runs on schedule; eventually finds the AWB via lookup.
- Reconciler issues a cancel to the carrier (orphan cleanup).
- Flag cleared, shipment terminal state `cancelled` with
  `cancelReason: 'reconciled_orphan'`.

**Verify**

- Carrier-side: AWB exists, then gets cancelled.
- Our side: shipment terminal state `cancelled`.
- Events subcollection has the reconciliation events with
  `source: 'reconciler'`.
- The `/b2b/operations` dashboard's "Reconciliation Queue" had this
  shipment temporarily, then it disappeared.

**Recovery**

None required — this is the recovery path itself succeeding.

**Operator action** (only if reconciler abandons after max attempts):

- The shipment surfaces in the Reconciliation Queue with
  `reconcileResolvedWithAwb: null` and `reconcileAttempts: 5`.
- Operator inspects: does the partner know? Did they retry and create
  a duplicate booking?
- If duplicate: operator cancels the orphan AWB manually (out-of-band
  with carrier support) and marks the entry "Acknowledged" on the
  dashboard.

---

## Drill 8 — Compensation failure

The terminal failure mode. Booking succeeded at carrier, but a later
saga step (e.g., label fetch) failed, AND the compensating cancel call
also failed.

**Setup**

- Partner `partner_drill_8`.
- Inject failure into the saga's label step AND set the cancel call
  to fail.

**Observe**

- Saga records `compensation_failed` status.
- Shipment stays in `awaiting_compensation` state.
- Surfaces immediately in `/b2b/operations` "Compensation Failed
  Queue" with severity `critical`.

**Verify**

- Page is fired (per alert config).
- Saga's checkpoint store has the full step history for forensics.

**Recovery — operator action required**

1. Open the shipment in `/b2b/operations`.
2. Inspect saga checkpoint (the "Saga Diagnostics" panel on the
   shipment details page).
3. Manually cancel the orphan AWB via carrier support.
4. Click "Acknowledge Compensation" on the queue entry — this writes a
   resolution note and clears the flag.

This is the only failure mode that *requires* human intervention. Every
other mode self-heals.

---

## Drill 9 — Replay-after-crash

Simulates the platform crashing mid-saga. Tests that the saga checkpoint
store correctly resumes.

**Setup**

- Partner `partner_drill_9`.
- A way to kill the booking process partway through (in production
  this is a Vercel function timeout — 30 s default).

**Inject**

1. Issue a booking with a saga that we'll interrupt.
2. After the `book_courier` step succeeds but before
   `persist_projection` lands, kill the process.

**Observe**

- The carrier has issued an AWB.
- The saga checkpoint has `book_courier: completed`,
  subsequent steps: pending.
- The shipment doc may or may not exist depending on which step landed
  first.

**Verify recovery (one of):**

- **Same idempotency key re-issued**: saga loads checkpoint, resumes
  from the first incomplete step. Final result: `booked`.
- **No retry, cron picks it up**: a saga-resume cron (if implemented)
  would pick up stuck sagas. (NOTE: current platform does not have a
  saga-resume cron — the `BookingReconciler` only handles
  indeterminate bookings. A truly-stuck-mid-saga shipment requires
  manual replay via the operator UI.)

---

## Drill 10 — Manual reconciliation flow

Validates that an operator can resolve an issue purely through the
admin UI without database access.

**Setup**

- Partner `partner_drill_10`.
- Produce a shipment in the Reconciliation Queue by running Drill 1.

**Operator workflow**

1. Open `/b2b/operations`.
2. Click the entry in the Reconciliation Queue.
3. Inspect saga diagnostics: which step failed, when, why.
4. Choose:
   - **Retry now** — forces an immediate `lookupByReference` + cancel
     attempt.
   - **Mark as no-orphan** — operator has confirmed (via carrier
     support) that no AWB was created; clears the flag.
   - **Mark as orphan-cancelled-externally** — operator has cancelled
     manually; clears the flag with that resolution code.

**Verify**

- The shipment exits the queue.
- A `reconciliation_resolved` event is appended to the events
  subcollection with the operator's `userId`.
- The dashboard refreshes.

---

## Quick-reference: failure mode → recovery path

| Failure | Auto-recovery | Operator action required? |
|---|---|---|
| Booking timeout, no carrier AWB | Reconciler abandons after 5 attempts; shipment stays cancelled | No |
| Booking timeout, carrier AWB exists | Reconciler finds + cancels orphan | No |
| Webhook timeout | Carrier retries; dedup handles duplicates | No |
| Carrier 5xx burst | Circuit breaker opens; recovers when carrier heals | No |
| Slow polling | Subsequent cron runs catch up | No (alert if sustained) |
| Label generation delay | Retrieve-labels cron handles it | No (alert if > 30 min) |
| Cancel-after-pickup attempted | API rejects with 409 | No |
| Compensation failure | None | **Yes — operator must intervene** |
| Saga interrupted mid-flight | Replay-on-retry handles same-key requests | Only if no retry comes in |
