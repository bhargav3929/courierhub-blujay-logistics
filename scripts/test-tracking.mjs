#!/usr/bin/env node
/**
 * Test Blue Dart Tracking API with real AWB numbers from Firestore
 * Usage: node scripts/test-tracking.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local
function parseEnvFile(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const vars = {};
    for (const line of content.split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2];
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            vars[key] = value;
        }
    }
    return vars;
}

const envVars = parseEnvFile(join(__dirname, '..', '.env.local'));

// Initialize Firebase
const serviceAccount = JSON.parse(envVars.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function main() {
    console.log('\n========================================');
    console.log('Blue Dart Tracking API Test');
    console.log('========================================\n');

    // Step 1: Find Blue Dart shipments with AWB numbers
    console.log('[1] Fetching Blue Dart shipments from Firestore...\n');

    // Fetch recent shipments (no composite index needed)
    const shipmentsQuery = await db.collection('shipments')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

    if (shipmentsQuery.empty) {
        console.log('No Blue Dart shipments found in Firestore.');
        process.exit(0);
    }

    const shipments = [];
    shipmentsQuery.forEach(doc => {
        const s = doc.data();
        if (s.courierTrackingId && s.courier === 'Blue Dart') {
            shipments.push({
                id: doc.id,
                awb: s.courierTrackingId,
                status: s.status,
                courier: s.courier,
                clientName: s.clientName,
                destination: s.destination?.city || 'Unknown',
                createdAt: s.createdAt?.toDate?.()?.toISOString?.() || 'N/A'
            });
        }
    });

    if (shipments.length === 0) {
        console.log('No shipments with AWB numbers found.');
        process.exit(0);
    }

    console.log(`Found ${shipments.length} Blue Dart shipments with AWB numbers:\n`);
    shipments.forEach((s, i) => {
        console.log(`  [${i + 1}] AWB: ${s.awb} | Status: ${s.status} | Client: ${s.clientName} | Dest: ${s.destination} | Date: ${s.createdAt}`);
    });

    // Step 2: Test tracking API directly (server-side, bypassing the Next.js route)
    const testAwb = shipments[0].awb;
    console.log(`\n[2] Testing Blue Dart Tracking API with AWB: ${testAwb}\n`);

    const IS_PRODUCTION = (envVars.NEXT_PUBLIC_BLUEDART_ENV || '').toLowerCase() === 'production';
    const BASE_URL = IS_PRODUCTION
        ? 'https://apigateway.bluedart.com/in/transportation'
        : 'https://apigateway-sandbox.bluedart.com/in/transportation';

    console.log(`  Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX'}`);
    console.log(`  Base URL: ${BASE_URL}`);

    // Step 2a: Get JWT token
    console.log('\n  [2a] Authenticating...');
    let jwtToken;
    try {
        const authResp = await axios.get(`${BASE_URL}/token/v1/login`, {
            headers: {
                'accept': 'application/json',
                'ClientID': envVars.NEXT_PUBLIC_BLUEDART_CLIENT_ID,
                'clientSecret': envVars.NEXT_PUBLIC_BLUEDART_CLIENT_SECRET
            }
        });
        jwtToken = authResp.data.JWTToken || authResp.data.token;
        console.log(`  ✓ Token obtained (${jwtToken?.substring(0, 20)}...)`);
    } catch (err) {
        console.error('  ✗ Auth failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // Tracking license key — use the one from the email (Tracking API License Key)
    const TRACKING_KEY = envVars.BLUEDART_TRACKING_LICENSE_KEY || 'hgs6nguren9qudssensmhluhptlolpoq';
    const TRACKING_VERSION = envVars.BLUEDART_TRACKING_API_VERSION || '1.3';
    console.log(`  Tracking License Key: ${TRACKING_KEY?.substring(0, 10)}...`);
    console.log(`  Tracking Version: ${TRACKING_VERSION}`);

    // Try multiple payload / endpoint variations
    const WAYBILL_KEY = envVars.NEXT_PUBLIC_BLUEDART_LICENSE_KEY;
    const LOGIN_ID = envVars.NEXT_PUBLIC_BLUEDART_LOGIN_ID;

    const tests = [
        {
            name: '[2b] POST GetShipmentDetails + Tracking Key + Version 1.3',
            method: 'post',
            url: `${BASE_URL}/tracking/v1/GetShipmentDetails`,
            data: {
                ShipmentId: [testAwb],
                Profile: { LoginID: LOGIN_ID, LicenceKey: TRACKING_KEY, Api_type: 'S', Version: '1.3' }
            }
        },
        {
            name: '[2c] POST GetShipmentDetails + Waybill Key + Version 1.3',
            method: 'post',
            url: `${BASE_URL}/tracking/v1/GetShipmentDetails`,
            data: {
                ShipmentId: [testAwb],
                Profile: { LoginID: LOGIN_ID, LicenceKey: WAYBILL_KEY, Api_type: 'S', Version: '1.3' }
            }
        },
        {
            name: '[2d] POST GetShipmentDetails + Tracking Key + Version 1.10',
            method: 'post',
            url: `${BASE_URL}/tracking/v1/GetShipmentDetails`,
            data: {
                ShipmentId: [testAwb],
                Profile: { LoginID: LOGIN_ID, LicenceKey: TRACKING_KEY, Api_type: 'S', Version: '1.10' }
            }
        },
        {
            name: '[2e] POST GetShipmentDetails + Waybill Key + Version 1.10',
            method: 'post',
            url: `${BASE_URL}/tracking/v1/GetShipmentDetails`,
            data: {
                ShipmentId: [testAwb],
                Profile: { LoginID: LOGIN_ID, LicenceKey: WAYBILL_KEY, Api_type: 'S', Version: '1.10' }
            }
        },
        {
            name: '[2f] POST GetShipmentDetails + LicenseKey (alt spelling) + Tracking Key',
            method: 'post',
            url: `${BASE_URL}/tracking/v1/GetShipmentDetails`,
            data: {
                ShipmentId: [testAwb],
                Profile: { LoginID: LOGIN_ID, LicenseKey: TRACKING_KEY, Api_type: 'S', Version: '1.3' }
            }
        },
        {
            name: '[2g] POST with handler=trkr (seen in some BD docs)',
            method: 'post',
            url: `${BASE_URL}/tracking/v1/GetShipmentDetails`,
            data: {
                handler: 'trkr',
                action: 'GetTrackingDetail',
                ShipmentId: [testAwb],
                Profile: { LoginID: LOGIN_ID, LicenceKey: TRACKING_KEY, Api_type: 'S', Version: '1.3' }
            }
        },
        {
            name: '[2h] GET /tracking/v1/shipment (from old test file)',
            method: 'get',
            url: `${BASE_URL}/tracking/v1/shipment`,
            params: { awb: testAwb },
        },
    ];

    for (const test of tests) {
        console.log(`\n  ${test.name}`);
        try {
            let resp;
            if (test.method === 'post') {
                console.log('  Body:', JSON.stringify(test.data?.Profile, null, 2));
                resp = await axios.post(test.url, test.data, {
                    headers: { 'JWTToken': jwtToken, 'Content-Type': 'application/json' },
                    timeout: 15000
                });
            } else {
                resp = await axios.get(test.url, {
                    params: test.params,
                    headers: { 'JWTToken': jwtToken, 'Content-Type': 'application/json' },
                    timeout: 15000
                });
            }
            const respStr = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
            const isError = respStr.includes('Error') || respStr.includes('error') || respStr.includes('Mismatch');
            console.log(`  ${isError ? '⚠️' : '✓'} Status: ${resp.status}`);
            console.log('  Response:', respStr.substring(0, 500));
        } catch (err) {
            console.log(`  ✗ Failed (${err.response?.status}):`, typeof err.response?.data === 'string' ? err.response.data.substring(0, 300) : JSON.stringify(err.response?.data || err.message).substring(0, 300));
        }
    }

    console.log('\n========================================');
    console.log('Test Complete');
    console.log('========================================\n');

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
