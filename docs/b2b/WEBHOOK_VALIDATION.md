# B2B Webhook Validation Guide

Webhook validation is harder than it looks. Carrier docs are usually
wrong about something — header casing, body charset, signature
encoding, payload field naming. This document describes the procedure
that catches those gaps *before* production traffic exposes them.

The webhook receiver lives at:
[src/app/api/v1/b2b/webhooks/courier/[courier]/route.ts](../../src/app/api/v1/b2b/webhooks/courier/[courier]/route.ts).
It reads `req.text()` (raw bytes), runs the carrier-specific
`verifySignature`, then parses + ingests events. Always 2xx after the
signature check; per-event failures are recoverable via polling.

---

## 1. Validation philosophy

1. **Capture before parsing.** First-time webhook arrivals are captured
   to disk as raw bytes + raw headers, before any code touches them.
   The first source of truth is what the carrier actually sent, not
   what we hope they sent.
2. **Verify signature off-line first.** Run the captured fixture
   through `verify-webhook-signature.mjs` with the partner's secret
   *before* enabling signature verification in the application. Catches
   header-casing and body-encoding mismatches without losing real traffic.
3. **Replay everything.** Replay a captured fixture against a staging
   host with `replay-webhook.mjs`. Confirms the platform handles it
   end-to-end.
4. **Replay it twice.** Same fixture, same signature, two sends —
   second should produce `outcome: 'duplicate'` for every event. This
   is the canary for dedup-key correctness.
5. **Mutate and replay.** Toggle one byte in the body, recompute the
   signature, send. Confirms our handler accepts the new signature
   (i.e., we sign against the body the carrier sent, not a normalization).
6. **Garbage and replay.** Send a malformed body with a valid signature
   — confirm 400. Send a valid body with a bad signature — confirm 401.

---

## 2. Capture harness

`scripts/capture-webhook.mjs` runs a local HTTP listener that captures
incoming webhooks to disk and *optionally* forwards them on.

### Usage

```bash
PORT=4099 CARRIER=bluedart \
  CAPTURE_DIR=test/fixtures/carriers/bluedart/captured \
  node scripts/capture-webhook.mjs
```

Captured files: `<timestamp>-<random>.json` with shape:

```json
{
  "method": "POST",
  "url": "/api/v1/b2b/webhooks/courier/bluedart?partner=test_partner_validation",
  "headers": { "...": "..." },
  "rawBody": "<base64 of the exact request body bytes>",
  "receivedAt": "2026-05-15T10:00:00.000Z"
}
```

To make the harness reachable from the carrier, you'll need either:

- A staging deployment with this script running, or
- A tunnel like `ngrok http 4099` for sandbox use (never for production)

### Forwarding

To also forward to a real B2B endpoint (useful when capturing during
sandbox UAT against a deployed env):

```bash
PORT=4099 CARRIER=bluedart \
  CAPTURE_DIR=test/fixtures/carriers/bluedart/captured \
  FORWARD_TO=https://staging.blujaylogistic.com \
  node scripts/capture-webhook.mjs
```

Forward preserves all headers and the exact body bytes, so the
downstream signature check still passes.

---

## 3. Offline signature verification

`scripts/verify-webhook-signature.mjs` reads a captured fixture and
recomputes the expected signature given a secret.

### Usage

```bash
node scripts/verify-webhook-signature.mjs \
  --fixture test/fixtures/carriers/bluedart/captured/20260515-abc.json \
  --carrier bluedart \
  --secret whsec_xxxxxxxxxxxxxxxxx
```

Output:

```
provided  : 7f8e3a91...
expected  : 7f8e3a91...
match     : true
header    : X-BD-Signature
algorithm : HMAC-SHA256
encoding  : hex
```

Use this *before* configuring signature verification in production. If
match is false, look at:
- header casing (`X-BD-Signature` vs `x-bd-signature`)
- encoding (hex vs base64)
- body bytes (did anything between carrier and us mangle the body?)

---

## 4. Replay harness

`scripts/replay-webhook.mjs` POSTs a captured fixture to a target host,
optionally re-signing.

### Usage

```bash
# Replay verbatim — same headers, same body bytes, same signature.
# Use this for duplicate-detection testing on the deployed handler.
node scripts/replay-webhook.mjs \
  --fixture test/fixtures/carriers/bluedart/captured/20260515-abc.json \
  --target https://staging.blujaylogistic.com

# Re-sign with a different secret — useful for testing rotated secrets
# against a sandbox endpoint.
node scripts/replay-webhook.mjs \
  --fixture ... \
  --target ... \
  --resign-secret whsec_new_secret \
  --carrier bluedart
```

Output:

```
target  : https://staging.blujaylogistic.com
status  : 200
body    : { "data": { "processed": 1, "applied": 1, ... } }
duration: 142ms
```

---

## 5. Test matrix

Before signing off on a carrier's webhook integration, every cell below
should be green for each enabled status transition.

| # | Test | Expected outcome |
|---|---|---|
| 1 | Capture a live sandbox event | Fixture saved, headers + body intact |
| 2 | Offline verify the captured signature | `match: true` |
| 3 | Replay the captured fixture (same signature) | First: `applied`. Second: `duplicate` |
| 4 | Re-sign with the *wrong* secret and replay | 401 `authentication_failed` |
| 5 | Replay with a truncated body (last byte removed) | 400 `invalid_request` (JSON parse fail) OR 401 (signature mismatch) — both acceptable |
| 6 | Replay with a payload claiming an unknown AWB | 200, but per-event result is `skipped: true, reason: 'shipment_not_found'` |
| 7 | Send a *stale* event (occurredAt < current shipment's lastEventAt) | 200, `outcome: 'no_change', reason: 'stale_by_rank'` |
| 8 | Send a same-status event (different rawCode, future timestamp) | 200, `outcome: 'no_change', reason: 'same_status'` |
| 9 | Send a batch of 5 events for the same shipment in one POST | All 5 ingested in single round-trip, `applied: 5` |
| 10 | Send a batch where one event has a malformed shape | Other events still ingest, malformed one contributes to `failed:` count, response still 200 |

---

## 6. Persisting fixtures for regression tests

Captured fixtures become the input to regression tests in
`src/services/b2b/couriers/<carrier>/__tests__/eventMap.test.ts` and
similar.

Workflow:

1. Capture during sandbox UAT.
2. **Sanitize**: `node scripts/sanitize-fixture.mjs <fixture>` redacts
   AWBs, phone numbers, addresses, names, and the partner secret.
3. Commit to `test/fixtures/carriers/<carrier>/<status>.json` with a
   descriptive name (e.g. `bluedart/picked_up.json`, `delhivery/rto_initiated.json`).
4. Reference from the eventMap test:

   ```ts
   import fx from '@/../test/fixtures/carriers/bluedart/picked_up.json';
   it('parses a real picked_up event', () => {
       const events = adapter.parseWebhook(JSON.parse(fx.body));
       expect(events).toHaveLength(1);
       expect(adapter.normalize(events[0], 'sid', new Date()).type)
           .toBe('shipment.picked_up');
   });
   ```

Fixture file format (after sanitization):

```json
{
  "carrier": "bluedart",
  "capturedAt": "2026-05-15T10:00:00Z",
  "headers": {
    "content-type": "application/json",
    "x-bd-signature": "<recomputed against sanitized body>"
  },
  "body": "{\"awbNo\":\"AWB-FIXTURE-1\",...}",
  "notes": "Optional human notes about what this fixture demonstrates"
}
```

Note: after sanitization the original signature is invalid (body
changed). The sanitization script recomputes against a fixture-specific
secret (`whsec_fixture`) so replay works in test-only contexts.

---

## 7. Production webhook hygiene

Once a carrier is live:

- **Log every signature failure** at WARN with source IP and carrier.
  Sustained failures from non-allowlist IPs suggest a leak.
- **Rotate webhook secrets** every 90 days. Coordinate with carrier
  support — most can update with no downtime if given 24 h notice.
- **Track webhook latency** (carrier scan time → our `receivedAt`). If
  the P50 drifts > 30 s above baseline for > 1 h, page someone — the
  carrier is queueing webhooks, which means polling is now load-bearing.
- **Track per-event applied/skipped/failed ratios** by carrier. Any
  carrier whose `failed:` ratio exceeds 1% over an hour is broken.

The values above are tracked by the `webhook batch ingested` structured
log line at [route.ts:146](../../src/app/api/v1/b2b/webhooks/courier/[courier]/route.ts#L146).
Wire a log-drain rule to surface them.
