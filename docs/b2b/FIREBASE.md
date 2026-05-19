# Firebase Configuration — B2B Platform

What this doc covers:

- Service account setup
- Firestore database + indexes
- Firestore security rules (current + recommended)
- Storage bucket setup + rules
- Local emulator
- Backup / export / restore

---

## Service account

The B2B platform uses one service account for both Firestore (admin SDK) and Cloud Storage (admin SDK). Generate once per environment.

```
Firebase console → Project settings → Service accounts → Generate new private key
```

The download is a JSON file. To put it into the `FIREBASE_SERVICE_ACCOUNT_KEY` env var as one line:

```bash
# Linux/macOS
cat service-account.json | jq -c . | sed 's/\\n/\\\\n/g'

# Or just paste the JSON and let dotenv handle newline escaping
# (the loader in src/lib/firebaseAdmin.ts re-escapes \n before JSON.parse)
```

**Permissions required on the service account:**

- Firestore: read/write on all collections used by the B2B platform
- Cloud Storage: object read/write on the bucket `<project-id>.appspot.com` (or whatever bucket name you configure via `FirebaseLabelStore`)
- (Optional) Firebase Authentication: only if you use `adminAuth.verifyIdToken` from admin pages

For tight production hardening, create a dedicated service account with only the roles listed above. Don't use the default app-engine account.

---

## Firestore database

A single Firestore database in the default region. The B2B platform writes to these collections (created on first write):

| Collection | Purpose |
|---|---|
| `shipments` | Authoritative shipment docs (per Phase 1 schema) |
| `shipments/{id}/events` | Append-only event log per shipment |
| `partners` | Partner records (out of B2B platform scope to create) |
| `b2b_jobs` | Effect queue (webhooks, billing dispatch, etc.) |
| `b2b_dead_letter` | Dead-lettered jobs after max retries |
| `shipment_idempotency` | HTTP-layer Idempotency-Key cache (24h TTL) |
| `b2b_shipment_idempotency_index` | App-layer `(partnerId, idempotencyKey)` → shipmentId |
| `b2b_sagas` | Saga checkpoints |
| `rate_cards` | Partner rate cards |
| `b2b_serviceability` | Pincode-per-carrier serviceability data |
| `clientApiKeys` | Existing API key collection; B2B keys distinguished by `scope: 'b2b_partner'` |

**TTL policies** (recommended; configure in Firebase console → Firestore → TTL):

- `shipment_idempotency`: TTL field `expiresAt`, 24h after creation
- `b2b_sagas` (completed only): manual sweep — see RUNBOOK.md

---

## Indexes

All required composite indexes live in `firestore.indexes.json` at the repo root. Deploy with:

```bash
firebase deploy --only firestore:indexes --project <project-id>
```

When a query needs an index that doesn't exist, Firestore returns a `FAILED_PRECONDITION` error with a direct link to create it in the console. If you see this in production logs, deploying the indexes file fixes it.

Index creation is **async** — large collections may take 10+ minutes. Until the index is "Enabled", queries that need it will fail.

---

## Firestore security rules

### Current state (development)

The existing `firestore.rules` reportedly has `read, write: if true` on every collection (per CLAUDE.md). This is **wide open** and acceptable for the admin SDK path (which bypasses rules) but a hardening gap if any client-SDK code accesses these collections directly.

### Production rules (recommended)

The B2B server routes use the admin SDK exclusively — they bypass rules. The admin UI uses Firebase Auth client-side and *might* touch some collections via the client SDK. Recommended baseline:

```js
rules_version = '2';
service cloud.firestore {
    match /databases/{database}/documents {
        // Lock down everything by default
        match /{document=**} {
            allow read, write: if false;
        }

        // B2B server-managed collections — never accessed from the client SDK
        match /shipments/{id} {
            allow read, write: if false;
        }
        match /shipments/{id}/events/{eventId} {
            allow read, write: if false;
        }
        match /b2b_jobs/{jobId} { allow read, write: if false; }
        match /b2b_sagas/{sagaId} { allow read, write: if false; }
        match /b2b_shipment_idempotency_index/{id} { allow read, write: if false; }
        match /shipment_idempotency/{id} { allow read, write: if false; }
        match /rate_cards/{id} { allow read, write: if false; }
        match /b2b_serviceability/{id} { allow read, write: if false; }
        match /clientApiKeys/{id} { allow read, write: if false; }
        match /partners/{id} { allow read, write: if false; }

        // Existing merchant collections — keep their current rules
        // (See firestore.rules for the merchant portal's existing logic)
    }
}
```

Deploy:

```bash
firebase deploy --only firestore:rules --project <project-id>
```

If the existing merchant portal breaks after tightening rules, expand the match clauses to allow merchant authenticated access — but keep all B2B collections at `if false`.

---

## Storage bucket setup

The B2B platform writes label PDFs to `gs://<project-id>.appspot.com/b2b-labels/{partnerId}/{shipmentId}/<filename>`.

### Verify the bucket exists

```bash
gsutil ls -p <project-id> | grep "<project-id>.appspot.com"
```

If missing: Firebase console → Storage → "Get started".

### Storage rules

Server-side label retrieval uses signed URLs (`getSignedUrl` from the admin SDK), which **bypass storage rules**. The default rules ("Authenticated users can read/write") are not used by the B2B platform.

For maximum safety, set the rules to deny all client access:

```js
rules_version = '2';
service firebase.storage {
    match /b/{bucket}/o {
        match /{allPaths=**} {
            allow read, write: if false;
        }
    }
}
```

The admin SDK still has full access; only client-SDK calls (which the B2B platform doesn't make) are blocked.

Deploy:

```bash
firebase deploy --only storage --project <project-id>
```

### Lifecycle rules (optional but recommended)

Auto-archive labels older than 90 days to reduce storage costs. In `gsutil`:

```bash
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
        "condition": {"matchesPrefix": ["b2b-labels/"], "age": 90}
      }
    ]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://<project-id>.appspot.com
```

---

## Local emulator (development)

For local dev without touching production data:

```bash
firebase emulators:start --only firestore,storage --project <project-id>
```

Default ports:
- Firestore: `localhost:8080`
- Storage: `localhost:9199`
- Emulator UI: `localhost:4000`

Wire the app to the emulators by setting in `.env.local`:

```
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
```

The firebase-admin SDK auto-detects these and routes all calls to the emulator. **Never set these in production.** The env validator script will not catch this — it's a footgun.

To seed the emulator with test data:

```bash
# Export from a snapshot
firebase emulators:export ./emulator-snapshot

# Start emulator with the snapshot
firebase emulators:start --import=./emulator-snapshot
```

---

## Backup & export

### Manual export

```bash
# Authenticate as a user with `roles/datastore.importExportAdmin`
gcloud auth login

# Export the whole DB to a GCS bucket (create the bucket first if needed)
gcloud firestore export gs://<backup-bucket>/$(date +%Y-%m-%d) \
    --project <project-id>
```

The export runs in the background. Track via:

```bash
gcloud firestore operations list --project <project-id>
```

### Scheduled exports (recommended)

Set up a Cloud Scheduler job that triggers a Cloud Function which runs `firestore.export`. See https://firebase.google.com/docs/firestore/solutions/schedule-export.

Suggested cadence: daily snapshot, retained 30 days.

### Point-in-time recovery (PITR)

Enable in Firebase console → Firestore → "Point-in-time recovery". Once enabled, you can restore to any point within the last 7 days via the console or `gcloud firestore databases restore`.

This is a billed feature but cheap relative to a disaster. Enable in production.

### Restore from export

```bash
# List exports in the backup bucket
gsutil ls gs://<backup-bucket>/

# Restore (DESTRUCTIVE — overwrites the target database)
gcloud firestore import gs://<backup-bucket>/2026-05-15 \
    --project <project-id>
```

Production restore should be coordinated:
1. Put the platform in maintenance mode (no writes — disable cron schedules in Vercel, return 503 from POST routes via a feature flag)
2. Run the restore
3. Verify with a few smoke queries
4. Re-enable writes

---

## Storage backup

The label PDFs in Cloud Storage are regenerable from carrier APIs (for courier labels) or from shipment data (for self-shipment labels). The retry workers handle missing labels automatically.

A daily `gsutil rsync gs://<project-id>.appspot.com/b2b-labels gs://<backup-bucket>/labels-mirror/` is sufficient defense in depth. Not required.

---

## Common pitfalls

- **Service-account JSON with literal newlines**: dotenv treats `\n` as a literal backslash+n until it loads, then converts to a newline. The loader in `src/lib/firebaseAdmin.ts` re-escapes to handle this. If you see `Unexpected token in JSON` errors from `JSON.parse`, your env var value is malformed. Use `jq -c .` to produce a single-line JSON.
- **Missing Firestore index after a feature deploy**: returns `FAILED_PRECONDITION`. Always deploy `firestore.indexes.json` *before* deploying code that uses new queries.
- **Storage signed URL TTL too short**: default is 24h via `FirebaseLabelStore`. Partners that cache the URL longer get 403s. Recommend partners hit `/api/v1/b2b/shipments/:id/label` each time to mint a fresh URL.
- **Storage rules locking out admin SDK**: the admin SDK bypasses rules, so `if false` everywhere is safe. If you see permission errors from server routes, it's an IAM problem (service account missing roles), not a rules problem.
