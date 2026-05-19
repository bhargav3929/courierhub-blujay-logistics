# DTDC — Validation Runbook

Companion adapter: [src/services/b2b/couriers/dtdc/](../../../src/services/b2b/couriers/dtdc/)
Webhook handler: [DTDCWebhookHandler.ts](../../../src/services/b2b/couriers/dtdc/DTDCWebhookHandler.ts)
Event map: [eventMap.ts](../../../src/services/b2b/couriers/dtdc/eventMap.ts)

DTDC is the most operationally rough of the three carriers — documentation
is incomplete, error messages are inconsistent, and webhook reliability
depends heavily on the partner's account tier. Polling is the recommended
primary tracking mechanism for DTDC; webhooks are a best-effort
supplement.

---

## 1. Credential setup

DTDC uses a username/password + API key combo. Tokens are short-lived
(typically 8 h) and the adapter manages refresh.

### What you need on file per partner

| Field | Where it lands | Notes |
|---|---|---|
| `apiKey` | `clients/{partnerId}/courierIntegrations.dtdc.apiKey` (encrypted) | Per-customer-code |
| `username` | `clients/{partnerId}/courierIntegrations.dtdc.username` | For token refresh |
| `password` | `clients/{partnerId}/courierIntegrations.dtdc.password` (encrypted) | For token refresh |
| `customerCode` | `clients/{partnerId}/courierIntegrations.dtdc.customerCode` | Account-level identifier |
| `webhookSecret` | `clients/{partnerId}/courierIntegrations.dtdc.webhookSecret` | Static per-partner token — see §4 |
| `apiBaseUrl` | `clients/{partnerId}/courierIntegrations.dtdc.apiBaseUrl` | Sandbox `https://staging.dtdc.in/apis` · Prod `https://blktracksvc.dtdc.com/apis` (yes, the prod URL is different from sandbox) |

### Sandbox onboarding

- Requires a signed agreement before sandbox access (3–4 week typical)
- Sandbox keys delivered via PGP-encrypted email
- No self-service developer portal — every account-level change goes
  through `apisupport@dtdc.com`

---

## 2. Booking test flow

### Request shape (adapter input)

```
POST /booking-api/api/customer/integration/consignment/softdata
Authorization: api-key <apiKey>
Content-Type: application/json
```

Body:

```json
{
  "customer_code": "<from creds>",
  "service_type_id": "B2C SMART EXPRESS",
  "load_type": "NON-DOCUMENT",
  "consignment_type": "Forward",
  "origin_details": {
    "name": "Partner Pickup",
    "phone": "9999999999",
    "address_line_1": "Sandbox Pickup Hub",
    "pincode": "560001",
    "city": "Bengaluru",
    "state": "Karnataka",
    "country": "India"
  },
  "destination_details": {
    "name": "Test Consignee",
    "phone": "9876543210",
    "address_line_1": "Plot 12, Whitefield",
    "pincode": "560066",
    "city": "Bengaluru",
    "state": "Karnataka",
    "country": "India"
  },
  "pieces_detail": [{
    "description": "Smoke test parcel",
    "declared_value": "500",
    "weight": "0.5",
    "height": "10",
    "length": "20",
    "width": "15"
  }],
  "reference_number": "<idempotency-key>"
}
```

### Verification steps

1. POST `/api/v1/b2b/shipments` with `Idempotency-Key: dtdc-uat-001`.
2. Confirm 201 with `data.awb` matching `^[A-Z]?\d{8,12}$` (DTDC AWBs
   are sometimes prefixed with a single letter for service type, e.g.
   `D` for documents, but most B2B routes use numeric).
3. Confirm `data.label.status` — DTDC labels are routinely `pending`
   for up to 90 s after booking; the retrieve-labels cron handles this.
4. Re-POST same idempotency key → identical response.
5. Different idempotency key, same body → different AWB.

### Expected behaviors

- DTDC's response shape:

  ```json
  {
    "success": true,
    "data": [{
      "reference_number": "<our idempotency key>",
      "success": true,
      "message": "SUCCESS",
      "cn_number": "1234567890"
    }]
  }
  ```

- `cn_number` is the AWB. Adapter aliases it.

### Common deviations from docs

- **Docs say** `service_type_id` accepts a code (`SE`, `EX`). **Reality**:
  the actual API expects the human-readable string (`"B2C SMART EXPRESS"`,
  `"EXPRESS-PRIORITY"`). Codes return `"Invalid service type"`. Adapter
  ships the human-readable form per the partner's contracted services.
- **Docs say** booking returns immediately. **Reality**: P95 latency in
  sandbox is ~12 s, P99 ~25 s. Our 25 s read timeout is intentional.
- **Docs say** booking is idempotent on `reference_number`. **Reality**:
  partially true — same `reference_number` within 24 h returns the same
  AWB; beyond 24 h it issues a new one. The B2B platform's own
  idempotency layer is the durable guarantee; don't rely on DTDC's.
- **Docs say** weight is in kg. **Reality**: kg (correct). But the
  *response* sometimes echoes weight in grams without unit indication.
  Don't reuse echo'd values; trust what you sent.
- **Sandbox quirk**: `pincode` validation is far more lenient than
  production. A typo'd pincode in sandbox silently routes through;
  production rejects with `"Pincode not serviceable"`. Always validate
  pincode serviceability via DTDC's serviceability API in onboarding.

---

## 3. Tracking validation flow

### Polling

```
GET /api/customer/integration/consignment/track?customer_code=<>&awb=<>
Authorization: api-key <apiKey>
```

DTDC's track API is comparatively reliable. Polling cadence: every 30 min
per shipment from `tracking.lastEventAt`.

1. Book sandbox shipment, capture AWB.
2. Force poll (cron endpoint).
3. Initial poll: usually empty (`events: []`) for 5–15 minutes after
   booking. Adapter returns `no_events` — not an error.
4. After DTDC's first scan, polling returns the event chain.

### Webhook validation

DTDC webhooks are flakier than the other two carriers. Treat them as
opportunistic — the polling worker is the source of truth.

1. Configure webhook URL (§4).
2. From the DTDC sandbox dashboard, trigger a scan.
3. Webhooks *may* arrive within 60 s — or up to several hours later, or
   not at all. This is a documented partner-account-tier behavior.
4. When they do arrive, confirm they ingest correctly.

---

## 4. Webhook setup

### Our endpoint

```
POST https://<host>/api/v1/b2b/webhooks/courier/dtdc?partner=<partnerId>
```

### Signature scheme

DTDC publishes no uniform webhook signature scheme. The handler expects:

- Header: `x-dtdc-token`
- Value: the partner's `webhookSecret` (static, per-partner)
- Constant-time compared via Node's `crypto.timingSafeEqual`

This is weaker than HMAC: a leaked secret allows replay until rotation.
Compensating controls:

- Edge-layer IP allowlist (see [README.md → Webhook IP allowlist](README.md#webhook-ip-allowlist)).
- Webhook events do not advance state past polled state by default
  (Authority Gate behavior — see hybrid tracking config).
- Rotate the token every 90 days. Coordinate with DTDC support to
  update on their side.

### Setup steps

1. Mint a token:

   ```bash
   node -e "console.log('dtdc_' + require('crypto').randomBytes(24).toString('hex'))"
   ```

2. Save to `clients/{partnerId}/courierIntegrations.dtdc.webhookSecret`.
3. Open a ticket with `apisupport@dtdc.com`:
   - URL: `https://<host>/api/v1/b2b/webhooks/courier/dtdc?partner=<partnerId>`
   - Header: `x-dtdc-token: <token>`
   - Account: `<customerCode>`
4. Wait 5–10 business days for them to configure.
5. Capture and verify.

### Common deviations from docs

- **Docs (when present) say** webhook body has a `event` field.
  **Reality**: arrives as `{ trackHeader: { strShipmentNo, ... }, trackDetails: [...] }`.
  Adapter handles this shape.
- DTDC occasionally **batches** events: a single POST may contain 3–5
  events for the same AWB. The webhook receiver's `parseEvents` returns
  an array, and ingestion is per-event, so this works — but be aware
  the platform sees `applied: 3` in one webhook hit, not three separate
  webhook calls.

---

## 5. Label validation

```
POST /api/customer/integration/consignment/shippinglabel/stream
```

Returns base64-encoded PDF. The adapter decodes and pushes to Storage.

1. Fetch via `GET /api/v1/b2b/shipments/<id>/label`.
2. First fetch often returns `status: 'pending'` — the
   `LabelRetrievalJob` polls DTDC every 60 s for up to 30 minutes.
3. Once available, the PDF should open and the AWB should match.

### Common deviations from docs

- **Docs say** label is returned synchronously with booking. **Reality**:
  for most service types, labels take 30–90 s. For "Premium" service
  types they're returned immediately. Adapter doesn't try to distinguish
  — always uses async retrieval path.
- **Label PDF** sometimes has corrupt fonts on sandbox (rendered as
  squares). Production labels are clean. Don't fail validation on
  visual rendering in sandbox; just verify byte-count > 5 KB and
  starts with `%PDF-`.

---

## 6. Cancellation validation

```
POST /api/customer/integration/consignment/cancel
Body: { customer_code, AWB_NUMBER, ConsignmentDate, ServiceType }
```

1. Book sandbox shipment.
2. Cancel via our API.
3. Expect 200, idempotency replay works.
4. Already-picked-up cancel → 409 `not_cancellable post_pickup`.

### Common deviations from docs

- **Docs say** cancel response is `{ success: true }`. **Reality**:
  returns `{ status: "Cancelled" }` on success, with `success` field
  inconsistent (sometimes present, sometimes not). Adapter checks `status`.
- **Cancel after pickup** sometimes returns 200 with
  `{ status: "Cannot cancel - already picked up" }`. Adapter parses the
  status field and translates to a failure.
- **Cancel of a non-existent AWB** returns 200 with `{ status: "AWB not found" }`.
  Same translation. This is the *most* surprising case — a 200 status
  code masking a logical failure.

---

## 7. Polling fallback validation

This is the **primary** mode for DTDC, not the fallback. Always validate
end-to-end via polling only:

1. Disable webhooks (clear `webhookSecret`).
2. Book → progress at DTDC's end → verify the shipment converges.
3. Confirm `delivered` is reached.

Once this passes, optionally enable webhooks as a supplement. Never gate
DTDC rollout on webhooks.

---

## 8. Reconciliation drill (DTDC-specific)

Cross-cutting drill: [../FAILURE_DRILLS.md](../FAILURE_DRILLS.md).

DTDC specifics:

- `lookupByReference` uses `reference_number`. The booking saga writes
  the idempotency key there.
- Sandbox lookup reflects new bookings within ~20 s. Production: ~60 s.
- DTDC has a stricter charge model: orphan AWBs that were created via
  booking but never had a manifest accrue a "no-show" charge after 7
  days. Always issue an explicit cancel via the reconciler if an orphan
  is found. (Our reconciler does this — verify in the drill.)

---

## 9. Observed deviations log

| Date | Operation | Field | Observed value | Our handling |
|---|---|---|---|---|
| (template — populate during sandbox) | | | | |
