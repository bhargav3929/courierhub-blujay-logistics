#!/usr/bin/env node
/**
 * Webhook replay harness.
 *
 * POSTs a captured fixture (from capture-webhook.mjs) to a target host,
 * optionally re-signing with a different secret. Used for:
 *   - Duplicate-detection testing (replay verbatim, expect dedup outcome)
 *   - Rotated-secret testing (resign with new secret, expect 200)
 *   - Negative testing (resign with wrong secret, expect 401)
 *
 * Usage:
 *   # Verbatim replay — same headers, same body, same signature.
 *   node scripts/replay-webhook.mjs \
 *     --fixture test/fixtures/carriers/bluedart/captured/20260515-abc.json \
 *     --target https://staging.blujaylogistic.com
 *
 *   # Re-sign with a new secret.
 *   node scripts/replay-webhook.mjs \
 *     --fixture ... --target ... \
 *     --resign-secret whsec_new_secret \
 *     --carrier bluedart
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
if (!args.fixture || !args.target) {
    console.error('Required: --fixture <path> --target <host>');
    console.error('Optional: --resign-secret <secret> --carrier <bluedart|delhivery|dtdc>');
    process.exit(1);
}

const fx = JSON.parse(readFileSync(resolve(args.fixture), 'utf8'));
const bodyBuf = Buffer.from(fx.rawBody, 'base64');

const carriers = {
    bluedart: { sigHeader: 'X-BD-Signature', algo: 'hmac-sha256-hex' },
    delhivery: { sigHeader: 'X-Delhivery-Signature', algo: 'hmac-sha256-hex' },
    dtdc: { sigHeader: 'x-dtdc-token', algo: 'static' },
};

// Build headers, lower-casing keys to avoid duplicates across the
// HTTP/2 wire (some libs uppercase, some don't).
const headers = {};
for (const [k, v] of Object.entries(fx.headers)) {
    if (['host', 'content-length', 'connection'].includes(k.toLowerCase())) continue;
    headers[k] = v;
}

if (args['resign-secret']) {
    if (!args.carrier || !carriers[args.carrier]) {
        console.error('When --resign-secret is provided, --carrier is required');
        process.exit(1);
    }
    const cfg = carriers[args.carrier];
    let newSig;
    if (cfg.algo === 'hmac-sha256-hex') {
        newSig = crypto.createHmac('sha256', args['resign-secret']).update(bodyBuf).digest('hex');
    } else if (cfg.algo === 'static') {
        newSig = args['resign-secret'];
    }
    // Replace any existing case-variant of the header.
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === cfg.sigHeader.toLowerCase()) {
            delete headers[k];
        }
    }
    headers[cfg.sigHeader] = newSig;
    console.log(`  re-signed with ${cfg.sigHeader}=${newSig.slice(0, 16)}...`);
}

const url = args.target.replace(/\/$/, '') + fx.url;

console.log('');
console.log(`  target  : ${url}`);
console.log(`  bodyLen : ${bodyBuf.length} bytes`);

const t0 = Date.now();
const r = await fetch(url, { method: fx.method, headers, body: bodyBuf });
const dt = Date.now() - t0;

let respBody;
try {
    respBody = await r.json();
} catch {
    respBody = await r.text();
}

console.log(`  status  : ${r.status}`);
console.log(`  duration: ${dt}ms`);
console.log(`  body    : ${typeof respBody === 'string' ? respBody.slice(0, 400) : JSON.stringify(respBody).slice(0, 400)}`);
console.log('');

process.exit(r.status >= 200 && r.status < 300 ? 0 : 1);

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    }
    return out;
}
