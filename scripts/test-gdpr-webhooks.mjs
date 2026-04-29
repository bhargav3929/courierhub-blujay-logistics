#!/usr/bin/env node
// Verify the 3 Shopify mandatory GDPR webhooks against a running endpoint.
//
// Usage:
//   SHOPIFY_API_SECRET=xxx node scripts/test-gdpr-webhooks.mjs
//   SHOPIFY_API_SECRET=xxx BASE=https://blujaylogistic.com node scripts/test-gdpr-webhooks.mjs
//
// Defaults:
//   BASE       = http://localhost:3000
//   timeout    = 5000ms (Shopify SLA)
//
// Checks per endpoint:
//   - valid HMAC + empty payload  → 200 within 5s
//   - invalid HMAC                → 401
//   - missing HMAC                → 401

import crypto from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:3000';
const SECRET = process.env.SHOPIFY_API_SECRET;
const TIMEOUT_MS = 5000;

if (!SECRET) {
  console.error('SHOPIFY_API_SECRET env var is required');
  process.exit(1);
}

const endpoints = [
  {
    topic: 'customers/data_request',
    path: '/api/integrations/shopify/gdpr/customers-data-request',
    sample: {
      shop_id: 12345,
      shop_domain: 'blujay-review.myshopify.com',
      orders_requested: [],
      customer: { id: 1, email: 'noone@example.com', phone: '+919999999999' },
      data_request: { id: 1 },
    },
  },
  {
    topic: 'customers/redact',
    path: '/api/integrations/shopify/gdpr/customers-redact',
    sample: {
      shop_id: 12345,
      shop_domain: 'blujay-review.myshopify.com',
      customer: { id: 1, email: 'noone@example.com', phone: '+919999999999' },
      orders_to_redact: [],
    },
  },
  {
    topic: 'shop/redact',
    path: '/api/integrations/shopify/gdpr/shop-redact',
    sample: { shop_id: 12345, shop_domain: 'blujay-review.myshopify.com' },
  },
];

function hmac(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64');
}

async function timed(fn) {
  const t0 = Date.now();
  const r = await fn();
  return { ms: Date.now() - t0, ...r };
}

async function post(url, body, hmacHeader) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Topic': 'compliance',
        'X-Shopify-Shop-Domain': 'blujay-review.myshopify.com',
        ...(hmacHeader ? { 'X-Shopify-Hmac-Sha256': hmacHeader } : {}),
      },
      body,
      signal: ctrl.signal,
    });
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

let pass = 0;
let fail = 0;
const log = (ok, name, detail) => {
  const s = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${s} ${name}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
};

console.log(`\nGDPR webhook verification against ${BASE}\n`);

for (const ep of endpoints) {
  const url = BASE + ep.path;
  const body = JSON.stringify(ep.sample);
  console.log(`— ${ep.topic} —`);

  // Test 1: valid HMAC, empty-ish payload, expect 200 within 5s
  const r1 = await timed(() => post(url, body, hmac(body)));
  log(
    r1.status === 200 && r1.ms < 5000,
    'valid HMAC → 200 within 5s',
    `(status ${r1.status}, ${r1.ms}ms)`
  );

  // Test 2: invalid HMAC, expect 401
  const r2 = await timed(() => post(url, body, 'invalid-hmac-base64'));
  log(r2.status === 401, 'invalid HMAC → 401', `(status ${r2.status}, ${r2.ms}ms)`);

  // Test 3: missing HMAC, expect 401
  const r3 = await timed(() => post(url, body, null));
  log(r3.status === 401, 'missing HMAC → 401', `(status ${r3.status}, ${r3.ms}ms)`);

  console.log('');
}

console.log(`Passed: ${pass}   Failed: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
