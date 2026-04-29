# Shopify App Store — Submission Bundle

Everything needed to submit **Blujay Logistics** to the Shopify App Store. Generated 2026-04-29.

---

## Read this first

👉 **[SUBMISSION-WALKTHROUGH.md](./SUBMISSION-WALKTHROUGH.md)** — the click-by-click guide. Start here.

---

## What's in this bundle

### 🖼️ Visual assets

| File | Purpose | Spec |
|---|---|---|
| `icons/icon-1200-blue.png` | **Primary** App Store icon — recommended | 1200×1200 PNG |
| `icons/icon-1200-white.png` | Backup icon (white background) | 1200×1200 PNG |
| `icons/icon-1200-navy.png` | Backup icon (dark navy) | 1200×1200 PNG |
| `icons/icon-512-*.png` | Smaller icon variants for OS / favicon | 512×512 PNG |
| `icons/logo-wide-2048.png` | Wide transparent logo for marketing | 2048× variable |
| `screenshots/01-landing-hero.png` | Hero shot — strongest, use as listing cover | 1600×900 PNG |
| `screenshots/02-landing-features.png` | Courier integrations + features | 1600×900 PNG |
| `screenshots/03-landing-howitworks.png` | "Signup to first shipment in 10 minutes" | 1600×900 PNG |
| `screenshots/04-landing-services.png` | Stats: 9M+ shipments, 26K+ pin codes | 1600×900 PNG |
| `screenshots/05-get-started.png` | Onboarding form | 1600×900 PNG |
| `screenshots/06-client-login.png` | Client portal login | 1600×900 PNG |

### 📝 Listing content (paste into Partner Dashboard)

| File | Where it goes |
|---|---|
| `listing-copy.md` | App listing fields: tagline, descriptions, features, search terms, scope justifications |
| `reviewer-test-instructions.md` | "Test instructions" field |
| `protected-customer-data.md` | Protected Customer Data application form (apply 1 week before listing review) |

### 🔍 Audit reports

| File | Purpose |
|---|---|
| `legal-audit-report.md` | Privacy Policy + Terms gap analysis. **Patches already applied** to `/src/app/privacy/page.tsx` and `/src/app/terms/page.tsx`. |
| `gdpr-webhook-verification.md` | All 3 GDPR webhook handlers reviewed; HMAC length-check security fix applied |
| `screenshots/screenshots-report.md` | Notes on each screenshot, which routes are auth-gated |

### 🔧 Scripts

| File | Purpose |
|---|---|
| `scripts/generate-icon.mjs` | Re-runnable: `node shopify-listing/scripts/generate-icon.mjs` regenerates all icon variants from `public/logos/blujay-logo.svg` |
| `../scripts/test-gdpr-webhooks.mjs` | Verifies the 3 GDPR endpoints respond 200-in-5s with valid HMAC, 401 with bad HMAC |

---

## Code changes already in this branch

- ✅ Bumped Shopify API version `2024-10` → `2026-01` in `shopify.app.toml`, `src/lib/shopifyWebhook.ts`, `src/app/api/integrations/shopify/fulfill/route.ts`
- ✅ Created `shopify.app.public.toml.template` for the new public app
- ✅ Patched Privacy Policy with all 13 Shopify-required clauses (GDPR Art. 6, sub-processors, CCPA, SCCs, etc.)
- ✅ Patched Terms with Indemnification, SLA/Availability, Shopify App Pricing sections
- ✅ Hardened all 3 GDPR webhook handlers with HMAC length check (prevents 200-on-malformed-attack)

---

## What you still need to do

These are blocked on you, not on me:

| # | Task | Owner | Time |
|---|---|---|---|
| 1 | Run `shopify login` in your terminal (interactive browser auth) | You | 1 min |
| 2 | Replace `[REGISTERED ADDRESS]` and `[COMPANY CIN]` placeholders in `/src/app/privacy/page.tsx` and `/src/app/terms/page.tsx` (search for `[REGISTERED` and `[COMPANY`) | You | 5 min |
| 3 | Confirm `blujaylsolution@gmail.com` is monitored daily (already known to be the active inbox) | You | 0 |
| 4 | Create demo store at partners.shopify.com → Stores → Add → Development store, name it `blujay-review` | You | 10 min |
| 5 | Write a `scripts/seed-demo-store.mjs` to populate one product + place one order *(can also delegate this to me in a follow-up)* | Either | 30 min |
| 6 | Create `/dpa` page (or a DPA section in Privacy Policy) per Field 10 in `protected-customer-data.md` | Either | 30 min |
| 7 | Create `/support` page with a contact form (Formspree, Resend, or simple mailto) | Either | 1 hour |
| 8 | Run through the [SUBMISSION-WALKTHROUGH.md](./SUBMISSION-WALKTHROUGH.md) end to end | You + me | 4-6h spread |

---

## Strategy at a glance

**Free tier for v1.** Shopify's #2 rejection cause is billing misconfiguration. Submitting as Free skips that risk. After approval (3–4 weeks), add paid tiers via `AppSubscription` — re-review takes 3–7 days, far faster than fixing a billing rejection.

**Razorpay stays for the wallet.** Wallet top-ups for actual courier fees are pass-through and unaffected by Shopify's billing policy — that only applies to the SaaS app fee itself.

**Standalone (not embedded).** Higher rejection risk than embedded, but the existing dashboard works well at scale. We've added clear test instructions to make the reviewer's path obvious. If rejected on this point, plan ~1 week for an embedded shell with App Bridge + session tokens.

---

## Timeline expectation

| Phase | Duration |
|---|---|
| Final prep work above (1–8) | 1–2 days |
| Apply for Protected Customer Data | 24–72h wait |
| Submit listing for review | 5–14 days |
| Address any rejection feedback | 3–7 days/cycle, 1–3 cycles typical |
| **Total to live on apps.shopify.com** | **3–6 weeks** |
