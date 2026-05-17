/**
 * Comprehensive DTDC booking diagnosis for sv@gmail.com (GL12290).
 *
 * Tests:
 *   1. Multiple origin pincodes (in case DTDC has TAT registered for a specific origin)
 *   2. Multiple destination pincodes (in case TAT only exists for specific routes)
 *   3. Payload variants (load_type, commodity_id, weights, customer_code casing)
 *   4. Other endpoints (cancel, label) to verify which APIs are provisioned
 *
 * Run: node scripts/test-dtdc-booking-full.mjs
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = {};
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1].trim()] = v;
}

const SERVICE_ACCOUNT = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
const SHOPIFY_SECRET = env.SHOPIFY_API_SECRET;

const getKey = () => crypto.createHash('sha256').update(SHOPIFY_SECRET).digest();
const decryptCredsObject = (ct) => {
    const [iv, enc] = ct.split(':');
    const d = crypto.createDecipheriv('aes-256-cbc', getKey(), Buffer.from(iv, 'hex'));
    let out = d.update(enc, 'hex', 'utf8');
    out += d.final('utf8');
    return JSON.parse(out);
};

initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

const log = (...a) => console.log(...a);
const sep = (s) => log(`\n${'═'.repeat(60)}\n  ${s}\n${'═'.repeat(60)}`);

async function main() {
    const usersSnap = await db.collection('users').where('email', '==', 'sv@gmail.com').limit(1).get();
    const uid = usersSnap.docs[0].id;
    const clientSnap = await db.doc(`clients/${uid}`).get();
    const creds = decryptCredsObject(clientSnap.data().courierIntegrations.dtdc.credentials);

    log(`Customer code: ${creds.customerCode} | Env: ${creds.environment}`);
    const baseUrl = creds.environment === 'production' ? 'https://dtdcapi.shipsy.io' : 'https://alphademodashboardapi.shipsy.io';
    const headers = { 'api-key': creds.apiKey, 'Content-Type': 'application/json' };

    const buildBody = (overrides = {}) => ({
        customer_code: creds.customerCode,
        service_type_id: 'B2C SMART EXPRESS',
        load_type: 'NON-DOCUMENT',
        description: 'Test',
        dimension_unit: 'cm', length: '10', width: '10', height: '10',
        weight_unit: 'kg', weight: '0.5',
        declared_value: 200,
        num_pieces: '1',
        customer_reference_number: `DIAG-${Date.now()}`,
        commodity_id: '1',
        is_risk_surcharge_applicable: 'false',
        origin_details: { name: 'Test Sender', phone: '9000000000', address_line_1: 'Test', pincode: '500072', city: 'Hyderabad', state: 'Telangana' },
        destination_details: { name: 'Test Receiver', phone: '9000000001', address_line_1: 'Test', pincode: '110001', city: 'Delhi', state: 'Delhi' },
        ...overrides,
    });

    const tryBook = async (label, overrides) => {
        const body = buildBody(overrides);
        const resp = await fetch(`${baseUrl}/api/customer/integration/consignment/softdata`, {
            method: 'POST', headers, body: JSON.stringify({ consignments: [body] }),
        });
        const json = await resp.json().catch(() => ({}));
        const success = json?.data?.[0]?.success === true;
        const msg = json?.data?.[0]?.message || json?.message || JSON.stringify(json).slice(0, 200);
        const status = success ? `✅ SUCCESS — AWB ${json.data[0].reference_number}` : `❌ ${msg}`;
        log(`  ${label.padEnd(50)} → ${status}`);
        return { label, success, msg, full: json };
    };

    // ── Test 1: Multiple origins from Hyderabad area ──────────────────────
    sep('TEST 1: Multiple Hyderabad origin pincodes → Delhi 110001');
    const hydOrigins = ['500072', '500081', '500001', '500003', '500032', '500082', '500030'];
    for (const pin of hydOrigins) {
        await tryBook(`origin=${pin}`, {
            origin_details: { name: 'Test', phone: '9000000000', address_line_1: 'T', pincode: pin, city: 'Hyderabad', state: 'Telangana' },
        });
    }

    // ── Test 2: Multiple destinations from 500072 ─────────────────────────
    sep('TEST 2: Origin 500072 → multiple destination pincodes');
    const destinations = [
        ['110001', 'Delhi'], ['400001', 'Mumbai'], ['560001', 'Bangalore'],
        ['600001', 'Chennai'], ['700001', 'Kolkata'], ['380001', 'Ahmedabad'],
        ['411001', 'Pune'], ['500082', 'Hyderabad-local'], ['122001', 'Gurgaon'],
    ];
    for (const [pin, city] of destinations) {
        await tryBook(`dest=${pin} (${city})`, {
            destination_details: { name: 'Test', phone: '9000000001', address_line_1: 'T', pincode: pin, city, state: 'X' },
        });
    }

    // ── Test 3: Payload variants ──────────────────────────────────────────
    sep('TEST 3: Payload variants (default route 500072 → 110001)');
    await tryBook('load_type=DOCUMENT', { load_type: 'DOCUMENT' });
    await tryBook('weight=2 (heavier)', { weight: '2' });
    await tryBook('weight=0.1 (very light)', { weight: '0.1' });
    await tryBook('commodity_id=99', { commodity_id: '99' });
    await tryBook('customer_code=lowercase', { customer_code: creds.customerCode.toLowerCase() });
    await tryBook('with sub_product_code=P', { sub_product_code: 'P' });
    await tryBook('with cod_amount=0', { cod_amount: 0 });
    await tryBook('with origin city UPPERCASE', {
        origin_details: { name: 'Test', phone: '9000000000', address_line_1: 'T', pincode: '500072', city: 'HYDERABAD', state: 'TELANGANA' },
    });

    // ── Test 4: Try Kolkata origin (we have TAT data for that too) ─────
    sep('TEST 4: Kolkata origin → various destinations');
    for (const [pin, city] of [['110001', 'Delhi'], ['400001', 'Mumbai'], ['500001', 'Hyderabad']]) {
        await tryBook(`KOL→${pin} (${city})`, {
            origin_details: { name: 'Test', phone: '9000000000', address_line_1: 'T', pincode: '700001', city: 'Kolkata', state: 'West Bengal' },
            destination_details: { name: 'Test', phone: '9000000001', address_line_1: 'T', pincode: pin, city, state: 'X' },
        });
    }

    // ── Test 5: Other DTDC API endpoints ──────────────────────────────────
    sep('TEST 5: Other endpoints — are they provisioned?');

    // Cancel (with fake AWB)
    log('  Cancel endpoint:');
    const cancelResp = await fetch(`${baseUrl}/api/customer/integration/consignment/cancel`, {
        method: 'POST', headers,
        body: JSON.stringify({ AWBNo: ['FAKE123456789'], customerCode: creds.customerCode }),
    });
    log(`    HTTP ${cancelResp.status}: ${(await cancelResp.text()).slice(0, 200)}`);

    // Label
    log('  Label endpoint:');
    const labelResp = await fetch(
        `${baseUrl}/api/customer/integration/consignment/shippinglabel/stream?reference_number=FAKE123&label_code=SHIP_LABEL_4X6&label_format=pdf`,
        { headers }
    );
    log(`    HTTP ${labelResp.status}: ${(await labelResp.text()).slice(0, 200)}`);

    log('\n══════════════════════════════════════════════════');
    log('  DIAGNOSIS COMPLETE');
    log('══════════════════════════════════════════════════');
}

main().catch((e) => { console.error(e); process.exit(1); });
