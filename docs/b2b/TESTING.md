# B2B Platform — Testing Guide

Three test surfaces. Run each independently.

| Surface | What it covers | How to run |
|---|---|---|
| **Unit tests** | Pure-domain logic; mocks for Firestore | `npx vitest` |
| **Integration tests** | Real Firestore behavior via emulator + mock carriers | `npx vitest --config=vitest.integration.config.ts` |
| **HTTP smoke** | Live server (deployed or local) end-to-end | `node scripts/smoke-b2b.mjs` |

---

## 1. Unit tests

Already covered by earlier phases. Tests live in `src/services/b2b/**/__tests__/`. Run:

```bash
npx vitest
# or watch mode
npx vitest --watch
```

These use hand-rolled mock Firestore objects — fast, no emulator required, run on every commit.

---

## 2. Integration tests (emulator-backed)

### Start the emulator

In one terminal:

```bash
firebase emulators:start --only firestore,storage
```

Default ports: Firestore `localhost:8080`, Storage `localhost:9199`. The emulator UI is at `localhost:4000`.

### Run the tests

In another terminal:

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
npx vitest --config=vitest.integration.config.ts
```

The vitest setup file (`test/integration/_env.ts`) refuses to run without `FIRESTORE_EMULATOR_HOST` set — you'll see a banner explaining why. This is by design: tests should never accidentally hit production.

### What's covered

| Suite | What it asserts |
|---|---|
| `idempotency-replay.test.ts` | Booking idempotency, event dedup, stale-by-rank handling, same-status handling |
| `saga-recovery.test.ts` | Indeterminate booking recovery, reconciler success + abandonment, replay safety |
| `e2e-smoke.test.ts` | Courier-fulfillment lifecycle, self-shipment lifecycle, carrier rejection flow |

### Per-test isolation

Each `it()` gets a fresh `partnerId` (`test_partner_<random>`). Cleanup happens in `afterAll` — all partner-scoped docs deleted from Firestore. No data leaks between suites.

The MockCourierAdapter is shared across an entire suite but its state is reset (`.reset()`) before every test via `suite.freshContext()`.

### Mock carrier behavior

The `MockCourierAdapter` exposes per-operation `behavior` fields. Configure before the action under test:

```ts
ctx.mockCarrier.bookBehavior = 'timeout_indeterminate';
ctx.mockCarrier.lookupBehavior = 'not_found';
const r = await ctx.bookingService.book(req);
expect(r.kind).toBe('cancelled_during_booking');
expect(ctx.mockCarrier.bookCount).toBe(1);
expect(ctx.mockCarrier.lookupCount).toBe(1);
```

Available behaviors:

| Operation | Behaviors |
|---|---|
| `book` | `success` · `transient_failure` · `permanent_failure` · `timeout_indeterminate` |
| `quote` | `success` · `transient_failure` · `permanent_failure` |
| `cancel` | `success` · `transient_failure` · `permanent_failure` |
| `generateLabel` | `success` · `transient_failure` · `permanent_failure` |
| `pollStatus` | `success` · `no_events` · `transient_failure` |
| `lookupByReference` | `found` · `not_found` · `transient_failure` |

### Seeded test data

`test/integration/setup.ts` exports:

- `TEST_ORIGIN`, `TEST_DESTINATION`, `TEST_PARCEL` — reusable address / parcel fixtures
- `makeBookingRequest({ partnerId, ... })` — builds a `BookingRequest` with sane defaults
- `seedB2BApiKey(db, partnerId)` — creates a B2B-scoped API key doc and returns the raw key (for HTTP-layer tests)

### Fake clock

The `Clock` port from Phase 2 Step 3 is the only time source. Tests inject a `SystemClock` by default but can swap for a controllable fake:

```ts
class FixedClock {
    constructor(public now_: Date) {}
    now() { return new Date(this.now_.getTime()); }
    advance(ms: number) { this.now_ = new Date(this.now_.getTime() + ms); }
}

const clock = new FixedClock(new Date('2026-05-15T10:00:00Z'));
// pass into a service builder that accepts a custom Clock
```

The shipping `buildBookingService(db)` factory doesn't currently accept a Clock override (it uses `SystemClock`). For tests that need precise time control, construct services manually using the underlying `BookingService` class.

### Webhook fixtures

Webhook payloads are constructed inline as TypeScript values rather than JSON files. The MockCourierAdapter's `parseWebhook(body)` accepts `{ events: RawTrackingEvent[] }`:

```ts
const fixture = {
    events: [
        {
            source: 'bluedart',
            rawCode: 'shipment.in_transit',
            description: 'In transit at Bengaluru hub',
            occurredAt: new Date(),
            locationRaw: 'BLR-HUB',
            facility: null,
            payload: { awb: 'AWB-MOCK-1' },
        },
    ],
};
ctx.mockCarrier.pollEvents = fixture.events;
```

For tests of the actual production carrier adapters (BlueDart/Delhivery/DTDC parsing of real payloads), use unit tests in the per-carrier `__tests__/` folders — those need real wire-format JSON files.

### Queue simulation

The integration suite uses the `InMemoryJobQueue` from Phase 2 Step 3 (already exists in the infra layer). Tests can inspect queued effect envelopes:

```ts
const ctx = await suite.freshContext();
// … perform a booking …
expect(ctx.jobQueue.jobs.length).toBeGreaterThan(0);
expect(ctx.jobQueue.jobs[0].topic).toBe('b2b.effect.emit_partner_webhook');
```

Note: the default `buildBookingService(db)` factory wires a `FirestoreJobQueue`, not the in-memory one. To use the in-memory queue in a test, construct services manually with `new BookingService({ … effectDispatcher: new QueuedEffectDispatcher(new InMemoryJobQueue()), … })`.

---

## 3. HTTP smoke test

For deployed environments OR a locally-running server. Doesn't require the emulator.

### Setup

You need a valid B2B API key. Mint one via the admin UI (`/b2b/api-keys`) or directly in Firestore — see `docs/b2b/RUNBOOK.md` §9.

```bash
export HOST=https://blujaylogistic.com
export B2B_API_KEY=bj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Run

```bash
node scripts/smoke-b2b.mjs
```

Or against local dev with crons:

```bash
HOST=http://localhost:3000 \
B2B_API_KEY=bj_... \
CRON_SECRET=$CRON_SECRET \
node scripts/smoke-b2b.mjs --crons
```

### What it covers

1. Unauthenticated request → 401
2. Quote request → 200 with quotes (or graceful 503)
3. Self-shipment booking → 201
4. Idempotency replay (same key, same body) → identical response
5. Tracking history → 200
6. Manual event push → 200 applied
7. Label fetch → 200 available/pending
8. Cron auth (with `--crons`) → 200 for each of 3 cron paths

Exits 0 on full pass, 1 on first failure with a clear error message.

---

## CI guidance

### GitHub Actions example

```yaml
name: tests
on: [push, pull_request]

jobs:
    unit:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: '20'
            - run: npm ci
            - run: npx vitest run

    integration:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: '20'
            - uses: actions/setup-java@v4
              with:
                  distribution: 'temurin'
                  java-version: '17'
            - run: npm ci
            - run: npm install -g firebase-tools
            - name: Start Firebase emulator
              run: |
                  firebase emulators:start --only firestore,storage --project blujay-emulator-test &
                  sleep 10    # wait for boot
            - name: Run integration tests
              env:
                  FIRESTORE_EMULATOR_HOST: localhost:8080
                  FIREBASE_STORAGE_EMULATOR_HOST: localhost:9199
              run: npx vitest run --config=vitest.integration.config.ts
```

### Smoke against a preview deployment

Run after a successful Vercel preview deploy:

```yaml
    smoke:
        needs: integration
        runs-on: ubuntu-latest
        environment: preview
        steps:
            - uses: actions/checkout@v4
            - run: node scripts/smoke-b2b.mjs
              env:
                  HOST: ${{ secrets.PREVIEW_URL }}
                  B2B_API_KEY: ${{ secrets.PREVIEW_B2B_API_KEY }}
```

The preview env should have its own B2B API key minted (do not reuse production keys).

---

## Adding new integration tests

Follow the pattern in `idempotency-replay.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeBookingRequest, makeSuite } from './setup';

describe('integration · my new flow', () => {
    const suite = makeSuite();
    beforeAll(suite.setup);
    afterAll(suite.teardown);

    it('does the thing', async () => {
        const ctx = await suite.freshContext();
        // ctx.partnerId is unique to this test
        // ctx.mockCarrier is freshly reset
        // ctx.bookingService, ctx.eventIngestor, etc. all wired against
        // real Firestore (emulator) and the mock carrier
        // …
    });
});
```

Naming convention: `<topic>.test.ts` under `test/integration/`.

---

## Common pitfalls

- **"firebase: command not found"** — install with `npm install -g firebase-tools`
- **"FIRESTORE_EMULATOR_HOST not set"** — start the emulator first
- **Integration tests pass locally, fail in CI** — usually the emulator wasn't given enough time to boot. Add a `sleep 15` after starting it.
- **"Already exists" on test runs** — the emulator persists data across test runs by default. Either delete the `.firebase/` cache or use `--import / --export-on-exit` flags for reproducibility.
- **Slow tests** — vitest's `--config` flag uses singleFork mode; that's intentional. Don't switch to threads — Firestore emulator hates concurrent writers.
