# Blujay B2B Shipment API — Build Spec

**Audience:** the engineer building this. Read end-to-end before writing code.
**Status:** spec only. Nothing in this document is implemented yet.
**Owner of this doc:** Bhargav.

---

## 1. What this API is (in one paragraph)

Blujay already has a **B2C webhook** (`/api/integrations/orders/webhook`) where a merchant's Shopify-style store pushes a paid order in and Blujay creates a shipment.

The **B2B API** is the opposite use case. Our client is a **logistics/courier-aggregator company** that runs its **own booking website**. Their end-customers visit *their* site, type in a sender + receiver + parcel details, and want to see "which couriers can I ship this with, and how much will it cost?" — exactly like step 4–5 of our own `/add-shipment` page, but exposed as an API so the client can render it inside their own frontend.

In short: the B2B API turns Blujay into a **shipment-booking engine that other logistics platforms call**. Their UI, our brains.

---

## 2. The flow (this is the contract — memorise it)

The end-user is on **the client's website**, not ours. The client's frontend talks to **their own backend**. The client's backend talks to **us**.

```
End-user (on client's site)
        │
        ▼
Client's frontend           ← client builds this
        │
        ▼
Client's backend            ← client builds this
        │  X-Blujay-Api-Key: bj_b2b_xxx
        ▼
Blujay B2B API              ← we build this (5 endpoints below)
        │
        ▼
BlueDart / DTDC / Delhivery / …
```

There are exactly **5 steps**, in order:

| # | What the end-user does on client's site | What client's backend calls | What we do |
|---|------------------------------------------|-----------------------------|------------|
| 1 | Types sender + receiver + parcel info, clicks "Get rates" | `POST /api/b2b/v1/serviceability` | Validate inputs (pincodes, weights, addresses). Return the list of couriers the client has integrated, each with a quoted rate + ETA + a short-lived `quoteToken`. |
| 2 | Sees the courier list, picks one (e.g. "DTDC Surface"), clicks "Book" | `POST /api/b2b/v1/shipments` (with the chosen `quoteToken`) | Call that courier's real API under the hood. Create the shipment row in Firestore. Return `shipmentId`, `awb` (tracking number), and a `labelUrl`. |
| 3 | Sees "Booking confirmed", clicks "Download label" | `GET /api/b2b/v1/shipments/{id}/label` | Return the carrier's label as a PDF (or a hosted URL). |
| 4 | Later, wants to track | `GET /api/b2b/v1/shipments/{id}/track` | Pull live status from the carrier and return it. |
| 5 | Wants to cancel before pickup | `POST /api/b2b/v1/shipments/{id}/cancel` | Call carrier cancel API, mark shipment cancelled. |

Every shipment booked through this API **automatically appears in the client's Blujay portal** (`/client-shipments`) — same Firestore `shipments` collection, just with `source: 'b2b_api'` so we can tell them apart in the UI.

---

## 3. Why we need a *new* API key (not the B2C one)

The existing key prefix is `bj_<32hex>` and powers `/api/integrations/orders/webhook`. That endpoint **creates an unbooked shipment** (`status: 'webhook_pending'`) and stops there — an admin still has to pick a courier inside Blujay and click "Book". That is fine for Shopify-style merchants who never see Blujay.

B2B is different. B2B keys must be able to:

- Quote rates across multiple carriers
- **Book directly** with a carrier (no human in the loop)
- Pull labels
- Cancel

So we mint a new key class. Same `clientApiKeys` collection, just two new fields:

```ts
{
  // ...existing fields (clientId, hash, keyPrefix, createdAt, revokedAt) stay the same
  type: 'b2c' | 'b2b',     // NEW — defaults to 'b2c' for back-compat
  scopes: string[],        // NEW — e.g. ['serviceability:read','shipments:write','labels:read']
}
```

**Key prefix convention:**

- B2C (existing): `bj_` + 32 hex chars   → `bj_a1b2c3d4…`
- B2B (new):      `bj_b2b_` + 32 hex chars → `bj_b2b_a1b2c3d4…`

The prefix is purely cosmetic for the merchant (they see it in the dashboard). The real check is the `type` field in Firestore. A B2C key hitting a B2B endpoint must return `403 Forbidden`, not `401`.

---

## 4. Authentication (identical to the B2C webhook)

Every request must include:

```
X-Blujay-Api-Key: bj_b2b_<32hex>
Content-Type: application/json
```

Server side, the key is **SHA-256 hashed** and looked up in `clientApiKeys` (already implemented in `src/services/server/apiKeyService.ts` — `lookupApiKey()`). Extend that helper to also return the `type` so the route can reject wrong-type usage.

If the key is missing → `401`. If revoked or unknown → `401`. If valid but wrong type → `403`. If valid but the client has no courier integrations → `409`.

The merchant mints/revokes B2B keys from the **same** Integrations page (`/client-integrations`) — add a "B2B API Keys" section next to the existing "API Keys" card. Reuse `src/components/integrations/ApiKeyManager.tsx`, just pass `type="b2b"`.

---

## 5. The 5 endpoints in detail

> **Base path:** `/api/b2b/v1`
> All amounts are in **paise** (integer, smallest unit). Frontend converts to ₹.
> All timestamps are ISO-8601 UTC.
> All weights in **grams**. All dimensions in **centimetres**.

### 5.1 `POST /api/b2b/v1/serviceability`

**Purpose:** validate inputs and tell the caller which couriers can ship this parcel + at what price.

**Request body:**

```json
{
  "sender": {
    "name": "Acme Books Pvt Ltd",
    "phone": "9876543210",
    "email": "ops@acme.in",
    "line1": "Plot 42, Industrial Estate",
    "line2": "Phase II",
    "city": "Hyderabad",
    "state": "Telangana",
    "pincode": "500032",
    "country": "IN"
  },
  "receiver": {
    "name": "Rohit Sharma",
    "phone": "9123456789",
    "line1": "B-204, Sunshine Apartments",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "country": "IN"
  },
  "parcel": {
    "weight_g": 850,
    "length_cm": 25,
    "breadth_cm": 18,
    "height_cm": 10,
    "declared_value": 120000,
    "contents": "Hardcover books"
  },
  "payment_method": "prepaid",
  "cod_amount": 0
}
```

**Response 200:**

```json
{
  "ok": true,
  "quotes": [
    {
      "courier": "DTDC",
      "service": "Surface",
      "rate": 8500,
      "eta_days": 4,
      "quoteToken": "qt_2k1f9c…"
    },
    {
      "courier": "BlueDart",
      "service": "Apex",
      "rate": 14200,
      "eta_days": 2,
      "quoteToken": "qt_8h2d3e…"
    }
  ]
}
```

**Notes for the builder:**

- Only return couriers where this client has working credentials. Use `resolveCourierCreds(clientId, courier)` (already in `src/services/server/resolveCourierCreds.ts`). Skip couriers that fall back to platform env vars — for B2B, the client must have their own.
- `quoteToken` is a **signed, short-lived (15 min) JWT** containing `{ clientId, courier, service, rate, parcelHash }`. It's the only thing that gets passed to the booking call, so the rate is locked. Use `jose` (already a transitive dep) or a stateless HMAC.
- Validate the address shape with Zod — exactly the same shape we use in the B2C webhook (`Address` schema). Reuse it; do not redefine.
- Errors:
  - `400` invalid body (return Zod issues)
  - `409` no couriers integrated for this client (`{ error: "No couriers configured. Connect at least one carrier in your Blujay Integrations page." }`)
  - `200` with empty `quotes: []` if every carrier returned "not serviceable" for that pincode pair (this is **not** an error; it's a valid result)

### 5.2 `POST /api/b2b/v1/shipments`

**Purpose:** book the selected courier and create the shipment.

**Request body:**

```json
{
  "quoteToken": "qt_2k1f9c…",
  "external_reference": "ACME-ORD-9981",
  "notes": "Handle with care — fragile",
  "pickup_date": "2026-05-16"
}
```

`external_reference` is the client's own order id and is the **idempotency key** — calling with the same `(clientId, external_reference)` twice returns the original shipment, never a duplicate.

**Response 200:**

```json
{
  "ok": true,
  "shipmentId": "5XbqW…",
  "awb": "DTDC123456789",
  "courier": "DTDC",
  "service": "Surface",
  "labelUrl": "https://blujaylogistic.com/api/b2b/v1/shipments/5XbqW…/label",
  "estimated_delivery": "2026-05-20"
}
```

**Under the hood:**

1. Verify the `quoteToken` signature + expiry.
2. Reconstruct the parcel from the token (do not trust extra fields from the caller — anything not in the token must be ignored).
3. Dispatch to the right carrier via `src/services/server/directCarrierOps.ts` (already exists — same dispatcher our own `/add-shipment` page uses). Add a thin adapter so it accepts a "raw" payload, not an Order doc.
4. On success, write to `shipments` collection with:
   ```ts
   {
     clientId,
     source: 'b2b_api',
     b2bApiKeyId: keyHit.keyId,
     externalReference: body.external_reference,
     status: 'booked',
     courier, awb, ...
   }
   ```
5. On carrier failure, **do not write a shipment row**. Return `502` with the carrier's error message verbatim (in a `carrierError` field). The client will retry.

**Errors:**

- `400` invalid/expired `quoteToken`
- `409` duplicate `external_reference` → return existing shipment with `idempotent: true`
- `502` carrier rejected the booking (include `carrierError`)
- `503` carrier API timed out (retryable)

### 5.3 `GET /api/b2b/v1/shipments/{shipmentId}/label`

Returns the courier label.

- For BlueDart: regenerate via our existing HTML→PDF flow (`src/components/shipments/BlueDartLabel.tsx`).
- For DTDC: proxy the PDF from DTDC's label endpoint (we already cache this on the shipment doc — see `src/app/api/dtdc/shipping-label/route.ts`).
- For Delhivery: same proxy approach (`src/app/api/delhivery/shipping-label/route.ts`).

Response is **`application/pdf`** by default. Pass `?format=url` to get a JSON `{ url, expires_at }` with a signed, short-lived URL instead — easier for client frontends that want to embed it in an iframe.

`404` if shipment doesn't belong to this client. **Never** leak that the shipment exists under another client.

### 5.4 `GET /api/b2b/v1/shipments/{shipmentId}/track`

Returns the latest tracking events from the carrier.

```json
{
  "ok": true,
  "awb": "DTDC123456789",
  "courier": "DTDC",
  "status": "in_transit",
  "events": [
    { "at": "2026-05-15T10:32:00Z", "location": "Hyderabad Hub", "description": "Shipment booked" },
    { "at": "2026-05-16T03:11:00Z", "location": "Hyderabad Hub", "description": "Out for connection" }
  ]
}
```

Map carrier-specific statuses to a small Blujay enum: `booked | picked_up | in_transit | out_for_delivery | delivered | rto | cancelled | exception`. The raw carrier status stays in each event's `description`.

Cache for 60 s per AWB to avoid hammering carrier APIs if the client polls.

### 5.5 `POST /api/b2b/v1/shipments/{shipmentId}/cancel`

Cancel before pickup.

```json
{ "reason": "Customer requested cancellation" }
```

Returns:

```json
{ "ok": true, "shipmentId": "5XbqW…", "status": "cancelled" }
```

`409` if the shipment is already picked up / in transit / delivered.

---

## 6. Error response shape (use this everywhere)

```json
{
  "ok": false,
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": { "...optional, e.g. Zod field errors..." }
}
```

Codes used:

| Code | HTTP | Meaning |
|---|---|---|
| `MISSING_API_KEY` | 401 | Header absent |
| `INVALID_API_KEY` | 401 | Key not found or revoked |
| `WRONG_KEY_TYPE` | 403 | B2C key used on B2B endpoint (or vice versa) |
| `INVALID_BODY` | 400 | Zod failed — see `details` |
| `NO_COURIERS_CONFIGURED` | 409 | Client hasn't integrated any carrier |
| `QUOTE_EXPIRED` | 400 | `quoteToken` is past 15 min or signature bad |
| `DUPLICATE_REFERENCE` | 409 | Idempotent re-hit — `details.shipmentId` returned |
| `CARRIER_REJECTED` | 502 | Carrier-side failure (see `details.carrierError`) |
| `CARRIER_TIMEOUT` | 503 | Carrier didn't respond — retry safe |
| `NOT_FOUND` | 404 | Shipment doesn't belong to caller |
| `CANCEL_TOO_LATE` | 409 | Already in transit/delivered |

---

## 7. Rate limiting

Per API key:

- Serviceability: **60 req/min** (it's the hot endpoint — every keystroke-driven UI calls it)
- Booking / cancel: **20 req/min**
- Label / track: **120 req/min**

Use an in-memory token bucket keyed by `keyHit.keyId` for v1. Move to Redis if/when we run multi-region.

Always return rate-limit headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1715772000
```

On hit: `429 Too Many Requests`.

---

## 8. Logging — non-negotiable

Every B2B request must emit at minimum:

```
[b2b/<endpoint>] rid=<short> 📨 incoming ip=<ip> key=bj_b2b_xxx…
[b2b/<endpoint>] rid=<short> ✅ auth ok clientId=<id> keyId=<id>
[b2b/<endpoint>] rid=<short> 📦 payload ok …
[b2b/<endpoint>] rid=<short> ➡️  carrier=<DTDC> request awb-target=…
[b2b/<endpoint>] rid=<short> ⬅️  carrier=<DTDC> response status=200 awb=<…> (<ms>ms)
[b2b/<endpoint>] rid=<short> 🆕 shipment created shipment=<id> (<total ms>ms)
```

Use the exact `rid` + emoji convention from `src/app/api/integrations/orders/webhook/route.ts` — we already grep on these prefixes when debugging.

---

## 9. Database changes

**Update `clientApiKeys` documents:** add `type: 'b2c' | 'b2b'` (default `'b2c'` for existing rows) and `scopes: string[]`.

**Update `shipments` documents:** add (all optional, only set on B2B-origin rows):

```ts
source?: 'manual' | 'shopify' | 'webhook_b2c' | 'b2b_api',  // tighten the existing source field
b2bApiKeyId?: string,         // which key booked this
externalReference?: string,   // client's own order id (already kind of used for B2C — unify)
```

The `/client-shipments` page should render B2B-API rows with a green **"B2B API"** badge (next to the existing violet "Webhook" badge for B2C). Pure UI tweak in `src/app/(client)/client-shipments/page.tsx`.

---

## 10. Build order (do it in this order, ship each step)

1. **Day 1 — Key minting.** Add `type` + `scopes` to `clientApiKeys`. Update `ApiKeyManager.tsx` to show two tabs ("E-commerce (B2C)" / "Shipping API (B2B)") and let the merchant mint either. Update `lookupApiKey()` to return the type.
2. **Day 2 — `/serviceability`.** Build this endpoint. Reuse the B2C `Address` Zod schema. Mock the rate (just return `5000` paise per carrier) so we can sign off on the contract before plumbing in real rate cards.
3. **Day 3 — `/shipments` (book).** Wire up the `directCarrierOps` dispatcher to a raw-payload entry point. Real DTDC booking first (we have working creds). Add idempotency table.
4. **Day 4 — `/shipments/{id}/label`.** Pure proxy. Reuse existing label routes.
5. **Day 5 — `/shipments/{id}/track` + `/cancel`.** Both are thin wrappers around existing carrier routes.
6. **Day 6 — Real rate cards.** Replace the day-2 stub with a per-courier rate-calc module. Start with DTDC's TAT JSON we already have on disk for serviceability validation.
7. **Day 7 — Rate limiting + docs polish.** Token bucket. Public-facing developer docs page at `/developers` (separate task — this internal spec is the source of truth).

Each step is independently shippable. Do not stack them up; merge daily into `dev`.

---

## 11. What this API is NOT

- It is **not** a public marketplace. Only authenticated Blujay clients (logistics aggregators we've onboarded) get B2B keys. We don't expose `/api/b2b/*` on `blujaylogistic.com` for self-signup.
- It does **not** support multi-piece (multi-box) shipments in v1. One parcel per booking. Add later.
- It does **not** support international shipments in v1. India domestic only (`country: "IN"` enforced in Zod).
- It does **not** support pickup scheduling beyond a date. Time windows come later.
- It does **not** return our internal cost / margin. Only the final rate the client should charge their end-user.

---

## 12. Open questions to resolve before coding

1. **Rate card source of truth.** Do we use each courier's contracted rate card *as-is*, or do we apply the client's configured markup % (already on the client doc as `markupPercent`)? Recommendation: apply markup, because the client *is* charging their end-user — that's the whole point of B2B.
2. **Who eats the cancellation penalty** if the carrier charges one? Today our `/cancel-direct` route doesn't track this. Add a `cancellation_fee_paise` field to the cancel response and let the client decide.
3. **Webhook callbacks.** Do clients want us to POST status changes to *their* URL (e.g. delivered) or are they fine polling `/track`? Most will want webhooks eventually. Out of scope for v1 but design the `events` collection now so we can add it without refactor.

---

## 13. Reference: existing files to read before starting

| File | Why |
|---|---|
| `src/app/api/integrations/orders/webhook/route.ts` | The B2C webhook — copy its auth, logging, idempotency, and error patterns verbatim |
| `src/services/server/apiKeyService.ts` | The key lookup helper — extend, don't fork |
| `src/services/server/resolveCourierCreds.ts` | How we get a tenant's carrier credentials |
| `src/services/server/directCarrierOps.ts` | The dispatcher that already maps a request → carrier-specific payload — wrap it, don't duplicate it |
| `src/app/api/dtdc/order/route.ts` | Working DTDC booking implementation (start with DTDC, BlueDart and Delhivery follow the same shape) |
| `src/components/integrations/ApiKeyManager.tsx` | UI for minting keys — extend with a `type` prop |

---

**End of spec.** Questions go to Bhargav. Do not implement against an earlier draft of this doc — always pull the latest from the repo before starting a sprint.
