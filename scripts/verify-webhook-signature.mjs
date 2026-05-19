#!/usr/bin/env node
/**
 * Offline webhook signature verification.
 *
 * Reads a captured fixture (produced by capture-webhook.mjs), recomputes
 * the expected signature using the provided secret, and compares against
 * the carrier-supplied signature in the captured headers.
 *
 * Use this BEFORE enabling signature verification in the application
 * — it catches header-casing / encoding / body-mangling mismatches
 * without dropping real traffic.
 *
 * Usage:
 *   node scripts/verify-webhook-signature.mjs \
 *     --fixture test/fixtures/carriers/bluedart/captured/20260515-abc.json \
 *     --carrier bluedart \
 *     --secret whsec_xxxxxxxxxxxxxxxxx
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
if (!args.fixture || !args.carrier || !args.secret) {
    console.error('Required: --fixture <path> --carrier <bluedart|delhivery|dtdc> --secret <value>');
    process.exit(1);
}

const fx = JSON.parse(readFileSync(resolve(args.fixture), 'utf8'));
const rawBody = Buffer.from(fx.rawBody, 'base64');

const carriers = {
    bluedart: {
        signatureHeaders: ['x-bd-signature', 'X-BD-Signature'],
        compute: (body, secret) =>
            crypto.createHmac('sha256', secret).update(body).digest('hex'),
        algorithm: 'HMAC-SHA256',
        encoding: 'hex',
    },
    delhivery: {
        signatureHeaders: ['x-delhivery-signature', 'X-Delhivery-Signature'],
        compute: (body, secret) =>
            crypto.createHmac('sha256', secret).update(body).digest('hex'),
        algorithm: 'HMAC-SHA256',
        encoding: 'hex',
        fallback: {
            // Delhivery falls back to a static partner_token in query.
            queryParam: 'partner_token',
            match: (token, secret) => safeEqual(token, secret),
        },
    },
    dtdc: {
        signatureHeaders: ['x-dtdc-token', 'X-DTDC-Token'],
        // DTDC uses a static token, not HMAC.
        compute: (_body, secret) => secret,
        algorithm: 'static-token',
        encoding: 'plaintext',
    },
};

const cfg = carriers[args.carrier];
if (!cfg) {
    console.error(`unknown carrier: ${args.carrier}`);
    process.exit(1);
}

const headers = Object.fromEntries(
    Object.entries(fx.headers).map(([k, v]) => [k.toLowerCase(), v]),
);

let provided = null;
for (const h of cfg.signatureHeaders) {
    const v = headers[h.toLowerCase()];
    if (v) { provided = v; break; }
}

const expected = cfg.compute(rawBody, args.secret);

let match = false;
let mode = 'header';
if (provided) {
    match = safeEqual(provided, expected);
} else if (cfg.fallback) {
    const url = new URL(fx.url, 'http://x.invalid');
    const token = url.searchParams.get(cfg.fallback.queryParam);
    mode = `query[${cfg.fallback.queryParam}]`;
    if (token) match = cfg.fallback.match(token, args.secret);
    provided = token ? `<query token: ${token.slice(0, 8)}...>` : null;
}

console.log('');
console.log(`  carrier   : ${args.carrier}`);
console.log(`  algorithm : ${cfg.algorithm}`);
console.log(`  encoding  : ${cfg.encoding}`);
console.log(`  mode      : ${mode}`);
console.log(`  provided  : ${provided ?? '(none)'}`);
console.log(`  expected  : ${expected}`);
console.log(`  match     : ${match ? 'true' : 'false'}`);
console.log('');

if (!match) {
    console.error('  Signature did not match. Common causes:');
    console.error('   · wrong secret');
    console.error('   · header casing mismatch (check raw fixture)');
    console.error('   · body bytes mangled by an intermediary');
    console.error('   · encoding drift (hex vs base64)');
    process.exit(2);
}

process.exit(0);

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    }
    return out;
}

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}
