#!/usr/bin/env node
/**
 * Set dedicated Shopify app for a user
 * Usage: node scripts/set-dedicated-shopify-app.mjs <email> <appId>
 * Example: node scripts/set-dedicated-shopify-app.mjs loomestassels@gmail.com looms
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const email = process.argv[2];
const appId = process.argv[3];

if (!email || !appId) {
    console.error('Usage: node scripts/set-dedicated-shopify-app.mjs <email> <appId>');
    console.error('');
    console.error('Available appIds:');
    console.error('  looms   - Blujay Logistics - Client Loom');
    console.error('  gayatri - Blujay Logistics - Client Gayatri');
    process.exit(1);
}

const validAppIds = ['looms', 'gayatri'];
if (!validAppIds.includes(appId)) {
    console.error(`Invalid appId: ${appId}`);
    console.error(`Valid options: ${validAppIds.join(', ')}`);
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

async function setDedicatedApp(email, appId) {
    console.log('\n========================================');
    console.log(`Setting dedicated Shopify app for: ${email}`);
    console.log(`App ID: ${appId}`);
    console.log('========================================\n');

    try {
        // 1. Find user by email
        const userRecord = await auth.getUserByEmail(email);
        const uid = userRecord.uid;
        console.log(`Found user: ${uid}`);
        console.log(`  Display Name: ${userRecord.displayName || 'N/A'}`);

        // 2. Get user document from Firestore
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            console.error('\nUser document not found in Firestore!');
            process.exit(1);
        }

        const userData = userDoc.data();
        console.log(`  Current dedicatedShopifyApp: ${userData.dedicatedShopifyApp || 'NOT SET'}`);

        // 3. Update the user document
        await db.collection('users').doc(uid).update({
            dedicatedShopifyApp: appId
        });

        console.log(`\nSUCCESS: Set dedicatedShopifyApp = "${appId}" for ${email}`);
        console.log('\nThis user will now be routed to the correct Shopify app when integrating.');

        console.log('\n========================================');
        console.log('Done!');
        console.log('========================================\n');

    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.error(`\nNo user found with email: ${email}`);
        } else {
            console.error('\nError:', error.message);
        }
        process.exit(1);
    }

    process.exit(0);
}

setDedicatedApp(email, appId);
