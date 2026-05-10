/**
 * One-off script: fetch sv@gmail.com's DTDC credentials from Firestore,
 * decrypt them, then call DTDC's serviceability API to list active service types.
 *
 * Run: node scripts/test-dtdc-serviceability.mjs
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ── load .env.local manually ──────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of envLines) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[m[1].trim()] = val;
}

const SERVICE_ACCOUNT = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
const SHOPIFY_SECRET  = env.SHOPIFY_API_SECRET || '';
const TARGET_EMAIL    = 'sv@gmail.com';

// Source / destination pincodes from the failing booking
const SOURCE_PINCODE = '500072';
const DEST_PINCODE   = '110001';

// ── crypto (mirrors courierCredCrypto.ts) ─────────────────────────────────
const getKey = () =>
    crypto.createHash('sha256').update(SHOPIFY_SECRET).digest();

const decryptCredsObject = (ciphertext) => {
    const [ivHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
    let dec = decipher.update(encrypted, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return JSON.parse(dec);
};

// ── Firebase init ─────────────────────────────────────────────────────────
initializeApp({ credential: cert(SERVICE_ACCOUNT) });
const db = getFirestore();

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
    // 1. Find the user by email
    console.log(`\nLooking up user: ${TARGET_EMAIL}`);
    const usersSnap = await db.collection('users')
        .where('email', '==', TARGET_EMAIL)
        .limit(1)
        .get();

    if (usersSnap.empty) {
        console.error('User not found in Firestore users collection.');
        process.exit(1);
    }

    const userDoc = usersSnap.docs[0];
    const uid = userDoc.id;
    console.log(`Found user UID: ${uid}`);

    // 2. Read client doc
    const clientSnap = await db.doc(`clients/${uid}`).get();
    if (!clientSnap.exists) {
        console.error('Client doc not found.');
        process.exit(1);
    }

    const client = clientSnap.data();
    const dtdcIntegration = client?.courierIntegrations?.dtdc;

    if (!dtdcIntegration || dtdcIntegration.status !== 'connected') {
        console.error('DTDC is not connected for this client.');
        process.exit(1);
    }

    // 3. Decrypt credentials
    const creds = decryptCredsObject(dtdcIntegration.credentials);
    console.log('\n── Decrypted DTDC credentials ──────────────────────');
    console.log('  Customer Code :', creds.customerCode);
    console.log('  Environment   :', creds.environment);
    console.log('  API Key       :', creds.apiKey ? creds.apiKey.slice(0, 8) + '...' : '(empty)');
    console.log('─────────────────────────────────────────────────────');

    const baseUrl = creds.environment === 'production'
        ? 'https://dtdcapi.shipsy.io'
        : 'https://alphademodashboardapi.shipsy.io';

    const headers = { 'api-key': creds.apiKey, 'Content-Type': 'application/json' };

    // 4. Probe common DTDC service types by attempting a softdata booking with each.
    //    We send a minimal valid payload — if DTDC returns something OTHER than
    //    "TAT data not found", that service type is either active or the error is different.
    //    NOTE: We use a dummy customer_reference_number so no real booking is created
    //    if DTDC validates before committing.
    const SERVICE_TYPES = [
        'SMART_EXPRESS',           // Format from DTDC's TAT report (underscore)
        'B2C_SMART_EXPRESS',
        'B2C SMART EXPRESS',
        'SMART EXPRESS',
    ];

    const basePayload = {
        customer_code: creds.customerCode,
        load_type: 'NON-DOCUMENT',
        description: 'Test Item',
        dimension_unit: 'cm',
        length: '10', width: '10', height: '10',
        weight_unit: 'kg',
        weight: '0.5',
        declared_value: 200,
        num_pieces: '1',
        customer_reference_number: `TEST-${Date.now()}`,
        commodity_id: '1',
        is_risk_surcharge_applicable: 'false',
        origin_details: {
            name: 'Test Sender', phone: '9000000000',
            address_line_1: 'Test Address', pincode: SOURCE_PINCODE,
            city: 'Hyderabad', state: 'Telangana',
        },
        destination_details: {
            name: 'Test Receiver', phone: '9000000001',
            address_line_1: 'Test Address', pincode: DEST_PINCODE,
            city: 'Delhi', state: 'Delhi',
        },
    };

    console.log(`\nProbing ${SERVICE_TYPES.length} service types on route ${SOURCE_PINCODE} → ${DEST_PINCODE}...\n`);

    const results = [];
    for (const svcType of SERVICE_TYPES) {
        const payload = { consignments: [{ ...basePayload, service_type_id: svcType }] };
        const resp = await fetch(`${baseUrl}/api/customer/integration/consignment/softdata`, {
            method: 'POST', headers, body: JSON.stringify(payload),
        });
        const json = await resp.json().catch(() => ({}));

        const msg = json?.data?.[0]?.message || json?.message || JSON.stringify(json);
        const success = json?.data?.[0]?.success === true;
        const tatError = msg.toLowerCase().includes('tat');
        const authError = resp.status === 401 || resp.status === 403;
        const notFound = resp.status === 404;

        let status;
        if (success)      status = '✅ SUCCESS — service is active & route is serviceable';
        else if (tatError) status = '❌ TAT data not found (service type may be valid but route not configured)';
        else if (authError) status = '🔒 Auth error';
        else if (notFound) status = '404';
        else               status = `⚠️  ${msg}`;

        results.push({ svcType, status, success });
        console.log(`  ${svcType.padEnd(22)} → ${status}`);
    }

    const working = results.filter(r => r.success);
    console.log('\n─────────────────────────────────────────────────────');
    if (working.length) {
        console.log('✅ Service types that successfully booked:');
        working.forEach(r => console.log(`   • ${r.svcType}`));
    } else {
        console.log('No service type returned a successful booking.');
        console.log('All results above — share with DTDC support (customer code: ' + creds.customerCode + ')');
    }
}

main().catch((err) => {
    console.error('Script error:', err.message || err);
    process.exit(1);
});
