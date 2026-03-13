#!/usr/bin/env node
/**
 * Diagnostic script to check a user's Shopify configuration
 * Usage: node scripts/check-shopify-user.mjs <email>
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const email = process.argv[2];
if (!email) {
    console.error('Usage: node scripts/check-shopify-user.mjs <email>');
    process.exit(1);
}

// Parse .env.local manually to handle complex JSON values
function parseEnvFile(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const vars = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2];
            // Remove surrounding quotes
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

// Initialize Firebase Admin
const rawKey = envVars.FIREBASE_SERVICE_ACCOUNT_KEY || '{}';
const serviceAccount = JSON.parse(rawKey);
const app = initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore(app);
const auth = getAuth(app);

async function checkUser(email) {
    console.log('\n========================================');
    console.log(`Checking Shopify config for: ${email}`);
    console.log('========================================\n');

    try {
        // 1. Find user by email
        const userRecord = await auth.getUserByEmail(email);
        const uid = userRecord.uid;
        console.log(`✓ User found: ${uid}`);
        console.log(`  Display Name: ${userRecord.displayName || 'N/A'}`);
        console.log(`  Created: ${new Date(userRecord.metadata.creationTime).toLocaleString()}`);
        console.log(`  Last Sign In: ${new Date(userRecord.metadata.lastSignInTime).toLocaleString()}`);

        // 2. Get user document from Firestore
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            console.error('\n✗ User document not found in Firestore!');
            return;
        }

        const userData = userDoc.data();
        console.log('\n--- User Data ---');
        console.log(`  Company: ${userData.companyName || 'N/A'}`);
        console.log(`  Role: ${userData.role || 'N/A'}`);

        // 3. Check Shopify config
        const shopifyConfig = userData.shopifyConfig;
        console.log('\n--- Shopify Configuration ---');

        if (!shopifyConfig) {
            console.error('✗ No shopifyConfig found! User has not connected Shopify.');
            return;
        }

        console.log(`  Shop URL: ${shopifyConfig.shopUrl || 'NOT SET'}`);
        console.log(`  Is Connected: ${shopifyConfig.isConnected}`);
        console.log(`  App ID: ${shopifyConfig.appId || 'default (App 1)'}`);
        console.log(`  Updated At: ${shopifyConfig.updatedAt || 'N/A'}`);
        console.log(`  Webhook Status: ${shopifyConfig.webhookStatus || 'N/A'}`);

        if (shopifyConfig.webhookError) {
            console.log(`  Webhook Error: ${shopifyConfig.webhookError}`);
        }

        // 4. Check scopes
        console.log('\n--- Scopes ---');
        const scopes = shopifyConfig.scopes || '';
        console.log(`  Raw Scopes: ${scopes}`);

        const scopeList = scopes.split(',').map(s => s.trim()).filter(Boolean);
        const requiredScopes = [
            'read_orders',
            'write_fulfillments',
            'read_merchant_managed_fulfillment_orders',
            'write_merchant_managed_fulfillment_orders'
        ];

        console.log('\n  Scope Check:');
        requiredScopes.forEach(scope => {
            const hasScope = scopeList.includes(scope);
            console.log(`    ${hasScope ? '✓' : '✗'} ${scope}`);
        });

        const missingScopes = requiredScopes.filter(s => !scopeList.includes(s));
        if (missingScopes.length > 0) {
            console.log(`\n  ⚠️  MISSING SCOPES: ${missingScopes.join(', ')}`);
            console.log('  → User needs to reconnect Shopify to grant these permissions!');
        } else {
            console.log('\n  ✓ All required scopes are present');
        }

        // 5. Check access token
        console.log('\n--- Access Token ---');
        if (!shopifyConfig.accessToken) {
            console.error('✗ No access token found!');
        } else {
            const tokenParts = shopifyConfig.accessToken.split(':');
            if (tokenParts.length === 2) {
                console.log(`  Token Format: Valid (encrypted iv:ciphertext)`);
                console.log(`  IV Length: ${tokenParts[0].length / 2} bytes`);
            } else {
                console.log('  ⚠️  Token Format: Unexpected format');
            }
        }

        // 6. Check pending install status
        if (shopifyConfig.pendingShopUrl) {
            console.log(`\n  ⚠️  Pending Shop URL: ${shopifyConfig.pendingShopUrl}`);
            console.log(`     Pending At: ${shopifyConfig.pendingAt}`);
            console.log('     → This suggests an incomplete OAuth flow');
        }

        // 7. Get recent shipments with Shopify fulfillment status
        console.log('\n--- Recent Shopify Shipments ---');
        const shipmentsQuery = await db.collection('shipments')
            .where('clientId', '==', uid)
            .where('shopifyOrderId', '!=', null)
            .orderBy('shopifyOrderId')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        if (shipmentsQuery.empty) {
            console.log('  No Shopify shipments found');
        } else {
            shipmentsQuery.forEach((doc, i) => {
                const s = doc.data();
                console.log(`\n  [${i + 1}] Shipment ${doc.id}`);
                console.log(`      Shopify Order ID: ${s.shopifyOrderId}`);
                console.log(`      AWB: ${s.courierTrackingId || 'NOT SET'}`);
                console.log(`      Fulfillment Status: ${s.shopifyFulfillmentStatus || 'NOT SYNCED'}`);
                if (s.shopifyFulfillmentError) {
                    console.log(`      Fulfillment Error: ${s.shopifyFulfillmentError}`);
                }
                if (s.shopifyFulfillmentId) {
                    console.log(`      Fulfillment ID: ${s.shopifyFulfillmentId}`);
                }
            });
        }

        console.log('\n========================================');
        console.log('Diagnosis Complete');
        console.log('========================================\n');

    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.error(`\n✗ No user found with email: ${email}`);
        } else {
            console.error('\nError:', error.message);
        }
    }

    process.exit(0);
}

checkUser(email);
