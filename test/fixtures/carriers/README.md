# Carrier Fixture Storage

Sanitized real-world carrier payloads for regression testing and replay
drills.

## Layout

```
test/fixtures/carriers/
├── README.md                  (this file)
├── bluedart/
│   ├── captured/              git-ignored — live captures from sandbox
│   ├── booking-success.json   sanitized booking response
│   ├── webhook-picked_up.json sanitized webhook payload
│   └── webhook-delivered.json
├── delhivery/
│   ├── captured/
│   ├── booking-success.json
│   ├── webhook-in_transit.json
│   └── webhook-rto.json
└── dtdc/
    ├── captured/
    ├── booking-success.json
    ├── webhook-out_for_delivery.json
    └── webhook-delivered.json
```

The `captured/` subdirectories are git-ignored. Treat them as scratch
space for live captures from sandbox webhooks; once a payload has been
sanitized and committed at the top level, the captured original can be
deleted.

## Redaction protocol

Every committed fixture **MUST** have been processed by
`scripts/sanitize-fixture.mjs`. The script replaces:

| Field type | Replacement |
|---|---|
| Names | `FIXTURE_NAME_<n>` |
| Phone numbers | `+919999999999` |
| Email | `fixture@example.invalid` |
| Addresses | `FIXTURE_ADDRESS_<n>` |
| Pincodes | `560001` |
| AWB / waybill numbers | `AWB-FIXTURE-<n>` |
| Customer codes | `FIXTURE_CODE` |
| Secrets (API keys, tokens) | `FIXTURE_SECRET` |
| Webhook signatures | Recomputed against `whsec_fixture` |

Verify before commit:

```bash
grep -E '(\+?91\d{10}|\d{6}[^0-9])' test/fixtures/carriers/<carrier>/*.json
```

This catches obvious un-redacted Indian phone numbers and 6-digit
pincodes. A hit means the sanitizer missed something — add the field
name to `SENSITIVE_KEYS` in `scripts/sanitize-fixture.mjs` and re-run.

## Replay-from-fixture

Fixtures use the deterministic secret `whsec_fixture`. To replay a
fixture against a local dev server with a partner whose
`webhookSecret` is set to `whsec_fixture`:

```bash
node scripts/replay-webhook.mjs \
  --fixture test/fixtures/carriers/bluedart/webhook-picked_up.json \
  --target http://localhost:3000
```

## Using fixtures in tests

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BlueDartAdapter } from '@/services/b2b/couriers/bluedart/BlueDartAdapter';

it('parses a real picked_up webhook', () => {
    const fx = JSON.parse(
        readFileSync(
            path.resolve('test/fixtures/carriers/bluedart/webhook-picked_up.json'),
            'utf8',
        ),
    );
    const body = JSON.parse(Buffer.from(fx.rawBody, 'base64').toString('utf8'));
    const events = new BlueDartAdapter(/* deps */).parseWebhook(body);
    expect(events).toHaveLength(1);
    expect(events[0].rawCode).toBe('SHIPMENT_PICKED_UP');
});
```

## When to add a new fixture

Any time the platform receives a *novel* payload shape from a carrier
— a status code we haven't seen, a wrapper structure we don't handle,
a field added in a carrier-side release — capture, sanitize, commit,
and write a regression test referencing it. Add a corresponding entry
to [docs/b2b/carriers/PAYLOAD_DRIFT.md](../../../docs/b2b/carriers/README.md#payload-drift-log).

## What NOT to commit

- Original (un-sanitized) captures
- Captures containing real customer data
- The HMAC secret used by any real partner
- Captures from production traffic (sandbox only)

If a captured-traffic file ever lands in a commit, **rotate the secret**
and rewrite history. Carrier-side webhook configuration also has to be
updated — coordinate with the partner.
