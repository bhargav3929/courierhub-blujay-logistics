# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Blujay Logistics — a multi-tenant logistics SaaS that lets merchants book and track shipments across multiple Indian couriers (BlueDart, Delhivery, DTDC) plus a Shopify integration. Live in production at `blujaylogistic.com` (Vercel) backed by Firebase project `blujay-dd8cd`.

## Commands

```bash
npm run dev      # Next.js dev with Turbopack (validates license first)
npm run build    # Production build (validates license first)
npm run start    # Production server (validates license first)
npm run lint     # ESLint (next lint)
```

The repo also uses `bun.lockb` alongside `package-lock.json` — pick one before installing to avoid drift. README still references Vite but the app has been migrated to Next.js 16 (App Router).

### Test/diagnostic scripts

```bash
node scripts/create-test-order.mjs <email|uid>    # inject a tagged test order
node scripts/delete-test-orders.mjs                # remove tagged test orders
node scripts/test-merchant-webhook.mjs             # end-to-end webhook smoke test (mint key → POST → verify shipment → idempotency → revoke)
```

These scripts use the firebase-admin SDK directly (read `FIREBASE_SERVICE_ACCOUNT_KEY` from `.env.local`) and never touch real customer data — they filter on `metadata.source === 'create-test-order.mjs'`.

## ⚠️ License gate — read this before running

The app refuses to start without a valid `BLUJAY_LICENSE_KEY`. Validation runs twice:

- `scripts/validate-license.mjs` (npm `predev`/`prebuild`/`prestart` hooks)
- `next.config.mjs` (at Next config-load time)

Both SHA-256-hash the env value and compare to a hardcoded hash. **Never bypass these checks.** If `npm run dev` exits with `LICENSE ERROR`, the key in `.env.local` is missing or wrong. On Vercel the value is injected from project env vars; locally it must be in `.env.local`.

## Big-picture architecture

### Stack

Next.js 16 App Router · TypeScript · Tailwind + shadcn/ui (~50 components in `src/components/ui`) · Firebase (Auth + Firestore + Admin SDK) · framer-motion · zod · axios · sonner toasts · date-fns · lucide-react.

### Route groups

- `src/app/(admin)/*` — platform admin pages (admin-dashboard, clients, couriers, shipments, reports, settings, client-requests)
- `src/app/(client)/*` — merchant ("client") portal (client-dashboard, client-shipments, add-shipment, client-customers, client-integrations, client-reports, client-settings, client-sub-accounts)
- Public marketing pages at root: `/`, `/get-started`, `/privacy`, `/terms`, `/dpa`, `/white-label-onboarding`, `/client-login`, `/client-signup`
- `src/app/api/*` — server routes (see below)
- `src/middleware.ts` — auth/tenant routing. Next.js 16 warns this should migrate to `proxy.ts` — non-blocking.

### Multi-tenant model

The word "client" in this codebase means a **merchant tenant**, NOT an end consumer. Three client types: `'franchise'` (default), `'shopify'`, `'white_label'`. Sub-account hierarchy is supported (`src/services/subAccountService.ts`).

Per-tenant credentials are stored encrypted under `clients/{clientId}/courierIntegrations.{courierId}` (see `src/lib/courierCredCrypto.ts`). Server routes resolve creds via `src/services/server/resolveCourierCreds.ts` which falls back to platform env vars when a tenant hasn't connected the integration.

The platform supports 5 separate Shopify apps via `shopify.app.*.toml` files (public, client2, client3, looms, gayatri). Each has its own webhook route under `src/app/api/integrations/shopify*/webhook/route.ts`.

### Carrier integration pattern (BlueDart / Delhivery / DTDC)

The same shape repeats across all three carriers:

1. `src/services/<courier>Service.ts` — client-side singleton that calls `/api/<courier>/*` via axios
2. `src/app/api/<courier>/<operation>/route.ts` — server route that calls the carrier's actual API
3. Per-credential-set token cache lives in the server route (e.g. BlueDart caches OAuth tokens per `clientId`)
4. Request bodies use the `__clientId` convention to pass the tenant id through

Add-shipment ([src/app/(client)/add-shipment/page.tsx](src/app/(client)/add-shipment/page.tsx)) is the canonical example: it builds carrier-specific payloads (BlueDart's nested `Request.{Consignee,Shipper,Services}`, Delhivery's `pickup_location` + `shipments[]`, DTDC's flat `origin_details`/`destination_details`) and dispatches based on `selectedCourier`.

`src/config/<courier>Config.ts` holds predefined defaults (customer code, pickup address, service types).

### Shipment intake — three sources, one collection

All shipments land in the single `shipments` Firestore collection. The `status` field distinguishes the source:

| Source | Entry point | Initial status |
|---|---|---|
| Manual via admin | `/add-shipment` page | `'pending'` after booking |
| Shopify order | `/api/integrations/shopify*/webhook` (HMAC-verified) | `'shopify_pending'` |
| Merchant API (own storefront) | `/api/integrations/orders/webhook` (API-key auth) | `'webhook_pending'` |

The `/client-shipments` page treats `shopify_pending` and `webhook_pending` identically — both go in the "New Orders" tab with a [Proceed] action that opens `/add-shipment?shopifyShipmentId=<id>` (the query param name is a misnomer but accepts both statuses). The `webhookSource` field on the shipment marks merchant-API rows visually with a violet "Webhook" badge.

### Authentication — two paths

[src/lib/serverAuth.ts](src/lib/serverAuth.ts) handles both:

- **`Authorization: Bearer <Firebase ID token>`** — admin portal users. Resolved via `adminAuth.verifyIdToken()`.
- **`X-Blujay-Api-Key: bj_<32hex>`** — merchant backends. SHA-256 hash lookup in the top-level `clientApiKeys` collection.

Routes call `authenticateRequest(req)`, which returns either an `AuthedClient` (with `clientId` + `source`) or a `NextResponse` error to return directly.

API keys are minted via `/api/client/api-keys` (Bearer-only). Raw keys are returned exactly once on creation; only the hash + a non-secret `keyPrefix` are persisted. Merchants manage their keys from the bottom of `/client-integrations` (see `src/components/integrations/ApiKeyManager.tsx`).

### Firebase access pattern

- **Server routes** use firebase-admin: `getFirestore(adminApp)` for Firestore writes, `adminAuth.verifyIdToken()` for token verification. Admin SDK **bypasses Firestore rules** — this is how server routes write to read-locked collections.
- **Client (browser) code** uses `firebase/firestore` directly via `db` from `src/lib/firebaseConfig.ts`. Reads are gated by `firestore.rules`.
- `src/lib/firebaseAdmin.ts` parses `FIREBASE_SERVICE_ACCOUNT_KEY` from env. Dotenv converts `\n` to literal newlines but JSON expects escaped `\\n`, so the loader re-escapes before `JSON.parse` — don't reverse that without thinking.

### Firestore collections currently used

`users` (Firebase Auth profiles) · `clients` (tenant docs, includes `defaultPickupAddress`, `courierIntegrations`, `apiKeys` etc.) · `shipments` (all shipments, all sources) · `courierAPIs` (courier metadata catalogue) · `clientRequests` (signup/contact submissions) · `gdprDataRequests` (Shopify GDPR webhook log) · `_connection_monitor` (diagnostic ping) · `clientApiKeys` (merchant API keys — SHA-256 hash + `keyPrefix` for display).

`firestore.rules` currently allows `read, write: if true` on every collection — wide open. Any tightening must enumerate every collection used in the codebase because Firestore evaluates rules with OR semantics (a permissive catch-all overrides any specific deny).

## Conventions

- **Indentation**: 4 spaces (most existing files; ESLint enforces).
- **Service files**: singleton-style exports. Client-side services use axios to call API routes; server-side helpers are plain async functions in `src/services/server/*`.
- **Money**: amounts in routes/services are in **paise** (smallest unit, integer); UI converts to rupees with `PAISE_TO_RUPEES`.
- **Per-tenant secrets**: never put a tenant's carrier/payment credentials in env vars. They go under `clients/{id}/courierIntegrations.*` (encrypted via `courierCredCrypto.ts`).
- **`NEXT_PUBLIC_BLUEDART_*` env vars**: currently expose BlueDart secrets to the browser bundle — this is a known security issue but predates the current state. Don't introduce new `NEXT_PUBLIC_*` for anything sensitive.
- **Don't reuse client-side firebase config from server routes** — use the admin SDK from `firebaseAdmin.ts`.
- **Two lockfiles** (`bun.lockb` + `package-lock.json`) — pick one for any session. README incorrectly mentions Vite; the build is Next.js.

## Quick architectural map

```
src/
├─ app/
│  ├─ (admin)/                  Platform admin route group
│  ├─ (client)/                 Merchant portal route group
│  ├─ api/
│  │  ├─ bluedart, delhivery, dtdc   Carrier-specific routes (booking, tracking, label, cancel)
│  │  ├─ integrations/
│  │  │  ├─ shopify*/                5 Shopify apps (install, callback, webhook, GDPR)
│  │  │  ├─ courier/                 Connect/test per-tenant courier creds
│  │  │  └─ orders/webhook           Merchant-API order intake
│  │  ├─ orders/                     Order CRUD + book-direct, cancel-direct
│  │  ├─ client/api-keys/            Tenant API-key management
│  │  ├─ admin/, sub-accounts/       Admin + sub-account ops
│  └─ ...public pages
├─ services/
│  ├─ <courier>Service.ts            Client-side carrier wrappers
│  ├─ server/
│  │  ├─ resolveCourierCreds.ts      Per-tenant cred resolution + env fallback
│  │  ├─ apiKeyService.ts            API-key mint/lookup/revoke (server-side)
│  │  ├─ directCarrierOps.ts         Dispatcher that maps an Order doc → carrier-specific payload
│  │  ├─ orderAdminService.ts        Order Firestore writes via admin SDK
│  │  └─ courierConnectHandlers.ts   Per-courier test-ping handlers used by Integrations page
│  └─ shipmentService.ts, clientService.ts, subAccountService.ts, ...
├─ lib/
│  ├─ firebaseAdmin.ts               firebase-admin initialization
│  ├─ firebaseConfig.ts              firebase (client SDK) initialization
│  ├─ serverAuth.ts                  Bearer + API-key auth helper
│  ├─ courierCredCrypto.ts           Encrypt/decrypt per-tenant creds
│  ├─ shopifyTokenCrypto.ts          Encrypt/decrypt Shopify tokens
│  └─ retry.ts                       Exponential-backoff retry helper
├─ config/
│  ├─ bluedartConfig.ts, dtdcConfig.ts, delhiveryConfig.ts   Predefined defaults
│  ├─ courierRegistry.ts             Courier metadata used by Integrations UI
│  └─ shopifyApps.ts                 Multi-app Shopify config
├─ components/
│  ├─ ui/                             shadcn/ui primitives (~50 files)
│  ├─ integrations/                   Per-integration UI cards (Shopify, Courier, ApiKey)
│  └─ shipments/                      Labels, manifests, print helpers
├─ types/
│  ├─ types.ts                        Shared types (Shipment, Client, User, ...)
│  ├─ order.ts                        Order types (separate file for Phase 10/11)
│  └─ apiKey.ts                       API key types
└─ middleware.ts                     Route protection
```

## Patterns to repeat (not re-invent)

- **Adding a new carrier**: mirror `blueDartService.ts` + `/api/bluedart/*` + `bluedartConfig.ts`. Register it in `courierRegistry.ts`. The Integrations page picks it up automatically.
- **Adding a new merchant-webhook field**: extend the zod schema in `/api/integrations/orders/webhook/route.ts` and the `Shipment` type. The page rendering is data-driven.
- **Adding a new sidebar nav item**: add to `baseNavItems` in `src/components/ClientSidebar.tsx` (client) or the admin sidebar equivalent.
- **Per-tenant integration credential**: store under `clients/{id}/<integration>Integrations.{provider}`, encrypted; read via a `resolve<X>Creds(clientId)` server helper.

## Things that look like bugs but aren't

- `loadShopifyOrder` in `/add-shipment` accepts both `shopify_pending` AND `webhook_pending` shipments. The query param is still called `shopifyShipmentId` — it's a misnomer kept for backwards compat, not a logic bug.
- BlueDart booking sometimes returns `"UnauthorizedUser: User not authorized to register pickup for specified Area Customer code"` — this is a **BlueDart-side authorization** issue (customer code not enabled for that area), not a code bug.
- Delhivery's `"An internal Error has occurred, Please get in touch with client.support@delhivery.com"` is their generic catch-all — usually means `pickup_location.name` doesn't match a name registered on their side.

---

## User workflow preference (preserved from original CLAUDE.md)

### Agent team

When the user says "start the team", create an agent team with these 4 teammates using Opus for all. Use delegate mode.

| # | Name     | Role                | Expertise                                                            |
|---|----------|---------------------|----------------------------------------------------------------------|
| 1 | Frontend | Senior Frontend Eng | UI/UX, React, Tailwind, shadcn/ui, responsive 375–1440px              |
| 2 | Backend  | Senior Backend Eng  | TypeScript, Next.js API Routes, Firebase/Firestore, Zod, external APIs |
| 3 | Tester   | QA Engineer         | Test coverage, edge cases, error/empty states, integration tests      |
| 4 | Reviewer | Staff Engineer (RO) | Security audits, anti-vibe-code compliance, performance, code quality |

- Frontend owns all files in `/frontend/`.
- Backend owns all files in `src/app/api/`, `src/services/`, `src/lib/`, `src/config/`.
- Tester owns all test files. Tests come after implementation is confirmed.
- Reviewer is read-only; reviews for security, UI quality, performance, missing error handling.

Rules: file ownership is mandatory (no two teammates edit the same file); require plan approval before implementation starts.
