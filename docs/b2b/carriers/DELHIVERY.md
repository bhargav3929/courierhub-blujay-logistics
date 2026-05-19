# Delhivery — Validation Runbook

Companion adapter: [src/services/b2b/couriers/delhivery/](../../../src/services/b2b/couriers/delhivery/)
Webhook handler: [DelhiveryWebhookHandler.ts](../../../src/services/b2b/couriers/delhivery/DelhiveryWebhookHandler.ts)
Event map: [eventMap.ts](../../../src/services/b2b/couriers/delhivery/eventMap.ts)

Work through every section against a sandbox account before enabling
Delhivery in production. Delhivery's sandbox has the closest behavioral
parity with production of the three carriers — most quirks observed in
sandbox carry through.

---

## 1. Credential setup

Delhivery uses a single API token per account (no OAuth). The token is
long-lived but can be rotated by the partner — record the rotation date.

### What you need on file per partner

| Field | Where it lands | Notes |
|---|---|---|
| `apiToken` | `clients/{partnerId}/courierIntegrations.delhivery.apiToken` (encrypted) | Bearer token |
| `pickupLocationName` | `clients/{partnerId}/courierIntegrations.delhivery.pickupLocationName` | Must match exactly a name registered in Delhivery's "Warehouses" UI — case-sensitive |
| `clientName` | `clients/{partnerId}/courierIntegrations.delhivery.clientName` | Delhivery's account-level identifier |
| `webhookSecret` | `clients/{partnerId}/courierIntegrations.delhivery.webhookSecret` | HMAC secret OR static token — see §4 |
| `apiBaseUrl` | `clients/{partnerId}/courierIntegrations.delhivery.apiBaseUrl` | Sandbox `https://staging-express.delhivery.com` · Prod `https://track.delhivery.com` |

### Sandbox onboarding

- Self-service via developer portal at `developer.delhivery.com`
- Sandbox token issued immediately on signup
- Production access requires: signed agreement, KYC, account manager
  assignment (2–3 weeks)

---

## 2. Booking test flow

### Request shape (adapter input)

Delhivery uses a multipart form-encoded body with a JSON `format` field
and a `data` field containing the actual payload:

```
POST /api/cmu/create.json
Content-Type: application/x-www-form-urlencoded

format=json&data=<URL-encoded JSON below>
```

JSON body:

```json
{
  "shipments": [
    {
      "name": "Test Consignee",
      "add": "Plot 12, Whitefield",
      "pin": "560066",
      "city": "Bengaluru",
      "state": "Karnataka",
      "country": "India",
      "phone": "9876543210",
      "order": "<idempotency-key>",
      "payment_mode": "Prepaid",
      "products_desc": "Smoke test parcel",
      "hsn_code": "",
      "cod_amount": "",
      "order_date": null,
      "total_amount": "500",
      "seller_add": "Sandbox Pickup Hub",
      "seller_name": "Partner Pickup",
      "weight": "500",
      "shipment_width": "15",
      "shipment_height": "10",
      "shipment_length": "20",
      "shipping_mode": "Surface",
      "address_type": "home"
    }
  ],
  "pickup_location": {
    "name": "<from creds — pickupLocationName>"
  }
}
```

### Verification steps

1. POST `/api/v1/b2b/shipments` with `Idempotency-Key: dl-uat-001` and a
   minimal `BookingRequest` against the sandbox partner.
2. Confirm response 201 with `data.awb` matching `^[0-9]{13}$`
   (Delhivery waybills are 13 numeric digits).
3. Confirm `data.label.status === 'available'`.
4. Re-POST with the same idempotency key — expect identical body and
   `Idempotency-Replay: true` header.
5. Different idempotency key, same body → new waybill. Delhivery uses
   `order` as their server-side dedup; adapter writes idempotency key
   there.

### Expected behaviors

- Delhivery's response wraps the booking outcome in:

  ```json
  {
    "success": true,
    "packages": [{
      "waybill": "1234567890123",
      "status": "Success",
      "remarks": [],
      "refnum": "<our order field>"
    }]
  }
  ```

- The adapter treats `packages[0].status === 'Success'` as the success
  signal. Partial failures in a multi-shipment payload aren't possible
  for us (we only send single-shipment payloads), so partial-success
  handling is intentionally minimal.

### Common deviations from docs

- **Docs say** the error response sets `success: false`. **Reality**:
  some validation failures return `success: true` with
  `packages[0].status === 'Failure'` and a populated `remarks` array.
  The adapter checks both — never short-circuit on `success` alone.
- **Docs say** `pickup_location.name` is optional. **Reality**: required
  for every shipment. Omitting it returns the generic 500: `"An internal
  Error has occurred, Please get in touch with client.support@delhivery.com"`
  — that error message is Delhivery's catch-all for many input problems,
  not just missing pickup location.
- **Docs say** `weight` is in kg. **Reality**: weight is in **grams**
  in their actual API (despite kg in the docs). The adapter sends grams.
  Sandbox accepts both silently; production rejects kg with an obscure
  "invalid weight" error.
- **Docs say** `payment_mode: COD` is supported with `cod_amount` in
  rupees. **Reality**: rupees in their COD field, paise everywhere else
  in our system. The adapter converts paise → rupees for this single
  field. Watch for off-by-100 drift.

---

## 3. Tracking validation flow

### Polling validation

Delhivery's track API:

```
GET /api/v1/packages/json/?waybill=<waybill>&token=<apiToken>
```

1. Book a sandbox shipment, capture the waybill.
2. Wait ~10 s (Delhivery is fast).
3. Force the polling worker:

   ```bash
   curl -X POST $HOST/api/cron/poll-tracking \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

4. Confirm raw events in the events subcollection with
   `source: 'delhivery'`.

### Webhook validation

See §4 for setup. Once configured:

1. From Delhivery's "Scan Manager" UI, scan the test waybill through
   Pickup → In-Transit → Out-for-Delivery → Delivered.
2. Confirm webhooks arrive within ~15 s of each scan.
3. Confirm shipment status converges.

---

## 4. Webhook setup

### Our endpoint

```
POST https://<host>/api/v1/b2b/webhooks/courier/delhivery?partner=<partnerId>
```

### Signature scheme

The handler accepts **two schemes** in priority order:

1. **HMAC**: header `X-Delhivery-Signature` = `hex(HMAC-SHA256(rawBody, secret))`
2. **Token-in-query** fallback: `?partner_token=<secret>` matched against
   `webhookSecret`

Use HMAC where possible. Some Delhivery accounts ("legacy account
type") only support token-in-query; the handler accepts both so the
partner choice doesn't matter to us.

### Setup steps

1. Mint webhook secret:

   ```bash
   node -e "console.log('whsec_' + require('crypto').randomBytes(24).toString('hex'))"
   ```

2. Save to `clients/{partnerId}/courierIntegrations.delhivery.webhookSecret`.
3. Configure on Delhivery's side at `developer.delhivery.com/webhooks`.
   Two fields to populate:
   - URL: `https://<host>/api/v1/b2b/webhooks/courier/delhivery?partner=<partnerId>`
   - For HMAC: enable "Sign requests" + paste the secret
   - For token-only: append `&partner_token=<secret>` to the URL above
4. Click "Send Test Event" — capture and verify (see WEBHOOK_VALIDATION.md).

### Common deviations from docs

- **Docs say** signature header is lowercase `x-delhivery-signature`.
  **Reality**: arrives in mixed case across accounts. Handler checks both.
- **Docs say** signature is base64. **Reality**: hex. Confirmed against
  multiple accounts. If you ever see base64, log and escalate.
- **Docs say** webhook body has a `events: [...]` array. **Reality**:
  legacy accounts send a single flat event with no wrapper. Adapter's
  `parseWebhook` handles both — single object becomes a one-element
  array.

---

## 5. Label validation

```
GET /api/p/packing_slip?wbns=<waybill>&pdf=true
```

1. After booking, fetch via:

   ```bash
   curl $HOST/api/v1/b2b/shipments/<shipmentId>/label \
     -H "Authorization: Bearer $B2B_API_KEY"
   ```

2. Expect `data.status === 'available'` and a signed Storage URL.
3. The label is a PDF with both Delhivery's barcode and the partner's
   `clientName`.

### Common deviations from docs

- **Docs say** labels are A4. **Reality**: their `pdf=true` flag returns
  a 4x6 thermal-printer format by default; A4 requires `paper_size=a4`.
  Adapter sends `paper_size=a4` for partner-uploaded labels and the
  thermal format for direct printing.
- **Sandbox** label generation can fail with `"Label not ready"` for up
  to 60 s after booking. `LabelRetrievalJob` handles this transparently.

---

## 6. Cancellation validation

```
POST /api/p/edit
Body: { waybill, cancellation: true }
```

1. Book a sandbox shipment.
2. Cancel:

   ```bash
   curl -X POST $HOST/api/v1/b2b/shipments/<shipmentId>/cancel \
     -H "Authorization: Bearer $B2B_API_KEY" \
     -H "Idempotency-Key: cancel-uat-001" \
     -H "Content-Type: application/json" \
     -d '{"reason": "uat"}'
   ```

3. Expect 200 with `data.cancelledAt`.
4. Re-POST same key — identical response.
5. Cancel an already-picked-up shipment — 409 `not_cancellable
   post_pickup`.

### Common deviations from docs

- **Docs say** cancel is always idempotent on Delhivery's side.
  **Reality**: second cancel returns
  `"Already cancelled"` as an error, not success. Adapter treats this
  specific error message as success.
- **Docs say** cancel is allowed until "manifest". **Reality**: rejected
  at the first hub scan, which is earlier than manifest. Our `post_pickup`
  guard is correct.

---

## 7. Polling fallback validation

1. Disable webhooks: set
   `clients/{partnerId}.courierIntegrations.delhivery.webhookSecret = null`.
2. Book and progress a shipment via Delhivery's scan manager.
3. Confirm shipment reaches `delivered` via polling alone.
4. Confirm no `courier_webhook` events.

---

## 8. Reconciliation drill (Delhivery-specific)

Cross-cutting drill: [../FAILURE_DRILLS.md](../FAILURE_DRILLS.md).

Delhivery specifics:

- `lookupByReference` uses the `order` field. The booking saga writes
  the idempotency key as `order`, so the orphan-detection path works.
- Sandbox reflects new bookings in lookup within ~5 s. Production is
  near-immediate.
- Delhivery does NOT charge for waybills that were created but never
  picked up — orphan waybills are cleaned up by their nightly job. We
  still issue an explicit cancel for tracking-record consistency.

---

## 9. Observed deviations log

| Date | Operation | Field | Observed value | Our handling |
|---|---|---|---|---|
| (template — populate during sandbox) | | | | |
