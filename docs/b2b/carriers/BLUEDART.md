# BlueDart — Validation Runbook

Companion adapter: [src/services/b2b/couriers/bluedart/](../../../src/services/b2b/couriers/bluedart/)
Webhook handler: [BlueDartWebhookHandler.ts](../../../src/services/b2b/couriers/bluedart/BlueDartWebhookHandler.ts)
Event map: [eventMap.ts](../../../src/services/b2b/couriers/bluedart/eventMap.ts)

Work through every section below against a sandbox account before
enabling BlueDart in production. Re-run §4 (webhook setup) and §8
(reconciliation drill) after any change to the partner's BlueDart
configuration on their side.

---

## 1. Credential setup

BlueDart issues two credential bundles: a **sandbox set** used during
onboarding (different base URL, different customer codes) and a
**production set** that is *only* released after they verify your
account manager signed off on UAT.

### What you need on file per partner

| Field | Where it lands | Notes |
|---|---|---|
| `licenseKey` | `clients/{partnerId}/courierIntegrations.bluedart.licenseKey` (encrypted) | OAuth client credential |
| `loginId` | `clients/{partnerId}/courierIntegrations.bluedart.loginId` | Per-account |
| `customerCode` | `clients/{partnerId}/courierIntegrations.bluedart.customerCode` | Used for billing — must match BlueDart's "Area Customer code" registry |
| `area` | `clients/{partnerId}/courierIntegrations.bluedart.area` | Pickup area code |
| `webhookSecret` | `clients/{partnerId}/courierIntegrations.bluedart.webhookSecret` | HMAC secret — see §4 |
| `apiBaseUrl` | `clients/{partnerId}/courierIntegrations.bluedart.apiBaseUrl` | Sandbox `https://apigateway-sandbox.bluedart.com` · Prod `https://apigateway.bluedart.com` |

`scripts/validate-b2b-env.mjs` does NOT validate these — they are
per-partner. Use the admin UI under `/b2b/partners/<id>/integrations`.

### Sandbox onboarding contacts

- Initial request: `developer.support@bluedart.com`
- Account manager assignment usually takes 3–5 business days
- Sandbox keys arrive via email — never via the developer portal

---

## 2. Booking test flow

### Request shape (adapter input)

The `BookingService` invokes `BlueDartAdapter.book()` with a normalized
`BookingRequest`. Below is a sample payload exactly as the adapter sends
it to BlueDart's `/booking/api/transaction/shipment` endpoint after
internal transformation.

```json
{
  "Request": {
    "Consignee": {
      "ConsigneeName": "Test Consignee",
      "ConsigneeAddress1": "Plot 12, Whitefield",
      "ConsigneeAddress2": "",
      "ConsigneePincode": "560066",
      "ConsigneeMobile": "9876543210",
      "ConsigneeTelephone": ""
    },
    "Shipper": {
      "CustomerCode": "<from creds>",
      "CustomerName": "Partner Pickup",
      "CustomerAddress1": "Sandbox Pickup Hub",
      "CustomerPincode": "560001",
      "CustomerMobile": "9999999999"
    },
    "Services": {
      "AWBNo": "",
      "ActualWeight": 0.5,
      "Commodity": { "CommodityDetail1": "Smoke test parcel" },
      "CreditReferenceNo": "<idempotency-key>",
      "DeclaredValue": 500,
      "Dimensions": [{ "Length": 20, "Breadth": 15, "Height": 10, "Count": 1 }],
      "ProductCode": "A",
      "SubProductCode": "P",
      "PickupDate": "<ISO>"
    },
    "Profile": {
      "LoginID": "<from creds>",
      "LicenceKey": "<from creds>",
      "Api_type": "S"
    }
  }
}
```

### Verification steps

1. POST `/api/v1/b2b/shipments` with `Idempotency-Key: bd-uat-001` and a
   minimal `BookingRequest` against the sandbox partner.
2. Confirm response 201 with `data.awb` matching `^[0-9]{9,11}$` (BlueDart
   AWBs are numeric, not alphanumeric — unlike our mock fixture).
3. Confirm `data.label.status === 'available'` and the label PDF
   downloads.
4. Re-POST with the same idempotency key — expect identical body and
   `Idempotency-Replay: true` header.
5. Use a different idempotency key with the same body — expect a *new*
   AWB. Confirms BlueDart's `CreditReferenceNo` is being passed through
   (their server-side dedup, second layer of defense).

### Expected behaviors

- **Sandbox AWBs** start with `7777` or `8888` per BlueDart convention.
  Production AWBs do not have this prefix — don't write code that depends
  on it.
- Booking response includes a `label_url` that is *time-bound* (typically
  24 h). Our `LabelService` persists the rendered PDF immediately to
  Firebase Storage; don't store the URL.

### Common deviations from docs

- **Docs say** booking response includes `pickup_token`. **Reality**:
  field is present only for "pickup-on-demand" service products
  (`SubProductCode: PD`). Other product codes omit it. The adapter
  treats it as optional.
- **Docs say** `AreaCustomerCode` is optional if `CustomerCode` is set.
  **Reality**: production rejects bookings missing `AreaCustomerCode` for
  certain account types with `UnauthorizedUser: User not authorized to
  register pickup for specified Area Customer code`. Always set both.
- **Docs say** `PickupDate` accepts ISO 8601. **Reality**: only accepts
  `YYYY-MM-DDTHH:mm:ss` — no millis, no Z suffix. Adapter strips them.

---

## 3. Tracking validation flow

### Polling validation

1. Book a sandbox shipment, capture the AWB.
2. Wait ~60 s for BlueDart's track service to register it (sandbox is
   slow to propagate — production is ~10 s).
3. Force the polling worker to pick it up:

   ```bash
   curl -X POST $HOST/api/cron/poll-tracking \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

4. Confirm shipment doc's `events` subcollection now has at least one
   raw event with `source: 'bluedart'`.
5. Confirm `tracking.lastPolledAt` advanced.

### Webhook validation

Webhook setup is per partner (see §4). Once configured:

1. From BlueDart's "Pickup Confirmation" UI (sandbox dashboard), trigger
   a status update on the test AWB.
2. Within ~30 s the platform should receive a POST to
   `/api/v1/b2b/webhooks/courier/bluedart?partner=<partnerId>`.
3. Confirm the event appears in the shipment's events subcollection
   with `initiator.type === 'courier_webhook'`.
4. Confirm the shipment's projected `status` field advanced if the event
   implies a forward transition.

### Hybrid mode

If `clients/{partnerId}.hybridTrackingConfig` is enabled, the
`AuthorityGate` may reject a webhook event in favor of a more recent
polled event (or vice versa). Validate by:

1. Send a `picked_up` webhook event with `occurredAt = T0`.
2. Send a polled event for the same shipment with `occurredAt = T0 - 60s`
   and a higher status (`out_for_delivery`).
3. Confirm the polled event was rejected with
   `outcome: 'no_change', reason: 'stale_by_rank'` even though it has the
   higher status. The webhook wins because it's newer.

---

## 4. Webhook setup

### Our endpoint

```
POST https://<host>/api/v1/b2b/webhooks/courier/bluedart?partner=<partnerId>
```

`<partnerId>` is the URL-safe partner identifier. The route reads it from
`?partner=` and uses it to look up `webhookSecret`.

### Signature scheme (what `BlueDartWebhookHandler` expects)

- Header: `X-BD-Signature`
- Value: `hex(HMAC-SHA256(rawBody, webhookSecret))`
- Body: the exact byte sequence BlueDart POSTs — do not normalize

BlueDart's published webhook documentation is sparse and varies by
account. The default scheme above is what we implement. If BlueDart
support tells the partner their account uses a different scheme, the
options to update are:

- Use a per-partner override flag (open a follow-up: there's no current
  mechanism — add to `clients/{partnerId}.bluedartWebhookScheme` if this
  ever happens, and branch in `BlueDartWebhookHandler.verifySignature`).
- Until then, document the divergence and use polling only for that
  partner.

### Setup steps

1. Mint the partner's webhook secret:

   ```bash
   node -e "console.log('whsec_' + require('crypto').randomBytes(24).toString('hex'))"
   ```

2. Save it to `clients/{partnerId}/courierIntegrations.bluedart.webhookSecret`
   via the admin UI.
3. Share the URL + secret with BlueDart support to configure the
   partner's account.
4. Run the capture harness (see WEBHOOK_VALIDATION.md §2) and ask
   BlueDart support to send a test event.
5. Verify signature against the captured raw body.

### Common deviations from docs

- **Docs say** signature is hex-lowercase. **Reality**: some partner
  accounts get uppercase-hex from BlueDart's gateway. The handler is
  case-insensitive via `timingSafeEqual` on equal-length strings, but
  if you ever switch to constant-time hex compare, lowercase first.
- **Docs say** webhook content-type is `application/json`. **Reality**:
  occasionally arrives as `application/json; charset=utf-8` — the
  receiver reads `req.text()` so charset doesn't matter, but anything
  doing `req.json()` would fail on the charset suffix.

---

## 5. Label validation

1. Right after booking, fetch the label:

   ```bash
   curl $HOST/api/v1/b2b/shipments/<shipmentId>/label \
     -H "Authorization: Bearer $B2B_API_KEY"
   ```

2. Expect `data.status === 'available'` and a signed Firebase Storage URL.
3. Open the URL — verify it's a real PDF (starts with `%PDF-`).
4. Verify the AWB on the label matches `data.awb`.
5. Verify the consignee name on the label matches the booking request
   (BlueDart sometimes strips trailing punctuation — record under
   §1 quirks if observed).

### Expected behaviors

- Labels are typically available within 2 s of booking, but BlueDart's
  sandbox can take up to 30 s. The `LabelRetrievalJob` will pick up
  delayed labels via the retrieve-labels cron.
- If `data.status === 'pending'` immediately after booking, that's
  expected for the sandbox; production should always be `available`.

---

## 6. Cancellation validation

1. Book a sandbox shipment.
2. Within 30 s of booking (before BlueDart marks it picked up):

   ```bash
   curl -X POST $HOST/api/v1/b2b/shipments/<shipmentId>/cancel \
     -H "Authorization: Bearer $B2B_API_KEY" \
     -H "Idempotency-Key: cancel-uat-001" \
     -H "Content-Type: application/json" \
     -d '{"reason": "uat"}'
   ```

3. Expect 200 with `data.cancelledAt` set.
4. Confirm the shipment doc's `status` is `cancelled`.
5. Re-POST with the same idempotency key — expect identical response.
6. Attempt cancel on an already-picked-up shipment — expect 409
   `not_cancellable` with reason `post_pickup`.

### Common deviations from docs

- **Docs say** cancel returns the cancelled AWB in the response.
  **Reality**: success response is an empty `{}` body with HTTP 200.
  Adapter treats empty 200 as success.
- **Docs say** cancellation is allowed up to "pickup scan". **Reality**:
  in practice it's accepted up until the AWB enters the first hub —
  which can be hours after pickup scan. Don't relax our `post_pickup`
  guard based on this; carrier may still accept it but we have no
  reliable signal.

---

## 7. Polling fallback validation

Validates that even with webhooks broken, the platform converges on the
correct shipment state.

1. **Disable webhooks** for the test partner: set
   `clients/{partnerId}.courierIntegrations.bluedart.webhookSecret = null`.
   This causes signature checks to fail, so all webhook events return
   401 and are dropped.
2. Book a shipment.
3. From the BlueDart sandbox UI, progress the shipment through
   picked_up → in_transit → delivered.
4. Wait for the polling cron to fire (or invoke manually).
5. Confirm the shipment reaches `delivered` purely via polled events.
6. Confirm no events have `initiator.type === 'courier_webhook'` —
   should all be `polled`.

Expected duration: ~3 polling cycles to reach delivered, given the
sandbox's slow propagation.

---

## 8. Reconciliation drill (BlueDart-specific)

The cross-cutting drill lives in [../FAILURE_DRILLS.md](../FAILURE_DRILLS.md).
BlueDart-specific notes:

- BlueDart's `lookupByReference` endpoint (`/track/api/byReference`)
  uses `CreditReferenceNo` as the lookup key. The saga's
  `book_courier` step writes the idempotency key as `CreditReferenceNo`,
  so a lookup will find the orphan AWB if one was created.
- Sandbox returns `not_found` for ~60 s after a successful booking even
  when the AWB exists — first reconciler attempt almost always fails in
  sandbox. Production reflects within 10 s.
- If lookup *does* return an AWB, the saga adopts it and the platform
  proceeds normally. The carrier-side billing for the orphan AWB is the
  partner's responsibility — we cancel it via the standard cancel flow
  if the reconciler runs after the booking succeeded but the partner has
  retried.

---

## 9. Observed deviations log

| Date | Operation | Field | Observed value | Our handling |
|---|---|---|---|---|
| (template — populate during sandbox) | | | | |

When adding entries, copy the format from
[carriers/README.md → Payload drift log](README.md#payload-drift-log).
