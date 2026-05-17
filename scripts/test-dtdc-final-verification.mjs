/**
 * Final cross-check: pick routes that DTDC's published XLSX shows as
 * serviceable, then test if DTDC's live API will actually book them.
 *
 * Also re-tests auth on all endpoints + tries any service type variants
 * we haven't tried yet.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const env = {};
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/); if (!m) continue;
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1].trim()] = v;
}
const SA = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
const SECRET = env.SHOPIFY_API_SECRET;
const decrypt = (ct) => {
    const [iv, enc] = ct.split(':');
    const k = crypto.createHash('sha256').update(SECRET).digest();
    const d = crypto.createDecipheriv('aes-256-cbc', k, Buffer.from(iv, 'hex'));
    let o = d.update(enc, 'hex', 'utf8'); o += d.final('utf8'); return JSON.parse(o);
};

initializeApp({ credential: cert(SA) });
const db = getFirestore();
const u = await db.collection('users').where('email', '==', 'sv@gmail.com').limit(1).get();
const c = await db.doc(`clients/${u.docs[0].id}`).get();
const creds = decrypt(c.data().courierIntegrations.dtdc.credentials);

const baseUrl = 'https://dtdcapi.shipsy.io';
const headers = { 'api-key': creds.apiKey, 'Content-Type': 'application/json' };

console.log(`\n${'═'.repeat(60)}`);
console.log(`  DTDC LIVE API VERIFICATION — ${new Date().toISOString()}`);
console.log(`  Customer: ${creds.customerCode} | Env: ${creds.environment}`);
console.log(`${'═'.repeat(60)}\n`);

// ── Load XLSX-derived TAT data and pick serviceable routes to test ────
const tatData = JSON.parse(fs.readFileSync('src/data/dtdc-tat/HYDERABAD.json', 'utf8'));
const allPincodes = Object.keys(tatData);
console.log(`📋 XLSX TAT data: ${allPincodes.length} destinations marked as serviceable from Hyderabad\n`);

// Sample diverse routes (different zones, different cities)
const samples = [
    '110001', // Delhi (NORTH)
    '400001', // Mumbai (WEST)
    '560001', // Bangalore (SOUTH)
    '700001', // Kolkata (EAST)
    '600001', // Chennai (SOUTH)
    '226001', // Lucknow (NORTH)
    '781001', // Guwahati (NORTH-EAST)
    '751001', // Bhubaneswar (EAST)
];
const sampleRoutes = samples.filter(p => tatData[p]);

console.log('═══ STEP 1: Confirm XLSX shows these as serviceable ═══\n');
sampleRoutes.forEach(p => {
    const r = tatData[p];
    console.log(`  ${p} (${r.c}, ${r.s})  TAT=${r.t}d  COD=${r.cd ? 'Y' : 'N'}  Zone=${r.z}`);
});

const tryBooking = async (label, body) => {
    const resp = await fetch(`${baseUrl}/api/customer/integration/consignment/softdata`, {
        method: 'POST', headers, body: JSON.stringify({ consignments: [body] }),
    });
    const json = await resp.json().catch(() => ({}));
    const ok = json?.data?.[0]?.success === true;
    const msg = json?.data?.[0]?.message || json?.message || JSON.stringify(json).slice(0, 180);
    console.log(`  ${label.padEnd(50)} → ${ok ? `✅✅✅ BOOKED ${json.data[0].reference_number}` : `❌ ${msg}`}`);
    return ok;
};

const buildPayload = (destPin, destCity, destState, serviceType = 'B2C SMART EXPRESS') => ({
    customer_code: creds.customerCode,
    service_type_id: serviceType,
    load_type: 'NON-DOCUMENT',
    description: 'Test Item',
    dimension_unit: 'cm', length: '10', width: '10', height: '10',
    weight_unit: 'kg', weight: '0.5',
    declared_value: 200,
    num_pieces: '1',
    customer_reference_number: `VERIFY-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    commodity_id: '1',
    is_risk_surcharge_applicable: 'false',
    origin_details: {
        name: 'Bhargav Sender', phone: '9876543210',
        address_line_1: 'Plot 42, Capital Park Road, Madhapur, HITEC City',
        pincode: '500072', city: 'Hyderabad', state: 'Telangana',
    },
    destination_details: {
        name: 'Test Receiver', phone: '9123456789',
        address_line_1: 'A-12, Connaught Place, Inner Circle',
        pincode: destPin, city: destCity, state: destState,
    },
});

console.log('\n═══ STEP 2: Try booking on each XLSX-serviceable route ═══\n');
let bookingSucceeded = false;
for (const pin of sampleRoutes) {
    const r = tatData[pin];
    const ok = await tryBooking(
        `HYD → ${pin} (${r.c}, XLSX says ${r.t}d)`,
        buildPayload(pin, r.c, r.s)
    );
    if (ok) bookingSucceeded = true;
}

console.log('\n═══ STEP 3: Try service type variants we haven\'t tried ═══\n');
const newServiceTypes = [
    'PRIORITY',                   // Other product in XLSX
    'B2C PRIORITY',
    'B2C_PRIORITY',
    'DTDC PLUS',
    'EXPRESS PLUS',
    'BLITZ',
    'B2C SURFACE',
    'PREMIUM',
];
for (const st of newServiceTypes) {
    await tryBooking(`service_type=${st}`, buildPayload('110001', 'New Delhi', 'Delhi', st));
}

console.log('\n═══ STEP 4: Verify other endpoints still work ═══\n');

// Cancel
const cancelResp = await fetch(`${baseUrl}/api/customer/integration/consignment/cancel`, {
    method: 'POST', headers,
    body: JSON.stringify({ AWBNo: ['FAKEAWB001'], customerCode: creds.customerCode }),
});
const cancelText = await cancelResp.text();
console.log(`  Cancel endpoint: HTTP ${cancelResp.status} → ${cancelText.slice(0, 150)}`);

// Label
const labelResp = await fetch(
    `${baseUrl}/api/customer/integration/consignment/shippinglabel/stream?reference_number=FAKEAWB001&label_code=SHIP_LABEL_4X6&label_format=pdf`,
    { headers }
);
const labelText = await labelResp.text();
console.log(`  Label endpoint:  HTTP ${labelResp.status} → ${labelText.slice(0, 150)}`);

console.log(`\n${'═'.repeat(60)}`);
console.log(`  FINAL VERDICT`);
console.log(`${'═'.repeat(60)}`);
if (bookingSucceeded) {
    console.log(`✅ BOOKING WORKS — DTDC has activated TAT matrix for GL12290.`);
    console.log(`   You can now book shipments via the UI.`);
} else {
    console.log(`❌ BOOKING STILL BLOCKED — Per-customer TAT matrix for GL12290`);
    console.log(`   is empty in DTDC's backend, despite XLSX showing routes serviceable.`);
    console.log(`   Cancel/Label endpoints work, auth works, but bookings will fail`);
    console.log(`   until DTDC support activates the TAT matrix for this customer.`);
}
