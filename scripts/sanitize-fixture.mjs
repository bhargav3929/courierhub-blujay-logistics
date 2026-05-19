#!/usr/bin/env node
/**
 * Sanitize a captured webhook fixture before committing it.
 *
 * Replaces PII (names, phone, address, pincode, email, AWB) with
 * deterministic synthetic substitutes, then recomputes the signature
 * against a fixture-only secret so replay harness still works in tests.
 *
 * Idempotent — running twice on the same file produces the same output.
 *
 * Usage:
 *   node scripts/sanitize-fixture.mjs <captured.json>
 *   node scripts/sanitize-fixture.mjs <captured.json> --out <sanitized.json>
 *
 * The fixture-only secret is the literal string `whsec_fixture`. Tests
 * that exercise webhook fixtures should use this same secret.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import crypto from 'node:crypto';

const FIXTURE_SECRET = 'whsec_fixture';

const args = parseArgs(process.argv.slice(2));
const inputPath = args._[0];
if (!inputPath) {
    console.error('usage: sanitize-fixture <captured.json> [--out <path>]');
    process.exit(1);
}

const fx = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
const bodyText = fx.bodyText
    ?? Buffer.from(fx.rawBody, 'base64').toString('utf8');

// Walk the JSON body and replace sensitive fields.
let parsed;
try {
    parsed = JSON.parse(bodyText);
} catch {
    console.error('body is not parseable JSON; manual sanitization required');
    process.exit(2);
}

const SENSITIVE_KEYS = new Set([
    // names
    'name', 'ConsigneeName', 'CustomerName', 'consigneeName',
    'shipperName', 'sellerName', 'shipper_name', 'seller_name',
    // phone
    'phone', 'mobile', 'Mobile', 'ConsigneeMobile', 'CustomerMobile',
    'ConsigneeTelephone', 'sender_phone', 'receiver_phone',
    // email
    'email', 'Email', 'consigneeEmail',
    // addresses
    'address', 'add', 'ConsigneeAddress1', 'ConsigneeAddress2',
    'CustomerAddress1', 'CustomerAddress2', 'address_line_1', 'address_line_2',
    'sellerAdd', 'seller_add',
    // ids
    'awbNo', 'AWBNo', 'awb', 'Awb', 'AWB', 'waybillNo', 'waybill',
    'Waybill', 'cn_number', 'strShipmentNo', 'awb_number', 'awbNumber',
    'tracking_id', 'cnno', 'strcnno',
    // account identifiers
    'CustomerCode', 'customer_code', 'customerCode',
    'AreaCustomerCode', 'area',
    // pickup
    'pickupLocationName', 'pickup_location',
    // secrets
    'LoginID', 'LicenceKey', 'apiKey', 'api_key', 'token', 'apiToken',
]);

const counters = {};
function nextSubstitute(kind) {
    counters[kind] = (counters[kind] || 0) + 1;
    return `FIXTURE_${kind.toUpperCase()}_${counters[kind]}`;
}

function sanitize(node, parentKey) {
    if (Array.isArray(node)) {
        return node.map(v => sanitize(v, parentKey));
    }
    if (node && typeof node === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(node)) {
            if (SENSITIVE_KEYS.has(k)) {
                out[k] = substitute(k, v);
            } else if (k === 'pincode' || k === 'pin' || k === 'ConsigneePincode' || k === 'CustomerPincode') {
                out[k] = '560001';
            } else {
                out[k] = sanitize(v, k);
            }
        }
        return out;
    }
    return node;
}

function substitute(key, value) {
    if (typeof value !== 'string') return value;
    // Preserve type/shape, replace content.
    if (/awb|waybill|cn_number|shipmentNo/i.test(key)) {
        return 'AWB-FIXTURE-' + counters['awb'] || 1;
    }
    if (/phone|mobile|telephone/i.test(key)) return '+919999999999';
    if (/email/i.test(key)) return 'fixture@example.invalid';
    if (/name/i.test(key)) return nextSubstitute('name');
    if (/address|add$/i.test(key)) return nextSubstitute('address');
    if (/customer.?code|area/i.test(key)) return 'FIXTURE_CODE';
    if (/loginid|licencekey|api.?key|token/i.test(key)) return 'FIXTURE_SECRET';
    return nextSubstitute('val');
}

const sanitized = sanitize(parsed);
const newBodyText = JSON.stringify(sanitized);
const newBodyBuf = Buffer.from(newBodyText, 'utf8');
const newBodyB64 = newBodyBuf.toString('base64');

// Recompute signature with fixture secret (HMAC-SHA256) and replace
// every variant of the signature header. Static-token carriers (DTDC)
// get the literal secret.
const newHeaders = {};
const sigHeadersToReplace = new Set([
    'x-bd-signature', 'x-delhivery-signature', 'x-dtdc-token',
]);
const hmacHex = crypto.createHmac('sha256', FIXTURE_SECRET).update(newBodyBuf).digest('hex');

for (const [k, v] of Object.entries(fx.headers)) {
    if (sigHeadersToReplace.has(k.toLowerCase())) {
        if (k.toLowerCase() === 'x-dtdc-token') {
            newHeaders[k] = FIXTURE_SECRET;
        } else {
            newHeaders[k] = hmacHex;
        }
    } else {
        newHeaders[k] = v;
    }
}

const out = {
    ...fx,
    headers: newHeaders,
    rawBody: newBodyB64,
    bodyText: newBodyText,
    notes: fx.notes ?? '(sanitized — replay with secret `whsec_fixture` or DTDC token `whsec_fixture`)',
    sanitizedAt: new Date().toISOString(),
};

const outPath = args.out
    ? resolve(args.out)
    : resolve(dirname(inputPath), basename(inputPath, '.json') + '.sanitized.json');

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`sanitized → ${outPath}`);

function parseArgs(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
        else out._.push(a);
    }
    return out;
}
