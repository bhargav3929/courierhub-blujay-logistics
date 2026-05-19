# B2B Carrier Validation — Overview

This directory holds the per-carrier validation runbooks plus the shared
operational reference below. Run these before onboarding any new carrier
account to production, and re-run the relevant sections after any
carrier-side config change (new pickup location, new service type, new
account number).

| Carrier | Runbook | Webhook signature scheme | Polling support |
|---|---|---|---|
| BlueDart | [BLUEDART.md](BLUEDART.md) | HMAC-SHA256 over raw body in `X-BD-Signature` | Yes (Track & Trace API) |
| Delhivery | [DELHIVERY.md](DELHIVERY.md) | HMAC-SHA256 in `X-Delhivery-Signature` OR `partner_token` query param | Yes (Track API) |
| DTDC | [DTDC.md](DTDC.md) | Static per-partner token in `x-dtdc-token` | Yes (Track API) |

## Operational principles

1. **Sandbox is mandatory.** Every carrier runbook starts in sandbox. No
   production account is enabled until every drill in the per-carrier
   runbook passes against sandbox.
2. **Raw bytes are authoritative.** Webhook signatures are over the
   request body byte sequence. Re-encoded JSON breaks verification.
3. **Carrier docs lie or omit.** Each runbook has an **Observed
   deviations** section. Populate it during sandbox validation, not
   later.
4. **Don't validate in production with real customer shipments.** All
   sandbox / limited rollout drills use the dedicated test partner
   (`test_partner_validation`) so cleanup is one delete.

---

## Recommended timeouts & retry budgets

These values are baked into the carrier adapters (see
`src/services/b2b/couriers/shared/httpClient.ts` and the per-carrier
adapters in `src/services/b2b/couriers/<courier>/`). Override per-partner
only when carrier support explicitly recommends a different value.

| Operation | Connect timeout | Read timeout | Max attempts | Backoff |
|---|---|---|---|---|
| `book` | 5 s | 25 s | 1 (per booking attempt — saga handles retries) | n/a — booking is single-shot then reconciles |
| `quote` | 3 s | 8 s | 2 | 250 ms, 1 s |
| `cancel` | 5 s | 15 s | 3 | 500 ms, 2 s, 8 s |
| `generateLabel` | 5 s | 30 s | 2 | 1 s, 5 s |
| `pollStatus` | 3 s | 10 s | 2 | 500 ms, 2 s |
| `lookupByReference` | 5 s | 15 s | 1 (saga-driven; re-attempted by `BookingReconciler` with own schedule) | n/a |

Booking is special: the saga records an indeterminate outcome on
timeout and lets `BookingReconciler` (5 / 15 / 60 / 360 / 1440 min
backoff, max 5 attempts) handle the resolution. Do not add ad-hoc
retries inside the booking call path — they undermine the saga's
duplicate-prevention guarantee.

---

## Webhook IP allowlist

Each carrier publishes (or, for DTDC, can be persuaded to share on
support request) a set of source IPs from which webhooks originate. The
B2B platform does **not** currently enforce an IP allowlist at the
application layer — signature verification is the gate — but the
recommended deployment posture is:

- Place an allowlist rule at the edge (Vercel firewall, Cloudflare WAF, or
  upstream LB) for `/api/v1/b2b/webhooks/courier/*`.
- Keep the application-layer signature check as a defense-in-depth layer.
- Log every signature failure at WARN with the source IP — sustained
  signature failures from non-allowlist IPs indicate either a leaked
  secret or a misdirected webhook.

IP ranges to confirm with each carrier during onboarding:

| Carrier | Source |
|---|---|
| BlueDart | Account manager — they publish per-region NAT egress IPs |
| Delhivery | Documented in their developer portal under "Webhook firewall" |
| DTDC | Support ticket — not publicly documented; ranges change ~quarterly |

Record the confirmed IPs in the partner's `clients/{partnerId}/notes`
field along with the date.

---

## Production alert recommendations

Wire these to whatever paging system your operations team uses (PagerDuty,
Opsgenie, etc.). All thresholds assume a steady-state baseline; tune
after one week of production traffic.

| Signal | Threshold | Severity | What it usually means |
|---|---|---|---|
| Webhook 401s per minute per courier | > 3 | warning | Leaked secret, misconfigured partner, or carrier-side outage rerouting traffic |
| Reconciliation queue depth | > 50 OR any item past 4 attempts | critical | Carrier is silently dropping bookings — page |
| Booking saga `compensation_failed` | any | critical | Manual intervention required via `/b2b/operations` |
| Label retrieval failures over 1h | > 10% of bookings | warning | Carrier label service degraded |
| Polling worker error rate | > 20% | warning | Carrier track API degraded or credentials rotated without notice |
| Per-carrier 5xx rate over 15m | > 30% | warning | Carrier outage — circuit breaker should be open |
| Per-carrier circuit-breaker open | > 5 min | critical | Confirm carrier-side; consider failover messaging |

Alerts on the warning tier should land in a chatops channel for triage;
critical tier should page.

---

## Payload drift log

Carriers change wire formats without notice. Every time the platform
observes a payload field it didn't expect, append a line to
`docs/b2b/carriers/PAYLOAD_DRIFT.md` (created the first time it
happens). Each line:

```
YYYY-MM-DD | <carrier> | <operation> | <field> | <observed value> | <action taken>
```

Action is one of: `ignored` (field doesn't affect normalization),
`added-to-adapter` (parser updated), `flagged-for-support` (escalated to
carrier with reference number).

This log is the institutional memory that prevents a future engineer
from staring at a regression-test failure and asking "wait, when did
they start sending *that*?".

---

## Fixture storage

Sanitized real-world payloads live under
`test/fixtures/carriers/<courier>/`. See
`test/fixtures/carriers/README.md` for the redaction protocol. These
fixtures back the per-carrier unit tests in
`src/services/b2b/couriers/<courier>/__tests__/` and the webhook replay
harness.

Never commit a payload that contains:
- A real AWB / waybill number (replace with `AWB-FIXTURE-<random>`)
- A real consignee name, phone, or address
- A real pickup location code
- A real account number / customer code
- The shared HMAC secret

The redaction script `scripts/sanitize-fixture.mjs` (see
WEBHOOK_VALIDATION.md) automates this.

---

## Rollout smoke

After every production deploy that touches carrier code, run:

```bash
HOST=https://blujaylogistic.com B2B_API_KEY=bj_<production-test-key> \
  node scripts/rollout-smoke.mjs
```

Unlike `smoke-b2b.mjs` (the developer smoke), `rollout-smoke.mjs`:
- runs against a dedicated `partner_smoke` account
- asserts alert-relevant metrics are in baseline range
- exercises the circuit-breaker recovery path
- triggers a reconciler dry-run

See PRODUCTION_ROLLOUT.md for the full sequence.
