# B2B Platform — Operational Runbook

This doc is indexed by **symptom**, not component. Search by what the partner is reporting or what you're seeing in the dashboard.

Every entry follows the same structure:

> **Symptom** — what the user (partner / operator) reports or what you see
> **Diagnosis** — where to look first
> **Resolution** — exact steps
> **Verification** — how to confirm it's fixed

---

## Where to find things

| What | Where |
|---|---|
| Operations dashboard | `/b2b/operations` |
| Shipment list | `/b2b/shipments` |
| Shipment details | `/b2b/shipments/[id]` |
| API key admin | `/b2b/api-keys` |
| Vercel logs | Vercel project → Logs tab |
| Cron firings | Vercel project → Crons tab |
| Firestore data | Firebase console → Firestore |
| Storage labels | Firebase console → Storage → `b2b-labels/` |
| Saga state | Firestore → `b2b_sagas/book::{partnerId}::{idempotencyKey}` |

---

## 1. Partner reports "booking failed but I see no response"

### Diagnosis

The booking saga either crashed mid-execution or the response never reached the partner. Determine which by looking at the saga state.

1. Get the partner's idempotency key from their logs.
2. Firebase console → Firestore → `b2b_sagas` → search for `book::{partnerId}::{idempotencyKey}`.
   - **Doc exists, `status: completed`** → the platform successfully booked. The partner just lost the response in transit. Direct them to `GET /api/v1/b2b/shipments/{shipmentId}` to retrieve.
   - **Doc exists, `status: compensated`** → booking failed cleanly. Check `error` field. Tell partner to retry (their idempotency record will TTL out).
   - **Doc exists, `status: compensation_failed`** → see incident #4.
   - **No doc** → the request never reached the booking saga (HTTP rejected first). Check Vercel logs for the request id.

### Resolution

Common paths:

```
status: completed   → partner reads GET /api/v1/b2b/shipments/{id} or via dashboard
status: compensated → partner retries with a NEW idempotency key
no saga doc        → check Vercel logs for the request id; partner may have got 401/422
```

### Verification

Visit `/b2b/shipments` → search by partner's external ref or AWB. Shipment row appears with current status.

---

## 2. Partner reports "tracking shows stale data"

### Diagnosis

Tracking sync runs every 5 min. Stale data means either: events aren't being received (webhook or polling broken), or events are being received but not applied.

1. Open `/b2b/shipments/{id}` → look at the **Timeline** section. When was the last event received?
2. Check **Raw events** section — are recent carrier events being recorded but with `applied: false`?
3. Check Vercel logs:

```
filter: scope:b2b.tracking.polling AND shipmentId:{id}
```

### Resolution

| Last event time | What to do |
|---|---|
| <10 min ago | Working fine; partner's cache may be stale |
| 10 min — 1 hr | One polling cycle missed; check operations dashboard for circuit-open log entries |
| 1 hr — 24 hr | Carrier outage likely; check `/b2b/operations` Carrier Health panel |
| >24 hr, status non-terminal | Shipment is stuck; see #3 |

### Verification

After resolution, force a poll cycle:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
    https://<host>/api/cron/poll-tracking
```

Refresh `/b2b/shipments/{id}` — new events should appear within 30 seconds.

---

## 3. Shipment stuck in_transit for >5 days

### Diagnosis

The carrier hasn't sent a new event. Either the shipment is genuinely lost or the carrier integration is broken for this AWB.

1. `/b2b/shipments/{id}` → check **Operational Status Panel**.
2. Verify on the carrier's own tracking page (`https://bluedart.com/tracking/{awb}` or similar) — does the carrier see the shipment?

### Resolution

| Carrier sees the shipment | What to do |
|---|---|
| Carrier shows delivered | The carrier never sent us a delivered event. Manually progress via `/b2b/shipments/{id}/update` → "Delivered". |
| Carrier shows still in transit | Wait; this is genuinely just slow. Note for partner. |
| Carrier shows lost / not found | Check the carrier's customer service. Once confirmed lost, use **Actions Panel** → push manual `mark_lost` event with note. |

### Verification

`/b2b/shipments/{id}` status updates to the corrected state; timeline shows the manual event with `source: admin_ui` or `source: system`.

---

## 4. Compensation-failed saga in operations dashboard

### Diagnosis

Booking saga tried to roll back side-effects and one of the compensations threw. State is inconsistent between Blujay and the carrier. **No automation will fix this.**

1. `/b2b/operations` → Compensation-failed sagas section.
2. Read the `error` field. Most common: the `book_courier` compensation tried to cancel the carrier-side AWB and the cancel call itself failed.

### Resolution

```
Goal: bring Blujay state and carrier state back into alignment.
```

1. **Identify the carrier AWB** (from the saga state JSON or from the partner shipment doc).
2. **Manually cancel at the carrier** — log into the carrier's portal or call their support line.
3. **Acknowledge the saga** via the operations dashboard → "Acknowledge" button → note the manual cancel reference number.
4. **If the saga left the shipment in a wrong status** (e.g. partially booked), use **Shipment Details → Actions → Push manual event** with `correct_status` to align our state.

### Verification

`/b2b/operations` → Compensation-failed list shows the item with the acknowledgement note. The shipment doc in `/b2b/shipments/{id}` is in the expected terminal state.

The dashboard still surfaces the item until it's manually corrected to a clean state. That's intentional — keeps audit visible.

---

## 5. Dead-letter queue is growing

### Diagnosis

Effect jobs (typically partner outbound webhooks or billing dispatches) are exhausting their retries. Either the downstream is permanently down or the payload is malformed.

1. `/b2b/operations` → Dead-letter jobs section.
2. Look at the `topic` field — `b2b.effect.emit_partner_webhook` is the most common. Other topics indicate specific subsystems.
3. Look at `lastError` — distinguishes "downstream rejected" (permanent) from "downstream timeout" (transient).

### Resolution

| Pattern | Action |
|---|---|
| One partner's webhook URL is down | Wait for them to fix it. Once their URL is back, click "Retry" on their jobs. |
| Webhook signature mismatch (HTTP 401 from partner) | Check the partner's signing secret in their integrations config. Fix, retry. |
| Job payload is malformed | Investigate the source effect; this is a code bug. File a ticket. Once fixed in a deploy, retry the dead-lettered jobs. |
| Single-shot weirdness | Retry individually. |

For bulk retries, use the operations UI one-by-one. For mass retry (10+ jobs of the same topic), reset them in Firestore directly:

```
Firebase console → Firestore → b2b_jobs
Filter: topic == "b2b.effect.emit_partner_webhook" AND deadLetter == true
For each: edit doc → status: pending, deadLetter: false, attempts: 0, runAt: Timestamp.now()
```

### Verification

`/b2b/operations` → Dead-letter queue count drops. Vercel logs show the retried jobs running. Partner confirms webhook delivery.

---

## 6. Carrier API outage detected

### Diagnosis

Look at `/b2b/operations` → Carrier Health panel. Elevated counts in *Stuck (≥3d)* or *Awaiting reconcile* for one specific carrier indicate degraded performance.

Confirm via Vercel logs:

```
filter: errorCode:"CourierError" AND courier:{name} AND category:transient
```

A spike of transient errors over the last hour is a strong signal.

### Resolution

The platform's circuit breakers auto-trip per-process per-(courier, operation) after 5 transient failures in a 60s window. They'll auto-recover after 30s and probe. **In most cases, no action needed.**

If the outage extends >2 hours and partner traffic is being rejected:

1. Confirm with the carrier's status page or support.
2. Consider pausing bookings for that carrier (see #10).
3. Notify affected partners.
4. The polling worker continues running; it'll resync events when the carrier returns.

### Verification

Carrier Health panel returns to nominal. Vercel logs show successful carrier calls. Stuck-shipment count drops over the following days.

---

## 7. Partner reports "API key isn't working"

### Diagnosis

Could be: expired, revoked, disabled, wrong scope, or a copy-paste error (missing characters).

1. Get the **key prefix** from the partner (the first 11 chars: `bj_xxxxxxxx`).
2. `/b2b/api-keys` → filter by prefix or partner id.

### Resolution

| Key state | What to do |
|---|---|
| Revoked | Mint a new one (see #9). Document why the old one was revoked. |
| Disabled | Click "Re-enable" if appropriate. |
| Expired | Mint a new one. Old keys with expiry must be renewed. |
| Active, last used "never" | Partner is sending it wrong. Verify header format: `Authorization: Bearer bj_…` or `X-Blujay-Api-Key: bj_…` (no quotes, no extra whitespace). |
| Active, last used recently | The key is fine. Probably partner is hitting the wrong endpoint or sending bad data — check Vercel logs for their request. |

### Verification

Vercel logs:

```
filter: scope:b2b.* AND partnerId:{partnerId}
```

Should show successful auth in the requested time window.

---

## 8. API key compromised — emergency revocation

### Resolution

```
1. /b2b/api-keys → find the key by prefix
2. Click "Revoke" → enter reason → "Revoke permanently"
3. Notify the partner immediately
4. Mint a replacement (see #9), share via the partner's secure channel
```

### Verification

The next API request using the old key returns 401. Confirm in Vercel logs:

```
filter: scope:b2b.auth AND apiKeyId:{id} AND status:401
```

---

## 9. Minting an API key for a new (or returning) partner

### Resolution

```
1. /b2b/api-keys → "New API key"
2. Partner ID: matches a row in the `partners` collection
3. Label: descriptive (e.g. "Acme — production")
4. Environment: production or sandbox
5. Expiry: usually leave blank; set if rotating
6. "Create key"
7. Copy the raw key from the reveal screen
8. Send to partner via password manager / secure channel (NEVER email plain)
9. Tick "I've saved this securely" → close dialog
```

The reveal screen warns before close if you haven't ticked the confirmation.

### Verification

Test the key:

```bash
curl -X POST -H "Authorization: Bearer <new-key>" https://<host>/api/v1/b2b/rates …
# → expect 200 or 422 (depending on body), NOT 401
```

---

## 10. Pausing bookings for a specific carrier

There is no runtime kill switch for individual carriers yet. The workaround:

### Resolution

1. Edit `src/services/b2b/couriers/register.ts`
2. Comment out the relevant `registerCourierAdapter(...)` and `registerCourierWebhookHandler(...)` calls for the carrier
3. Commit + `vercel --prod`

This stops new bookings to that carrier (`QuoteEngine.listAdapters()` won't return it; the booking saga's `getAdapter()` returns null and the saga fails fast with `no_carrier_eligible`).

Existing shipments at that carrier continue to receive events (the webhook receiver still parses them) but `pollStatus` calls become no-ops (the polling worker skips carriers with no adapter).

### Verification

`/b2b/operations` → Carrier Health panel — the paused carrier disappears. New booking attempts return `no_carrier_eligible` for that carrier.

To re-enable: revert the commit and redeploy.

---

## 11. Cron jobs aren't firing

### Diagnosis

Vercel cron failures appear in the project dashboard → Crons tab. Each cron entry shows its last invocation time + result code.

| Symptom | Cause |
|---|---|
| Cron tab is empty | `vercel.json` not deployed; verify the file is at repo root and was included in the build |
| Cron entries listed but "Last execution: Never" | Cron schedules don't apply until the *next* matching tick after deploy. Wait the cycle. |
| Cron entries firing but returning 401 | `CRON_SECRET` env var is missing or different from what's in the route handler |
| Cron entries firing 500 | Route handler error — check Vercel logs at the matching timestamps |

### Resolution

```bash
# Manual fire to verify auth + route work
curl -X POST \
    -H "Authorization: Bearer $CRON_SECRET" \
    https://<host>/api/cron/poll-tracking
# → expect 200 with summary
```

If manual works but scheduled doesn't, Vercel cron is misconfigured. Re-deploy `vercel.json`.

### Verification

Wait one full cycle (5 min for polling). Vercel Crons tab → entry shows "Last execution" within the last 5 min with status 200.

---

## 12. Restoring data from a Firestore export

See `FIREBASE.md` § Backup & export — restore procedure. This is a high-stakes operation; **always**:

1. Coordinate with the team via incident channel
2. Take a fresh export first (so you can re-restore if the older export is wrong)
3. Pause writes (disable Vercel cron entries; return 503 from POST routes via env-flag if you have one)
4. Run the import
5. Verify with smoke queries
6. Re-enable writes
7. Monitor logs for the first hour

---

## 13. Alerting thresholds (recommended)

If you have a log aggregator (Datadog / Logflare / Logtail), wire alerts on these queries. Default fire when threshold breached for ≥10 min.

| Severity | Query | Threshold |
|---|---|---|
| Page someone | `b2b_sagas WHERE status:compensation_failed` count | > 0 |
| Page someone | `b2b_jobs WHERE deadLetter:true AND status:dead_lettered` count | > 5 |
| Notify on-call | `level:error AND scope:b2b.*` count over 5 min | > 20 |
| Notify on-call | Cron run summary `applied:0 AND polled:>0` | for any cron, indicates 100% failure |
| Slack channel | `level:warn AND message:"circuit open"` | > 0 |
| Slack channel | Partner outbound webhook 5xx rate | > 10% over 1 hr |

These thresholds are starting points; adjust based on your partner volume.

---

## 14. Secret rotation

### B2B_QUOTE_TOKEN_SECRET

Tokens are 5-minute TTL by default. Rotation procedure:

1. Generate new value: `openssl rand -hex 32`
2. Set in Vercel production env
3. Redeploy
4. Old tokens issued before redeploy will return `bad_signature` (which the API surfaces as 400). The 5-minute window means any partner using a token they fetched <5 min before rotation will see one bad request, then succeed on re-quote.

No coordination with partners required. Plan rotation during low-traffic hours.

### CRON_SECRET

Vercel automatically injects the env var into cron requests. Rotation:

1. Generate new value
2. Set in Vercel production env
3. Redeploy — Vercel uses the new value immediately for the next scheduled run
4. Manual cron calls using the old secret return 401 — update any external monitoring scripts

### FIREBASE_SERVICE_ACCOUNT_KEY

Generate a new service account in Firebase console, set env var, redeploy. Then **delete the old service account** (Firebase console → Project settings → Service accounts → "Manage all service accounts"). This is the only true rotation; the new key alone doesn't invalidate the old.

### Carrier API credentials

Per-partner credentials live in Firestore (`partners/{id}/courierIntegrations.{courier}`, encrypted via `courierCredCrypto`). To rotate:

1. Partner generates a new credential at the carrier
2. Update via partner's integration UI (or directly in Firestore)
3. Old credentials become inactive on the partner's side; carrier API calls start using new ones automatically (next call after the Firestore write)

---

## 15. Quick diagnostic queries

Drop these into Vercel log search / your log aggregator for fast triage.

```
# Recent booking outcomes
filter: scope:api.v1.b2b.shipments AND outcome:*
sort: time desc

# Recent carrier failures
filter: scope:b2b.couriers.http AND level:warn
sort: time desc

# Polling worker summaries
filter: scope:b2b.tracking.polling AND message:"polling run complete"
sort: time desc

# Authority gate blocks (hybrid mode mostly)
filter: appliedReason:authority_blocked_*

# Idempotency replays
filter: message:"idempotency replay"
```
