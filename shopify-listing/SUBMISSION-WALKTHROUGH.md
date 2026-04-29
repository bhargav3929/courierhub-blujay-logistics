# Shopify App Store Submission — Step-by-Step Walkthrough

> Read this end to end before starting. Total estimated time:
> - **Active work**: 4–6 hours spread across 2 days
> - **Wait time**: 24–72h for Protected Customer Data + 5–14 days for first review

This walkthrough assumes everything in `/shopify-listing/` is ready (icons, screenshots, listing-copy.md, reviewer-test-instructions.md, protected-customer-data.md, legal-audit-report.md).

---

## 0. Prerequisites (do once)

Before any of the steps below:

```bash
# 1. Make sure Shopify CLI is up to date
npm install -g @shopify/cli@latest
shopify version
# expect 3.91.0+

# 2. Authenticate (opens browser)
shopify auth logout      # clear any old session
shopify login            # log in as the Partner account that owns Blujay
```

You also need:
- [ ] A Shopify Partner account at partners.shopify.com
- [ ] At least one Development Store created at partners.shopify.com → Stores
- [ ] Your registered legal entity name + address (for the listing + Privacy Policy)
- [ ] Decided pricing: **Free** for v1 (recommended for first-attempt approval)

---

## 1. Create the new public app

Two ways — pick one.

### Option A: via Shopify CLI (recommended)

```bash
cd "/Users/bhargav/Desktop/bluejay /courierhub-blujay-logistics-2"

# Interactive — creates the app on Partner Dashboard and writes a config file
shopify app init --name "Blujay Logistics" --client-id none

# When prompted: choose "Build for Shopify App Store"
# When prompted: choose "Connect to existing app" → "Create new app"
# This writes a real shopify.app.public.toml with the new client_id
```

If `shopify app init` insists on creating a new directory, use Option B.

### Option B: via Partner Dashboard (web)

1. Open https://partners.shopify.com → **Apps** → **Create app** → **Create app manually**.
2. **App name**: `Blujay Logistics`
3. **App URL**: `https://blujaylogistic.com`
4. **Allowed redirection URL(s)**: `https://blujaylogistic.com/api/integrations/shopify/callback`
5. Click **Create**. You now have a new **Client ID** + **Client Secret**.

### After either option

Open the file `shopify.app.public.toml.template`, copy it to `shopify.app.public.toml`, replace `REPLACE_WITH_NEW_PUBLIC_APP_CLIENT_ID` with the new client ID, then:

```bash
shopify app config use shopify.app.public.toml
shopify app deploy
# Confirms the app config (scopes, webhooks, redirect URLs) is registered with Shopify
```

Add the new app's secret to `.env.local`:
```bash
SHOPIFY_PUBLIC_API_KEY=<new client id>
SHOPIFY_PUBLIC_API_SECRET=<new client secret>
```

> **Important**: Do NOT delete the existing 5 toml configs. Each Custom Distribution client (Looms, Gayatri, etc.) keeps using their own app. The public listing is a 6th, parallel app.

---

## 2. Wire env vars + ship the deploy

The OAuth + webhook code paths key off env vars per app. The new public app needs its own env vars added to Vercel:

```bash
# In the Vercel dashboard for the blujaylogistic.com project:
# Settings → Environment Variables → add:
SHOPIFY_PUBLIC_API_KEY=<new client id>
SHOPIFY_PUBLIC_API_SECRET=<new client secret>
```

Then in `src/app/api/integrations/shopify/install/route.ts` and `callback/route.ts`, ensure that when the public app's client ID is the install initiator, the code reads `SHOPIFY_PUBLIC_*` instead of one of the existing client-specific keys.

> 🔧 **Code-side TODO** (not done yet): the existing OAuth handlers branch on app-specific paths (`/shopify`, `/shopify-looms`, `/shopify-gayatri`). The default `/shopify` path is currently the "Blujay Logistics Client" app. We will repurpose `/shopify` to be the public app and rename the existing client app to use one of the other paths, OR add a new `/shopify-public` set of routes. Decide before deploy. *(This is the only meaningful code change needed before submission — covered in step 8 below.)*

Push to `main` → Vercel auto-deploys. Test the OAuth flow on a development store before proceeding to step 3.

---

## 3. Apply for Protected Customer Data (do this first — 24-72h wait)

1. Partner Dashboard → Apps → **Blujay Logistics** → **API access** → **Protected customer data access**.
2. Click **Request access**.
3. Open `/shopify-listing/protected-customer-data.md` and paste each answer into the corresponding field. Field-by-field mapping is in that document.
4. Submit. You'll receive an email decision within 24–72 hours.

> Do this **first** so the approval lands before you submit the listing. Submitting the listing while PCD is pending will queue you for an avoidable rejection cycle.

---

## 4. Configure Compliance (GDPR) Webhooks

Already in `shopify.app.public.toml.template`. After `shopify app deploy` they're registered automatically. Verify:

1. Partner Dashboard → Apps → Blujay Logistics → **App setup** → **Compliance webhooks**.
2. All three rows should show your URLs:
   - `customers/data_request` → `https://blujaylogistic.com/api/integrations/shopify/gdpr/customers-data-request`
   - `customers/redact` → `https://blujaylogistic.com/api/integrations/shopify/gdpr/customers-redact`
   - `shop/redact` → `https://blujaylogistic.com/api/integrations/shopify/gdpr/shop-redact`
3. For each, click **Send test notification**. All three must respond **200 OK** within 5 seconds.

If any returns non-200, fix it before proceeding. The verification script at `/scripts/test-gdpr-webhooks.mjs` (created in step 7) runs the same checks locally.

---

## 5. Build the demo store

1. partners.shopify.com → **Stores** → **Add store** → **Development store** → "Create a store to test and build".
2. Name: `blujay-review` (URL will be `blujay-review.myshopify.com`).
3. Once created, install your public app on it (from the Partner Dashboard → Apps → Blujay Logistics → **Test on development store**).
4. Run the seed script:
   ```bash
   node scripts/seed-demo-store.mjs --shop blujay-review.myshopify.com --token $DEMO_STORE_ADMIN_TOKEN
   ```
   *(Script not yet created — straightforward to write: imports a few products via Admin API, places one test order via Storefront API. Track this as a separate todo.)*

5. In Blujay's own dashboard, create the reviewer login:
   - Email: `reviewer@blujaylogistics.in`
   - Password: `BlujayReview!2026`
   - Pre-loaded with sandbox courier credentials and ₹5,000 wallet balance.

---

## 6. Fill the App listing (Partner Dashboard)

Partner Dashboard → Apps → Blujay Logistics → **Distribution** → choose **Public Distribution** if not already → then go to **App listing**.

For each tab, paste from `/shopify-listing/listing-copy.md`:

| Listing field | Source in listing-copy.md |
|---|---|
| App name | "Blujay Logistics" |
| App icon | `/shopify-listing/icons/icon-1200-blue.png` |
| Tagline | Section "Tagline" |
| Intro / Short description | Section "Intro / Short description" |
| Detailed description | Section "Detailed description" |
| Key benefits (3) | Section "Key benefits" |
| Feature bullets (10) | Section "Feature bullets" |
| Search terms (5) | Section "Search terms" |
| Primary category | Orders & shipping → Shipping labels |
| Secondary categories | Order tracking; Shipping rate calculators |
| Pricing | Free (single plan, $0) |
| Screenshots (6) | All 6 PNGs from `/shopify-listing/screenshots/` |
| Demo video | (skip — optional) |
| Support email | `blujaylsolution@gmail.com` |
| Support URL | `https://blujaylogistic.com/support` *(create this page first — see step 7)* |
| Privacy policy URL | `https://blujaylogistic.com/privacy` |
| Terms of service URL | `https://blujaylogistic.com/terms` |
| Languages supported | English |
| Test instructions | Paste full body of `/shopify-listing/reviewer-test-instructions.md` |

---

## 7. Pre-submission code/content checklist (do these BEFORE clicking Submit)

- [ ] **Patch Privacy Policy** with the 7 missing clauses listed in `legal-audit-report.md`. Replace `[REGISTERED ADDRESS]` and `[COMPANY CIN]` placeholders with real values.
- [ ] **Patch Terms** with Indemnification + SLA + Shopify Pricing sections per the report.
- [ ] **Create `/dpa` page** OR add an explicit DPA section inside the Privacy Policy and link to that anchor.
- [ ] **Create `/support` page** with a contact form posting to `blujaylsolution@gmail.com`. Even a simple form is enough.
- [ ] **Run** `node scripts/test-gdpr-webhooks.mjs` *(create this script — calls each of the 3 GDPR endpoints with a fake-but-valid HMAC; expects 200 within 5s and 401 with bad HMAC)*.
- [ ] **Confirm** support inbox `blujaylsolution@gmail.com` is being checked at least once per business day.
- [ ] **Run** the OAuth install flow end-to-end on `blujay-review.myshopify.com` and time it: install → first usable shipment in ≤ 5 minutes.
- [ ] **Audit** that no `console.error` or React error overlay appears on landing/install/dashboard pages in production build.
- [ ] **Verify** API version is `2026-01` everywhere (already done in `shopify.app.toml`, `src/lib/shopifyWebhook.ts`, `src/app/api/integrations/shopify/fulfill/route.ts`).
- [ ] **Verify** the new `shopify.app.public.toml` has `use_legacy_install_flow = false` (the existing client config has it `true`; the public app must use modern install).

---

## 8. Code change required before submission (single, focused diff)

The existing `/shopify` route group is currently bound to the "Blujay Logistics Client" Custom Distribution app via `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`. For the public listing we need either:

**Option A (recommended)**: Make `/shopify` the *public* app and rename the existing client app to a new namespace.
  - Pros: clean URLs for the public listing
  - Cons: requires migrating the existing "Blujay Logistics Client" Custom Distribution to a new path; small risk of disrupting that client

**Option B (safer)**: Add new `SHOPIFY_PUBLIC_API_KEY` / `SHOPIFY_PUBLIC_API_SECRET` env vars and add a tiny resolver in `install/route.ts` and `callback/route.ts` that routes by query param `?app=public` or by initiator client_id.
  - Pros: zero impact on existing clients
  - Cons: an extra branch in the OAuth code

**Recommendation**: Option B for v1. Touch the smallest possible surface area to ship the listing. Once approved and stable for ~30 days, optionally consolidate.

---

## 9. Submit

Partner Dashboard → Apps → Blujay Logistics → **App listing** → top-right **Submit for review**.

Shopify will:
1. Run automated checks (icon dimensions, link health, webhook reachability) — instant fail/pass.
2. Queue for human review — typically **5–10 business days**, longer in Q4.
3. Email a decision: Approved / Needs changes (with specific feedback).

If "Needs changes":
- Fix the items called out
- Reply in the review thread
- Re-submit (3–7 day re-review)
- Most apps need 2–3 cycles. Plan for it.

---

## 10. Post-approval

- App goes live on apps.shopify.com within 24h
- Track installs / uninstalls in Partner Dashboard analytics
- Add **paid tier** via Shopify `AppSubscription` API (covered in a separate doc once we get there)
- Apply for **Built for Shopify** badge after 30 days of stable installs

---

## Quick reference — files in `/shopify-listing/`

| File | Purpose |
|---|---|
| `icons/icon-1200-blue.png` | Primary App Store icon (recommended) |
| `icons/icon-1200-white.png` | Backup icon (white background) |
| `icons/icon-1200-navy.png` | Backup icon (dark navy) |
| `screenshots/01-06-*.png` | 6 listing screenshots, 1600×900 |
| `listing-copy.md` | Tagline / description / features / search terms |
| `reviewer-test-instructions.md` | Paste into "Test instructions" field |
| `protected-customer-data.md` | Paste into Protected Customer Data application |
| `legal-audit-report.md` | Privacy Policy + Terms gap analysis |
| `SUBMISSION-WALKTHROUGH.md` | This file |
