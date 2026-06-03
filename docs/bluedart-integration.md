# Blue Dart Integration — Complete Reference Guide

> **Purpose:** This is the single source of truth for how Blue Dart is wired into Blujay Logistics.
> If you (or Claude) ever need to understand, debug, or extend the Blue Dart integration —
> start here. Last verified working: **3 June 2026** (live AWB `90537386774` generated in production).

---

## 1. What Blue Dart is and how it's used

Blue Dart is the primary courier integration. It is a **B2C eTail** contract (not B2B) on a single
Blue Dart account. The same account/credentials serve every tenant; only the **Customer Code**
(a 6-digit contract identifier) differs per contract type.

Three shipment sources all funnel into the same Blue Dart booking flow:
- Manual booking via `/add-shipment`
- Shopify orders (via `?shopifyShipmentId=<id>` on `/add-shipment`)
- Merchant-API orders

---

## 2. File map — every file involved

| Layer | File | Responsibility |
|---|---|---|
| **Client service** | `src/services/blueDartService.ts` | Singleton `blueDartService`. JWT auth + caching, axios interceptors, wraps each API route. |
| **Config / defaults** | `src/config/bluedartConfig.ts` | `BLUEDART_PREDEFINED` (customer codes, pickup, product), `BLUEDART_SERVICE_TYPES`, Excel columns. |
| **Cred resolver** | `src/services/server/resolveCourierCreds.ts` → `resolveBlueDartCreds()` | Per-tenant creds from `clients/{id}/courierIntegrations.bluedart`, else platform env fallback. |
| **API routes** | `src/app/api/bluedart/*` | Server proxies to Blue Dart's real API (avoids CORS, hides secrets, caches token). |
| **Booking UI** | `src/app/(client)/add-shipment/page.tsx` → `handleBookBlueDart()` | Builds the nested `Request.{Consignee,Shipper,Services}` payload and dispatches. |
| **Label** | `src/components/shipments/BlueDartLabel.tsx` | Custom HTML label rendered with `react-barcode` (not a PDF from Blue Dart). |
| **Shipments list** | `src/app/(client)/client-shipments.tsx`, `src/app/(admin)/shipments/page.tsx` | Courier-aware label / cancel / tracking. |

### API routes under `src/app/api/bluedart/`
| Route | Blue Dart endpoint | Purpose |
|---|---|---|
| `generate-waybill/` | `POST /waybill/v1/GenerateWayBill` | **The booking step.** Creates AWB + registers pickup. |
| `track-shipment/` | tracking API | AWB tracking (tracking license handled server-side). |
| `cancel-shipment/` | cancel waybill | Cancel an AWB. |
| `validate-pincode/` | location finder | Serviceability / pincode lookup. |
| `get-products/` | products master | Valid product / sub-product combos. |
| `export-excel/` | — | Excel export in Blue Dart's exact column format. |

---

## 3. Authentication

- **Auth type:** JWT (Bearer). Obtained from `GET /token/v1/login` with `clientID` + `clientSecret` as query params.
- **Token validity:** ~24h. Cached **per credential-set** (keyed by `clientId` or `'platform'`) inside the
  server route (`tokenCache` Map in `generate-waybill/route.ts`) and also client-side in `blueDartService`
  (5-min safety buffer; auto-refresh on 401 via response interceptor).
- **Two distinct credential pairs** (do not confuse them):
  - `ClientID` + `clientSecret` → used to obtain the JWT (the OAuth-ish pair).
  - `LoginID` + `LicenceKey` → sent in the `Profile` block of every booking payload (the account identity).

### Environment variables (all `NEXT_PUBLIC_*` — see security note)
| Var | Example | Meaning |
|---|---|---|
| `NEXT_PUBLIC_BLUEDART_CLIENT_ID` | — | JWT clientID |
| `NEXT_PUBLIC_BLUEDART_CLIENT_SECRET` | — | JWT clientSecret |
| `NEXT_PUBLIC_BLUEDART_LOGIN_ID` | `HYD64586` | Profile LoginID |
| `NEXT_PUBLIC_BLUEDART_LICENSE_KEY` | — | Profile LicenceKey |
| `NEXT_PUBLIC_BLUEDART_AREA` | `HYD` | Billing/origin area code |
| `NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE` | `302282` | **B2C** customer code (default) |
| `NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE_B2B` | `101183` | B2B customer code |
| `NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE_SHOPIFY` | `302282` | Shopify-tenant customer code (currently same as B2C) |
| `NEXT_PUBLIC_BLUEDART_ENV` | `production` | `production` → prod gateway, else sandbox |

> ⚠️ **These are `NEXT_PUBLIC_*`, so they are baked into the browser bundle at build time.**
> Two consequences:
> 1. They expose Blue Dart secrets to the client (a known pre-existing security debt — do not add *new* `NEXT_PUBLIC_` secrets).
> 2. **Changing an env var on Vercel does nothing until you redeploy** — the value is inlined at build, not read at runtime.

### API gateways
- Production: `https://apigateway.bluedart.com/in/transportation`
- Sandbox:   `https://apigateway-sandbox.bluedart.com/in/transportation`

---

## 4. The Customer Code model (READ THIS BEFORE TOUCHING CODES)

A **Customer Code** is the 6-digit contract identifier Blue Dart provisions per contract. Selection logic
lives in `handleBookBlueDart` (`add-shipment/page.tsx`):

```ts
CustomerCode: currentUser?.role === 'shopify'
    ? BLUEDART_PREDEFINED.billingCustomerCodeShopify   // Shopify tenants
    : isB2C
        ? BLUEDART_PREDEFINED.billingCustomerCode       // B2C (302282)
        : BLUEDART_PREDEFINED.billingCustomerCodeB2B    // B2B (101183)
```

**Rules learned the hard way:**
- Only a **provisioned** customer code works. Inventing a code (e.g. a "dedicated Shopify code" `302352`)
  that Blue Dart never activated → **`UnauthorizedUser: User not authorized to register pickup for
  specified Area Customer code`**. The verified working code is **`302282`**.
- Codes are now `.trim()`'d in `bluedartConfig.ts` — a stray newline (`"302282\n"`) in an env var
  produces an invalid code and the same `UnauthorizedUser` error. Never let whitespace into these values.
- B2B vs B2C: per Blue Dart, **only the 6-digit customer code differs** between contracts — same auth,
  same LoginID, same everything else.

---

## 5. Products & service types (B2C eTail)

Defined in `BLUEDART_SERVICE_TYPES` (`bluedartConfig.ts`):

| Key | Code | Display | B2C? | Notes |
|---|---|---|---|---|
| `APEX` | `A` | Blue Dart Air | ✅ | Air express |
| `BHARAT_DART` | `A` | Blue Dart Surface | ✅ | packType `L` |
| `SURFACE` | `E` | Dart Surfaceline | (B2B-only flag) | Ground |
| `PRIORITY` | `D` | Domestic Priority | ❌ B2B-only | **Removed from B2C UI** |

**B2C eTail specifics (from APIGATEWAY SPECIFICATIONS / Products Master):**
- `SubProductCode` is always sent: **`P`** (prepaid) or **`C`** (COD).
- Only **A (Apex)** and **E (Surfaceline)** support B2C. **D (Priority) is B2B-only.**
- `ProductType` default `NDOX` (Non-Document / Dutiables).

---

## 6. Booking payload shape

Blue Dart uses a **nested** request (contrast with Delhivery's flat `shipments[]` and DTDC's
`origin_details`/`destination_details`). Built in `handleBookBlueDart`:

```
{
  Request: {
    Consignee: { ConsigneeName, ConsigneeAddress1..3, ConsigneePincode, ConsigneeMobile, ... },
    Shipper:   { CustomerName, CustomerCode, CustomerAddress1..3, CustomerPincode,
                 OriginArea, Sender, isToPayCustomer, ... },
    Services:  { ProductCode, ProductType, SubProductCode, PieceCount, ActualWeight,
                 DeclaredValue, RegisterPickup, COD fields (only when COD enabled), ... }
  },
  Profile: { LoginID, LicenceKey, Api_type: 'S', Version: '1.10' }   // injected by service/route
}
```

- Address fields are sliced to **30 chars** per line (`ConsigneeAddress1` = chars 0–30, `2` = 30–60, `3` = city).
- COD fields are **only** included when COD is enabled (sending them otherwise causes errors).
- The `__clientId` convention: the client passes `__clientId` in the body; the server route strips it
  and uses it to resolve that tenant's creds (overriding the `Profile` block with their LoginID/LicenceKey).

### Response handling (success + idempotent recovery)
`GenerateWayBillResult` (or the raw response) carries `IsError`, `AWBNo`, `Status[]`.
- `IsError === false` → success; read `AWBNo`, `DestinationArea`, `DestinationLocation`, `TokenNumber`.
- **Idempotency recovery (important):** Blue Dart keys on the **CreditReferenceNo**. If an order was already
  booked but its AWB failed to save, a retry returns `IsError:true` with
  `"Waybill already genereated for this CreditReferenceNo. Waybill No : <awb>"`. The code now **parses that
  AWB out of the status message and treats it as success** instead of dead-ending. Changing the From/To
  city does NOT bypass this — the reference number is the key.

---

## 7. Booking → save flow (and the trap)

The waybill is generated **first**, then the shipment is saved to Firestore:
- Shopify order → `updateShipment(shopifyShipmentId, data)`
- Other → `createShipment(data)`

**Trap (fixed):** Firestore's `addDoc`/`updateDoc` reject **`undefined`** field values. A Shopify-proceed
booking could leave optional fields (`courierCharge`, `collectableAmount`, …) undefined, so the AWB was
generated at Blue Dart but never saved → UI showed **"Failed to update shipment"** while a real AWB was
orphaned. **Fix:** Firestore is initialized with `ignoreUndefinedProperties: true`
(`src/lib/firebaseConfig.ts`), so undefined keys are dropped instead of throwing.

> **Design caution:** Because the AWB is generated before the save, any save failure orphans a real,
> billable pickup. The idempotency-recovery logic (§6) is what makes a retry safe.

---

## 8. Tracking, cancel, label

- **Tracking:** `blueDartService.trackShipment(awb)` → `/api/bluedart/track-shipment`. Tracking license
  is handled server-side. Shipment docs store `courier: 'Blue Dart'` and `courierTrackingId` (the AWB).
- **Cancel:** `blueDartService.cancelWaybill(awb)` → `/api/bluedart/cancel-shipment`. UI branches on
  `shipment.courier` to call the right service.
- **Label:** Custom HTML via `BlueDartLabel.tsx` + `react-barcode` (Blue Dart does not return a PDF label
  for this flow). Label dialogs branch on `shipment.courier`.
- `registerPickup()` in the service is a **stub** — pickup registration happens inside `GenerateWayBill`
  (the `RegisterPickup` flag), so the separate route was never implemented.

---

## 9. Per-tenant credentials

`resolveBlueDartCreds(clientId)`:
1. Loads `clients/{clientId}/courierIntegrations.bluedart` (encrypted via `courierCredCrypto.ts`).
2. If present, uses that tenant's `{loginId, licenseKey, customerCode, customerCodeB2B, areaCode, environment}`.
3. Otherwise falls back to the platform `NEXT_PUBLIC_BLUEDART_*` env vars.

So a tenant who connects their own Blue Dart account on the Integrations page bills against their own
contract; everyone else uses the platform account.

---

## 10. Known errors & what they actually mean

| Error message | Real cause | Fix |
|---|---|---|
| `UnauthorizedUser: User not authorized to register pickup for specified Area Customer code` | Customer code not provisioned/authorized by Blue Dart for that area (or whitespace in the code). | Use a provisioned code (`302282`); ensure no `\n`/spaces; or have Blue Dart enable the code. |
| `Waybill already genereated for this CreditReferenceNo. Waybill No : <awb>` | Order already booked (idempotency on CreditReferenceNo); a prior attempt's AWB didn't save. | Not an error — code now recovers the AWB. Don't change cities to "retry"; that does nothing. |
| `Failed to update shipment` (after a waybill toast) | Firestore rejected an `undefined` field; AWB generated but not saved. | Fixed via `ignoreUndefinedProperties`. Real AWB exists — reconcile, don't re-book. |
| 401 from Blue Dart | Expired/invalid JWT. | Auto-handled: response interceptor refreshes token once and retries. |

---

## 11. Operational runbook

**Change a customer code in production:**
1. Update the var on Vercel (`vercel env rm` + `vercel env add`, or dashboard). Use `printf "302282"` (no newline!).
2. **Redeploy** — `NEXT_PUBLIC_*` is baked at build time. `vercel redeploy <latest-url>` rebuilds with new env.
3. Verify with `vercel env pull /tmp/x.env --environment=production` then `grep ... | cat -v` (reveals hidden chars).
4. Hard-refresh the browser (Cmd+Shift+R) to drop the old bundle before testing.

**Debugging a failed booking:**
- The `generate-waybill` route runs **server-side** → check **Vercel runtime logs** for the real Blue Dart response.
- The booking→save logic runs **client-side** → check the **browser console** for Firestore errors.

---

## 12. Quick facts (TL;DR)

- Verified working customer code: **`302282`** (B2C). LoginID **`HYD64586`**, Area **`HYD`**.
- B2C only: products **A** (Air) and **E** (Surfaceline). **D is B2B-only.** SubProductCode `P`/`C` always sent.
- Auth = JWT (24h, cached per credential-set, auto-refresh on 401).
- Booking endpoint = `POST /waybill/v1/GenerateWayBill`; AWB also registers the pickup.
- Idempotency key = CreditReferenceNo; duplicate booking returns the existing AWB (now auto-recovered).
- `NEXT_PUBLIC_*` env = baked at build → **always redeploy after changing**, and never store new secrets there.
- Codes are `.trim()`'d; Firestore drops `undefined`.
</content>
</invoke>
