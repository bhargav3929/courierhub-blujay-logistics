# Shopify App Store — Screenshots Report

**Generated**: 2026-04-29
**Spec**: 1600x900 PNG (Shopify App Store listing requirement)
**Source app**: Blujay Logistics (Next.js 16.1.1) running locally on `http://localhost:3100`
**Capture method**: Headless Chromium via Playwright. All animations/transitions disabled at capture time. Next.js dev overlay hidden. No browser chrome, no `localhost:3000` text in any frame.

## Captured screenshots

| # | File | Route | What it shows | Notes |
|---|---|---|---|---|
| 1 | `01-landing-hero.png` | `/` (top) | Hero — "The last shipping platform you'll ever need" headline, dashboard preview card showing shipment volume chart and KPI tiles, top nav with Login + Get Started, Blujay logomark. | Best primary screenshot for the listing. |
| 2 | `02-landing-features.png` | `/` (scrollY 900) | Courier integrations strip (Delhivery, BlueDart, DTDC, Ekart, Shadowfax, Xpressbees, Amazon Shipping, Gati, Rivigo, FedEx, Ecom Express) plus start of Features section ("Built different, not decorated.") with Rate Comparison / Multi-Carrier / Live Tracking cards. | Highlights the multi-courier value prop. |
| 3 | `03-landing-howitworks.png` | `/` (scrollY 1800) | Tail of feature cards (Analytics Dashboard, Wallet & Billing, AI Auto-Allocate) plus start of the "From signup to first shipment in 10 minutes" 3-step process — Create account, Connect your store, Compare & book. | Mentions "One-click integration with Shopify" — directly relevant. |
| 4 | `04-landing-services.png` | `/` (scrollY 2800) | Stats row (9M+ shipments processed, 26K+ pin codes covered, 46K+ active businesses, 13+ courier partners) plus Services section header ("Every mile, covered.") with Express Delivery service card. | Strong social-proof slide. |
| 5 | `05-get-started.png` | `/get-started` | Onboarding form: Business Type cards (Franchisee / Ecommerce Seller — B2C / Shopify orders), Full Name, Company Name, Email, Phone, optional Message, Submit Inquiry button. | Demonstrates lightweight onboarding. |
| 6 | `06-client-login.png` | `/client-login` | "Welcome Back" client portal login — email + password fields, Sign Up link, Client Portal badge. | Gated app entry point. |

## Routes NOT captured (auth-gated)

These routes redirect to `/client-login` without an authenticated session. Skipped per task instructions:

- `/(client)/client-shipments` — shipments list view
- `/(client)/add-shipment` — courier picker / create shipment flow
- `/(admin)/shipments` — admin shipments
- `/(admin)/couriers` — courier connection management
- `/track` — no public tracking page; tracking lives inside the authed app

**Recommendation**: To capture the gated dashboard screens (shipments list, create-shipment courier picker, courier integrations panel, tracking detail), recapture with a real demo store seeded in Firestore and an authenticated client session. Suggested filenames: `07-shipments-list.png`, `08-create-shipment.png`, `09-courier-integrations.png`, `10-tracking-detail.png`.

## Quality checklist

- [x] Exact 1600x900 PNG dimensions (verified via `sips`)
- [x] No browser chrome (headless Playwright capture)
- [x] No `localhost:3000` visible — content shows Blujay branding only
- [x] Next.js dev indicator / error overlay hidden via injected CSS
- [x] Animations disabled so layouts are stable
- [x] Each screenshot waits 2.5s after networkidle + 1.2s after scroll before capture

## Companion file

- `_capture-results.json` — machine-readable record of each capture (url, file, label, byte size).
