# B2B Production Rollout Checklist

This is the operational playbook for taking the B2B platform — or any
new carrier / partner — from sandbox to full production. Phased, with
explicit gates between phases. No phase is skippable.

Companion docs:
- [DEPLOYMENT.md](DEPLOYMENT.md) — infrastructure deploy
- [FAILURE_DRILLS.md](FAILURE_DRILLS.md) — drills referenced in gates
- [WEBHOOK_VALIDATION.md](WEBHOOK_VALIDATION.md) — webhook procedures
- [carriers/README.md](carriers/README.md) — operational thresholds
- [RUNBOOK.md](RUNBOOK.md) — incident workflows

---

## Phase 0 — Pre-flight (before any production traffic)

Before any production partner is enabled.

### Infrastructure

- [ ] Production Firebase project provisioned, security rules deployed
- [ ] Firestore composite indexes built (see `firestore.indexes.json` — 13 indexes)
- [ ] All env vars set on Vercel (see `.env.example`):
  - [ ] `BLUJAY_LICENSE_KEY`
  - [ ] `B2B_QUOTE_TOKEN_SECRET` (rotated quarterly — record date)
  - [ ] `CRON_SECRET`
  - [ ] `FIREBASE_SERVICE_ACCOUNT_KEY`
  - [ ] `NEXT_PUBLIC_APP_URL`
- [ ] Cron schedules in `vercel.json` deployed and visible in Vercel dashboard
- [ ] `scripts/validate-b2b-env.mjs` passes against production env

### Application

- [ ] All unit tests pass (`npx vitest run`)
- [ ] All integration tests pass (`npx vitest --config=vitest.integration.config.ts`)
- [ ] HTTP smoke passes against production (`scripts/smoke-b2b.mjs`)
- [ ] Rollout smoke passes (`scripts/rollout-smoke.mjs`)

### Operational

- [ ] On-call rotation defined in PagerDuty/Opsgenie
- [ ] Alert routes wired per [carriers/README.md → alert recommendations](carriers/README.md#production-alert-recommendations)
- [ ] Escalation matrix documented (see §Escalation below)
- [ ] `/b2b/operations` dashboard accessible to all on-call engineers
- [ ] Runbook bookmarks distributed to on-call

---

## Phase 1 — Sandbox validation (per carrier)

Per carrier (BlueDart, Delhivery, DTDC), execute the carrier's runbook
end-to-end against sandbox.

### Gate to advance

- [ ] Every section of the carrier's runbook executed and passed
- [ ] At least 50 sandbox bookings over a 48 h window (catches
      time-of-day variations)
- [ ] At least 3 of each failure drill (1–7 in FAILURE_DRILLS.md) passed
- [ ] Webhook signature verification confirmed via offline harness
- [ ] At least 5 captured webhook fixtures committed to
      `test/fixtures/carriers/<carrier>/`

### Sign-off

- [ ] Engineering lead signs off in the carrier's `Observed deviations` log

---

## Phase 2 — Limited production (1 partner)

The first real partner. Choose a partner with:

- Low shipment volume (< 50 / day)
- Engineering contact on their side (for fast issue triage)
- Tolerance for early-rollout glitches (this should be agreed in writing)

### Setup

- [ ] Partner's production carrier credentials in
      `clients/{partnerId}/courierIntegrations.<courier>.*`
- [ ] Partner's B2B API key minted via `/b2b/api-keys`
- [ ] Webhook URL configured at carrier side, secret rotated
- [ ] Smoke against production with the new partner's key:

      ```bash
      HOST=https://blujaylogistic.com \
        B2B_API_KEY=bj_<partner-key> \
        node scripts/smoke-b2b.mjs
      ```

### Day-1 monitoring

For the first **24 h** of production traffic, monitor in real-time:

- [ ] Webhook 401 rate (should be 0 outside of the carrier's IPs)
- [ ] Booking success rate (should be > 95%)
- [ ] Label success rate within 5 min of booking (> 90%)
- [ ] Reconciliation queue depth (should stay < 5)
- [ ] No compensation failures

### Gate to advance to Phase 3

- [ ] 7 days of clean production traffic from the limited partner
- [ ] Zero compensation failures
- [ ] Zero unresolved reconciliation queue items
- [ ] Operator UI used at least once for a real shipment lookup
- [ ] Partner sign-off

---

## Phase 3 — Expanded production (5–10 partners)

Add partners in batches of 1–2, with at least 48 h between additions.

### Per-partner onboarding

For each new partner:

- [ ] Carrier credentials configured
- [ ] B2B API key minted, partner notified
- [ ] Webhook configured + verified
- [ ] First-shipment smoke run by the partner with our oversight
- [ ] Their integration tested with their own retry logic (we don't
      control their client; confirm idempotency is exercised correctly
      from their side)

### Gate to advance to Phase 4

- [ ] 14 days of clean production traffic across all Phase 3 partners
- [ ] Combined volume ≥ 500 shipments / day
- [ ] At least 2 partners through the full lifecycle
      (book → track → delivered) at production scale
- [ ] At least one real-world incident (any severity) handled cleanly
      via the runbook
- [ ] No regressions in alert metrics (see [carriers/README.md → alerts](carriers/README.md#production-alert-recommendations))

---

## Phase 4 — Full production (open onboarding)

Open the platform to general partner onboarding.

- [ ] Partner self-service onboarding flow documented
- [ ] Sales/customer-success team trained on `/b2b/operations`
- [ ] SLAs published and committed
- [ ] All carriers passed Phase 1 (no carrier should be production-enabled
      without sandbox validation)

---

## Rollback triggers

Any of the following triggers an **immediate rollback** to the previous
phase (or to full disable of the affected carrier/partner). Don't wait
for root-cause analysis — restore the prior state, then investigate.

| Trigger | Rollback action |
|---|---|
| > 1 compensation failure in 1 h | Disable the partner; investigate before re-enabling |
| > 5% booking failure rate sustained 15 min | Open the circuit breaker manually OR disable the carrier for new bookings; existing shipments continue |
| > 50 reconciliation queue items piling up | Disable bookings for that partner; reconciler continues; investigate carrier-side issue |
| Any duplicate AWB confirmed across two shipments | **Hard stop** — disable all bookings platform-wide; idempotency layer regression suspected |
| Any webhook signature secret confirmed leaked | Rotate immediately; check audit log for unauthorized use |
| `BLUJAY_LICENSE_KEY` validation fails on deploy | Roll back deploy; check Vercel env vars |

### How to rollback

**Carrier-level**: set
`clients/{partnerId}.courierIntegrations.<courier>.disabled = true` for
each affected partner. The booking service checks this flag and rejects
new bookings with `carrier_unavailable`. Existing in-flight shipments
continue.

**Platform-level**: revert the deploy via Vercel rollback. Cron jobs
continue running on the rolled-back version. The Firestore data is
forward-compatible — no migrations to undo.

**Partner-level**: set `clients/{partnerId}.b2bEnabled = false`. All
B2B API calls from that partner return 503 `service_unavailable`. Use
when a specific partner is sending malformed traffic.

---

## Monitoring checks at each gate

| Phase | Active monitoring | Passive metrics |
|---|---|---|
| 0 (pre-flight) | None (no traffic) | Vercel deploy health, env var validation |
| 1 (sandbox) | Manual — runbook drills | Log analysis only |
| 2 (limited) | Real-time dashboard watch for 24 h | All production alerts active |
| 3 (expanded) | Daily review of `/b2b/operations` queues | Weekly trend analysis |
| 4 (full) | Standard on-call rotation | Standard alerting |

Active monitoring at Phase 2 means an engineer is *literally watching*
the metrics dashboard for the first 4 h of production traffic. This is
the most important hour of the rollout.

---

## Escalation matrix

| Severity | Who | When | How |
|---|---|---|---|
| `info` | Slack channel | Logged | Async |
| `warning` | On-call engineer | Within 30 min | Paging via standard rotation |
| `critical` | On-call + tech lead | Immediate | Page + Slack DM |
| `incident` | On-call + tech lead + eng manager | Immediate | Page + bridge call |
| `regression` | Full team | Within 1 h | All-hands + incident commander |

`regression` is reserved for:
- Idempotency layer regression (duplicate AWBs)
- Compensation logic regression (multiple compensation failures)
- Security regression (auth bypass, secret leak)

---

## Pre-rollout smoke runs

Before any phase advance, run the appropriate smoke:

| Phase boundary | Smoke to run |
|---|---|
| 0 → 1 | `scripts/smoke-b2b.mjs` against sandbox |
| 1 → 2 | `scripts/smoke-b2b.mjs --crons` against production w/ a test partner |
| 2 → 3 | `scripts/rollout-smoke.mjs` against production |
| 3 → 4 | `scripts/rollout-smoke.mjs` + a 1 h synthetic-load run |

Synthetic load isn't part of this checklist (it's a follow-up step).
For Phase 3 → 4 readiness, the platform's observed real-world load
during Phase 3 substitutes.

---

## Post-rollout review

After each phase, document:

1. **What went well** — patterns to repeat.
2. **What surprised you** — write to the carrier's
   `Observed deviations` log.
3. **What needs runbook updates** — every gap a real incident exposed
   gets a paragraph added to RUNBOOK.md.

This isn't a "if we have time" thing — it's the only way the operational
documentation stays accurate. Run the review within 48 h of the phase
advance while the details are fresh.
