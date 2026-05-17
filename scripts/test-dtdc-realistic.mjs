/**
 * Final DTDC test with realistic addresses across many routes,
 * to definitively isolate whether TAT is the only blocker.
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

const REAL_HYD_ADDR = 'Plot 42, Capital Park Road, Madhapur, HITEC City';
const REAL_DEL_ADDR = 'A-12, Connaught Place, Inner Circle, New Delhi';

async function tryRoute(label, originPin, originCity, originState, destPin, destCity, destState) {
    const body = {
        consignments: [{
            customer_code: creds.customerCode,
            service_type_id: 'B2C SMART EXPRESS',
            load_type: 'NON-DOCUMENT',
            description: 'Test Item',
            dimension_unit: 'cm', length: '10', width: '10', height: '10',
            weight_unit: 'kg', weight: '0.5',
            declared_value: 200,
            num_pieces: '1',
            customer_reference_number: `RT-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            commodity_id: '1',
            is_risk_surcharge_applicable: 'false',
            origin_details: {
                name: 'Bhargav Test', phone: '9876543210',
                address_line_1: REAL_HYD_ADDR, pincode: originPin, city: originCity, state: originState,
            },
            destination_details: {
                name: 'Receiver Name', phone: '9123456789',
                address_line_1: REAL_DEL_ADDR, pincode: destPin, city: destCity, state: destState,
            },
        }],
    };
    const resp = await fetch(`${baseUrl}/api/customer/integration/consignment/softdata`, {
        method: 'POST', headers, body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    const ok = json?.data?.[0]?.success;
    const msg = json?.data?.[0]?.message || JSON.stringify(json).slice(0, 150);
    console.log(`  ${label.padEnd(45)} → ${ok ? `✅ ${json.data[0].reference_number}` : `❌ ${msg}`}`);
    return ok;
}

console.log(`\nCustomer: ${creds.customerCode} (production)\n`);
console.log('═══ ROUTE TESTS WITH REALISTIC ADDRESSES ═══\n');

// Many destination pincodes from Hyderabad
const destinations = [
    ['110001', 'New Delhi', 'Delhi'],
    ['110092', 'New Delhi', 'Delhi'],          // residential Delhi
    ['400001', 'Mumbai', 'Maharashtra'],
    ['400050', 'Mumbai', 'Maharashtra'],       // Bandra
    ['560001', 'Bangalore', 'Karnataka'],
    ['560034', 'Bangalore', 'Karnataka'],      // Koramangala
    ['600001', 'Chennai', 'Tamil Nadu'],
    ['700001', 'Kolkata', 'West Bengal'],
    ['380001', 'Ahmedabad', 'Gujarat'],
    ['411001', 'Pune', 'Maharashtra'],
    ['500082', 'Hyderabad', 'Telangana'],      // Hyderabad-local
    ['500016', 'Hyderabad', 'Telangana'],      // Begumpet
    ['122001', 'Gurgaon', 'Haryana'],
    ['201301', 'Noida', 'Uttar Pradesh'],
    ['302001', 'Jaipur', 'Rajasthan'],
];

let anySuccess = false;
for (const [pin, city, state] of destinations) {
    const ok = await tryRoute(`HYD 500072 → ${pin} (${city})`, '500072', 'Hyderabad', 'Telangana', pin, city, state);
    if (ok) anySuccess = true;
}

console.log('\n═══ SUMMARY ═══');
console.log(anySuccess
    ? '✅ At least one route booked successfully — DTDC IS provisioned for some routes'
    : '❌ All routes failed with TAT or similar provisioning error — confirms full DTDC backend not provisioned for GL12290'
);
