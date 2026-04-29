# Reviewer Test Instructions — Blujay Logistics

> Paste the contents of this file (minus this header block) into the **"Test instructions"** field of the App Listing in Partner Dashboard. Reviewers read this verbatim — be specific, omit nothing.

---

## What this app does (90 seconds)

Blujay Logistics syncs Shopify orders into our shipping dashboard, lets the merchant pick a courier (Blue Dart, DTDC), generates the carrier's official AWB label, and posts the tracking number back to Shopify as a fulfillment. The merchant uses Shopify for the storefront; Blujay is the post-order shipping engine.

The app is a **standalone external dashboard** at `https://blujaylogistic.com`. After install, the merchant is taken to our dashboard via a one-time onboarding flow.

---

## Demo store

- **Demo store URL**: `https://blujay-review.myshopify.com`  *(create at partners.shopify.com → Stores → Add → Development store, then prepopulate with the script in /scripts/seed-demo-store.mjs)*
- **Storefront password** (if password page enabled): `blujay2026`
- **Pre-installed?**: Yes — the app is already installed on the demo store. Reviewer can skip the install flow and go straight to step 4 below. If a fresh install test is required, uninstall via Settings → Apps → Blujay Logistics → Uninstall, then proceed from step 1.

## Reviewer login (Blujay dashboard)

- **URL**: `https://blujaylogistic.com/client-login`
- **Email**: `reviewer@blujaylogistics.in`
- **Password**: `BlujayReview!2026`

This account is pre-loaded with sample courier credentials (sandbox/staging) and a test wallet balance of ₹5,000 — enough for ~20 test shipments.

---

## Happy path (5 steps, ~3 minutes)

### Step 1 — Install
1. From the App Store listing page, click **"Add app"**.
2. Choose the demo store, click **"Install app"** on the OAuth consent screen.
3. You'll be redirected to `https://blujaylogistic.com/install/welcome` — Shopify connection succeeds and a one-time onboarding wizard appears.
4. Complete the onboarding (3 fields: business name, pickup address, contact phone). Click **Continue**.

### Step 2 — Place a test order on the demo store
1. Open `https://blujay-review.myshopify.com/products/test-tee` (sample product seeded).
2. Add to cart, go to checkout. Use Shopify's bogus gateway: card `1`, name `Bogus Gateway`.
3. Complete the checkout. Order #1001 appears in the demo store admin.

### Step 3 — Order syncs into Blujay
1. Within ~5 seconds, the order appears in the Blujay dashboard at `/client-shipments`.
2. The shipment row shows the recipient name, address, COD/prepaid badge, and a **"Generate label"** button.

### Step 4 — Pick a courier and generate the label
1. Click **"Generate label"** on the test order.
2. Select **Blue Dart** (sandbox creds are pre-wired for the reviewer account).
3. Choose product type **"Apex"** (next-day) and **prepaid** mode.
4. Click **"Confirm shipment"**. The carrier API returns an AWB number (~2 seconds).
5. A PDF label opens in a new tab, ready to print. The shipment row updates to status **"Manifested"** with the AWB.

### Step 5 — Verify tracking flows back to Shopify
1. Open the demo store admin → Orders → Order #1001.
2. The order shows status **"Fulfilled"** with the carrier name **"Bluedart"** and the AWB number as the tracking ID.
3. Customer order page (in the storefront) shows "Your order has shipped" with the tracking link.

That's the full end-to-end loop. Total time on a fresh install: **~3 minutes**.

---

## Testing GDPR mandatory webhooks

The 3 compliance webhooks are configured in Partner Dashboard → App Setup → Compliance Webhooks. From there:

1. **`customers/data_request`** — Click "Send test." Endpoint at `/api/integrations/shopify/gdpr/customers-data-request` validates HMAC and responds 200. Audit record stored in `gdprDataRequests` Firestore collection. SLA: full data return within 30 days via `blujaylsolution@gmail.com`.
2. **`customers/redact`** — Click "Send test." PII for the named customer is anonymized in our DB within seconds.
3. **`shop/redact`** — Uninstall the app on the demo store. After 48 hours Shopify fires the webhook; our handler removes `shopifyConfig` from the user record and anonymizes all Shopify-origin shipments.

All three respond 200 OK on test pings (validate HMAC even when payload is empty).

---

## Uninstall flow

1. Demo store → Settings → Apps and sales channels → Blujay Logistics → Uninstall.
2. Shopify fires `app/uninstalled` to `/api/integrations/shopify/webhook`.
3. Our handler marks the merchant's `shopifyConfig.isConnected = false` and revokes stored tokens.
4. Their dashboard remains accessible (so they can export historical data) but no new orders sync.

---

## Things you won't see (and why)

- **No embedded admin UI.** This app is intentionally standalone — merchants ship dozens of orders per session and benefit from a wider canvas than the embedded iframe allows. Session-token auth is unused for this reason; instead we use signed OAuth state + HMAC-validated webhooks.
- **No theme app extensions.** The app does not modify the storefront. Tracking links are surfaced through Shopify's native order status page (the carrier tracking number on the fulfillment).
- **No paid tier in this v1 listing.** Launch is free; paid plans will be added post-approval via Shopify's `AppSubscription`.

---

## Contact during review

If anything is unclear or breaks during testing, please email `blujaylsolution@gmail.com` — that inbox is monitored by a human, target response within 4 working hours during India business hours (09:30–19:00 IST, Mon–Sat).
