# B2B Platform — Production Deployment Checklist

Sequential. Don't skip steps. Each step has a verification command.

---

## 0. Prerequisites (one-time, per environment)

```bash
# Tools you need installed locally
firebase --version           # firebase-tools ≥13
vercel --version             # vercel CLI ≥30
gcloud --version             # for Firestore export (optional but recommended)
node --version               # ≥18
```

Link this repo to its Vercel project (one-time):

```bash
vercel link
```

---

## 1. Generate secrets

Run **once per environment** (production + staging). Store outputs in a password manager — they are not regenerable without rotation.

```bash
# B2B_QUOTE_TOKEN_SECRET (≥32 chars)
openssl rand -hex 32

# CRON_SECRET (≥16 chars, recommend 24)
openssl rand -hex 24
```

Firebase service account: generate in Firebase console:

1. Project settings → Service accounts → "Generate new private key"
2. Save the JSON file
3. Convert to single line: `cat service-account.json | jq -c .` then escape newlines in the `private_key` field with `\\n`

---

## 2. Set environment variables in Vercel

```bash
# For each var in .env.example, add to production
vercel env add BLUJAY_LICENSE_KEY production
vercel env add FIREBASE_SERVICE_ACCOUNT_KEY production
vercel env add B2B_QUOTE_TOKEN_SECRET production
vercel env add CRON_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production
# … repeat for any carrier fallback vars in use
```

**Verify:**

```bash
vercel env ls production | grep -E 'BLUJAY_LICENSE_KEY|FIREBASE_SERVICE_ACCOUNT_KEY|B2B_QUOTE_TOKEN_SECRET|CRON_SECRET|NEXT_PUBLIC_APP_URL'
```

All 5 must be listed.

---

## 3. Deploy Firestore indexes

```bash
# From repo root
firebase deploy --only firestore:indexes --project blujay-dd8cd
```

Output should list 13 indexes being created. Index creation is async; check status in Firebase console → Firestore → Indexes. Wait until **all** show "Enabled" before proceeding (usually 2–10 min for an empty DB; longer for populated).

**Verify:**

```bash
firebase firestore:indexes --project blujay-dd8cd | wc -l
# Should be ≥13
```

---

## 4. Verify Firebase Storage bucket exists

```bash
gsutil ls gs://blujay-dd8cd.appspot.com 2>/dev/null && echo "OK" || echo "MISSING"
```

If MISSING, create it: Firebase console → Storage → "Get started" → default rules. The B2B platform writes to `gs://<bucket>/b2b-labels/{partnerId}/{shipmentId}/…`.

---

## 5. Build verification (local)

```bash
# Run the env validator (fails closed on missing secrets)
node scripts/validate-b2b-env.mjs

# Full production build
npm run build
```

Build must complete with zero errors. TypeScript errors during build are blockers — fix before deploying.

---

## 6. Deploy to Vercel

```bash
vercel --prod
```

Take note of the deployment URL printed at the end (e.g. `https://blujay-abc123.vercel.app`). The custom domain `blujaylogistic.com` should automatically alias to it.

---

## 7. Post-deploy smoke test

Set:

```bash
export HOST=https://blujaylogistic.com
export KEY="bj_<your test partner key — see RUNBOOK.md for minting>"
```

### 7.1 Auth check (should return 401)

```bash
curl -sw '\n%{http_code}\n' "$HOST/api/v1/b2b/rates"
# → expect 401 (no auth header)
```

### 7.2 Cron auth check (should return 401)

```bash
curl -sw '\n%{http_code}\n' -X POST "$HOST/api/cron/poll-tracking"
# → expect 401 (no bearer)

curl -sw '\n%{http_code}\n' -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$HOST/api/cron/poll-tracking"
# → expect 200 with summary JSON
```

### 7.3 Authenticated quote request (should return 200 or 503)

```bash
curl -sw '\n%{http_code}\n' -X POST "$HOST/api/v1/b2b/rates" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "origin":      {"name":"S","phone":"+919876543210","line1":"1","city":"Bengaluru","state":"KA","pincode":"560001","country":"IN"},
    "destination": {"name":"R","phone":"+919876500000","line1":"1","city":"Delhi","state":"DL","pincode":"110001","country":"IN"},
    "parcel":      {"weightGrams":500,"dimensionsCm":{"length":20,"width":15,"height":10},"declaredValuePaise":50000,"contents":"Test","isCod":false,"codAmountPaise":0}
  }'
# → expect 200 with `data.quotes` array (or 503 if no carriers registered yet)
```

### 7.4 Self-shipment booking (should return 201)

```bash
curl -sw '\n%{http_code}\n' -X POST "$HOST/api/v1/b2b/shipments" \
  -H "Authorization: Bearer $KEY" \
  -H "Idempotency-Key: smoke-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{
    "fulfillmentMode": "self_shipment",
    "origin":      {"name":"S","phone":"+919876543210","line1":"1","city":"Bengaluru","state":"KA","pincode":"560001","country":"IN"},
    "destination": {"name":"R","phone":"+919876500000","line1":"1","city":"Delhi","state":"DL","pincode":"110001","country":"IN"},
    "parcel":      {"weightGrams":500,"dimensionsCm":{"length":20,"width":15,"height":10},"declaredValuePaise":50000,"contents":"Test","isCod":false,"codAmountPaise":0}
  }'
# → expect 201 with `data.shipmentId`
```

### 7.5 Idempotency replay

Send the same request body + Idempotency-Key as 7.4 → expect 200 with header `Idempotency-Replay: true` and identical body bytes.

---

## 8. Cron verification

1. Vercel dashboard → Project → Crons tab → confirm 3 entries listed:
   - `/api/cron/poll-tracking` — every 5 min
   - `/api/cron/reconcile-bookings` — every 15 min
   - `/api/cron/retrieve-labels` — every 10 min
2. Wait 15 min. Each should fire at least once.
3. Confirm via Vercel dashboard → Logs:

```
filter: path:/api/cron/poll-tracking AND status:200
```

Should show invocations matching the schedule.

---

## 9. Carrier registration verification

```bash
# Open admin UI
open "$HOST/b2b/operations"
```

Carrier Health panel should list `bluedart / delhivery / dtdc`. If empty, the `registerCarriers()` call from `services/b2b/couriers/register.ts` isn't running on bootstrap. Wire it into your app initialization (next paragraph).

To register carriers, import and call once at app bootstrap:

```ts
// e.g. in a server-side init file, or first import of any B2B route
import { registerCarriers } from '@/services/b2b/couriers/register';
import { FirestoreShipmentReader } from '@/services/b2b/infra';
import { getFirestore } from 'firebase-admin/firestore';
import { adminApp } from '@/lib/firebaseAdmin';

const db = getFirestore(adminApp);
registerCarriers({
    credentials: yourCredentialsResolver,
    shipmentLookup: new FirestoreShipmentReader(db),
});
```

---

## 10. Rollback procedure

If anything in step 7 fails:

```bash
# List recent production deployments
vercel ls --prod

# Rollback to the previous good one
vercel rollback <deployment-url>
```

Firestore indexes are **not** rolled back automatically — they're additive and safe to leave deployed. Firestore data changes are also not rolled back; use the export procedure in `FIREBASE.md` for data restore.

Storage objects (labels) are partner-namespaced — if the new deploy was producing bad labels, ops can list+delete via `gsutil rm gs://<bucket>/b2b-labels/<partnerId>/…` after the rollback completes.

---

## 11. Production logging

Default: Vercel captures all stdout/stderr in the Logs tab.

**Recommended:** add a log drain to Datadog / Logflare / Logtail:

1. Vercel project → Settings → Log Drains → "Add Log Drain"
2. Filter: `*` (capture everything; the structured JSON logger emits one line per event)
3. Destination: your aggregation tool

Once aggregated, the alert thresholds in `RUNBOOK.md` become wire-able.

---

## 12. Final sign-off

- [ ] All 5 required env vars set in Vercel production
- [ ] All 13 Firestore indexes show "Enabled"
- [ ] Firebase Storage bucket exists and is writable
- [ ] `npm run build` succeeds locally
- [ ] `vercel --prod` deployment URL is live
- [ ] Smoke-test steps 7.1–7.5 all pass
- [ ] All 3 cron jobs visible + firing in Vercel Crons tab
- [ ] Carrier Health panel shows ≥1 carrier
- [ ] Log drain configured (if using external aggregation)
- [ ] Runbook (`RUNBOOK.md`) shared with on-call rotation
