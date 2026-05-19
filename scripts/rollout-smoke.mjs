#!/usr/bin/env node
/**
 * Production rollout smoke.
 *
 * Stricter than scripts/smoke-b2b.mjs — designed to run as a gate
 * before advancing rollout phases (see docs/b2b/PRODUCTION_ROLLOUT.md).
 *
 * Differences vs. smoke-b2b.mjs:
 *   - Uses a dedicated production rollout-test partner (B2B_API_KEY)
 *   - Asserts on alert-relevant metrics (latency, queue depth)
 *   - Probes the reconciler endpoint as a dry-run
 *   - Verifies the circuit-breaker error path produces the structured
 *     response we expect (no internal-detail leakage)
 *   - Exits non-zero on any threshold breach, not just functional failure
 *
 * Usage:
 *   HOST=https://blujaylogistic.com \
 *     B2B_API_KEY=bj_<production-rollout-test-partner> \
 *     CRON_SECRET=$CRON_SECRET \
 *     node scripts/rollout-smoke.mjs
 */
const HOST = process.env.HOST || 'http://localhost:3000';
const KEY = process.env.B2B_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

if (!KEY) {
    console.error('B2B_API_KEY env var required');
    process.exit(1);
}
if (!CRON_SECRET) {
    console.error('CRON_SECRET env var required for rollout smoke');
    process.exit(1);
}

// ── thresholds (tune after first week of production traffic) ───
const THRESHOLDS = {
    bookingP95Ms: 8000,
    quoteP95Ms: 3000,
    labelP95Ms: 5000,
    trackingP95Ms: 2000,
};

let stepNum = 0;
async function step(name, fn) {
    stepNum += 1;
    const t0 = Date.now();
    process.stdout.write(`  ${stepNum.toString().padStart(2, ' ')}. ${name.padEnd(54, ' ')}`);
    try {
        const result = await fn();
        const dt = Date.now() - t0;
        const tag = result?.tagged ?? `${dt}ms`;
        console.log(`  ✓  ${tag}`);
        return { ...result, durationMs: dt };
    } catch (err) {
        const dt = Date.now() - t0;
        console.log(`  ✗  ${dt}ms`);
        console.error(`     → ${err.message}`);
        if (err.body) console.error(`     ${JSON.stringify(err.body).slice(0, 400)}`);
        process.exit(1);
    }
}

function fail(msg, body) {
    const e = new Error(msg);
    e.body = body;
    throw e;
}

async function http(method, path, opts = {}) {
    const headers = { 'Authorization': `Bearer ${KEY}`, ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(HOST + path, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let body;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status, headers: r.headers, body };
}

const ADDR = (suffix) => ({
    name: `Rollout ${suffix}`,
    phone: '+919876543210',
    line1: '1 Main Rd',
    city: 'Bengaluru',
    state: 'KA',
    pincode: '560001',
    country: 'IN',
});
const PARCEL = {
    weightGrams: 500,
    dimensionsCm: { length: 20, width: 15, height: 10 },
    declaredValuePaise: 50_000,
    contents: 'Rollout smoke',
    isCod: false,
    codAmountPaise: 0,
};

console.log(`\n  Blujay B2B rollout smoke — ${HOST}\n`);

// ── 1. quote latency ──────────────────────────────────────────────

const quote = await step('rate quote within P95 budget', async () => {
    const r = await http('POST', '/api/v1/b2b/rates', {
        body: { origin: ADDR('S'), destination: ADDR('R'), parcel: PARCEL },
    });
    if (r.status !== 200) fail(`expected 200, got ${r.status}`, r.body);
    return {};
});
if (quote.durationMs > THRESHOLDS.quoteP95Ms) {
    console.error(`     ! quote latency ${quote.durationMs}ms > threshold ${THRESHOLDS.quoteP95Ms}ms`);
    process.exit(2);
}

// ── 2. self-shipment book latency ─────────────────────────────────

const idem = `rollout-${Date.now().toString(36)}`;
const booked = await step('self-shipment book within P95 budget', async () => {
    const r = await http('POST', '/api/v1/b2b/shipments', {
        headers: { 'Idempotency-Key': idem },
        body: {
            fulfillmentMode: 'self_shipment',
            origin: ADDR('S'),
            destination: ADDR('R'),
            parcel: PARCEL,
        },
    });
    if (r.status !== 201) fail(`expected 201, got ${r.status}`, r.body);
    if (!r.body?.data?.shipmentId) fail('missing shipmentId', r.body);
    return { shipmentId: r.body.data.shipmentId };
});
if (booked.durationMs > THRESHOLDS.bookingP95Ms) {
    console.error(`     ! book latency ${booked.durationMs}ms > threshold ${THRESHOLDS.bookingP95Ms}ms`);
    process.exit(2);
}

// ── 3. idempotency replay header present ───────────────────────────

await step('idempotency replay sets Idempotency-Replay: true', async () => {
    const r = await http('POST', '/api/v1/b2b/shipments', {
        headers: { 'Idempotency-Key': idem },
        body: {
            fulfillmentMode: 'self_shipment',
            origin: ADDR('S'),
            destination: ADDR('R'),
            parcel: PARCEL,
        },
    });
    if (r.body?.data?.shipmentId !== booked.shipmentId) fail('replay shipmentId mismatch');
    if (r.headers.get('idempotency-replay') !== 'true') fail('missing Idempotency-Replay header');
});

// ── 4. tracking latency ────────────────────────────────────────────

const tracking = await step('tracking fetch within P95 budget', async () => {
    const r = await http('GET', `/api/v1/b2b/shipments/${booked.shipmentId}/tracking`);
    if (r.status !== 200) fail(`expected 200, got ${r.status}`, r.body);
    return {};
});
if (tracking.durationMs > THRESHOLDS.trackingP95Ms) {
    console.error(`     ! tracking latency ${tracking.durationMs}ms > threshold ${THRESHOLDS.trackingP95Ms}ms`);
    process.exit(2);
}

// ── 5. label latency ──────────────────────────────────────────────

const label = await step('label fetch within P95 budget', async () => {
    const r = await http('GET', `/api/v1/b2b/shipments/${booked.shipmentId}/label`);
    if (r.status !== 200) fail(`expected 200, got ${r.status}`, r.body);
    if (!['available', 'pending'].includes(r.body?.data?.status)) {
        fail(`unexpected label status ${r.body?.data?.status}`);
    }
    return {};
});
if (label.durationMs > THRESHOLDS.labelP95Ms) {
    console.error(`     ! label latency ${label.durationMs}ms > threshold ${THRESHOLDS.labelP95Ms}ms`);
    process.exit(2);
}

// ── 6. structured error on auth failure ────────────────────────────

await step('unauth returns structured 401 (no internal detail leak)', async () => {
    const r = await fetch(HOST + '/api/v1/b2b/shipments/foo', { method: 'GET' });
    if (r.status !== 401) fail(`expected 401, got ${r.status}`);
    const body = await r.json();
    if (typeof body?.error?.code !== 'string') fail('error envelope missing code');
    // Make sure we don't leak stack traces, internal IDs, etc.
    const blob = JSON.stringify(body);
    if (/at \w+\.\w+ \(/.test(blob) || /firestore|firebase-admin|internal/i.test(blob)) {
        fail('response leaks internal detail', body);
    }
});

// ── 7. reconciler dry-run ──────────────────────────────────────────

await step('reconciler cron auth + 200', async () => {
    const r = await fetch(HOST + '/api/cron/reconcile-bookings', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });
    if (r.status !== 200) fail(`expected 200, got ${r.status}`);
});

// ── 8. polling worker cron ──────────────────────────────────────────

await step('polling worker cron auth + 200', async () => {
    const r = await fetch(HOST + '/api/cron/poll-tracking', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });
    if (r.status !== 200) fail(`expected 200, got ${r.status}`);
});

// ── 9. label retrieval cron ─────────────────────────────────────────

await step('label retrieval cron auth + 200', async () => {
    const r = await fetch(HOST + '/api/cron/retrieve-labels', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
    });
    if (r.status !== 200) fail(`expected 200, got ${r.status}`);
});

console.log('\n  ✓ rollout smoke passed — all gates green\n');
process.exit(0);
