#!/usr/bin/env node
/**
 * Diagnostic script using Firebase REST API
 */

import { readFileSync } from 'fs';
import { createSign } from 'crypto';

const email = process.argv[2] || 'ecom.g.operations@gmail.com';
console.log(`\nChecking user: ${email}\n`);

// Parse .env.local manually
const envContent = readFileSync('.env.local', 'utf8');
const lines = envContent.split('\n');
const env = {};

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
        const key = line.substring(0, eqIndex).trim();
        let value = line.substring(eqIndex + 1);
        // Handle multiline values (JSON with newlines)
        while (value.includes('\\n') && i < lines.length - 1) {
            // This is a single-line value with escaped newlines, not multiline
            break;
        }
        // Strip quotes
        if ((value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
}

// Parse service account - strip quotes, the \\n sequences are valid JSON escapes
let saJson = env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}';
// Don't convert \\n to actual newlines - they're valid JSON escape sequences
const sa = JSON.parse(saJson);

// Create JWT for service account auth
function createJWT(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        iat: now,
        exp: now + 3600,
    };
    
    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${base64Header}.${base64Payload}`;
    
    const sign = createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');
    
    return `${signatureInput}.${signature}`;
}

async function getAccessToken(serviceAccount) {
    const jwt = createJWT(serviceAccount);
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });
    const data = await response.json();
    return data.access_token;
}

async function getUserByEmail(accessToken, projectId, email) {
    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup?key=`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: [email] }),
        }
    );
    return response.json();
}

async function getFirestoreDoc(accessToken, projectId, collection, docId) {
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`,
        {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        }
    );
    return response.json();
}

function parseFirestoreValue(value) {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue);
    if (value.mapValue) {
        const result = {};
        for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
            result[k] = parseFirestoreValue(v);
        }
        return result;
    }
    if (value.arrayValue) {
        return (value.arrayValue.values || []).map(parseFirestoreValue);
    }
    return value;
}

async function main() {
    try {
        console.log('Authenticating with Firebase...');
        const accessToken = await getAccessToken(sa);
        console.log('✓ Got access token\n');

        console.log(`Looking up user: ${email}`);
        const userResult = await getUserByEmail(accessToken, sa.project_id, email);
        
        if (!userResult.users || userResult.users.length === 0) {
            console.error('✗ User not found!');
            return;
        }

        const user = userResult.users[0];
        const uid = user.localId;
        console.log(`✓ User found: ${uid}`);
        console.log(`  Display Name: ${user.displayName || 'N/A'}`);
        console.log(`  Email Verified: ${user.emailVerified}`);

        console.log('\nFetching Firestore user document...');
        const userDoc = await getFirestoreDoc(accessToken, sa.project_id, 'users', uid);
        
        if (userDoc.error) {
            console.error('✗ Error fetching user document:', userDoc.error.message);
            return;
        }

        const fields = userDoc.fields || {};
        console.log('\n--- User Data ---');
        console.log(`  Company: ${parseFirestoreValue(fields.companyName || {}) || 'N/A'}`);
        console.log(`  Role: ${parseFirestoreValue(fields.role || {}) || 'N/A'}`);

        const shopifyConfig = parseFirestoreValue(fields.shopifyConfig || {});
        console.log('\n--- Shopify Configuration ---');

        if (!shopifyConfig || Object.keys(shopifyConfig).length === 0) {
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

        console.log('\n--- Access Token ---');
        if (!shopifyConfig.accessToken) {
            console.error('✗ No access token found!');
        } else {
            const tokenParts = shopifyConfig.accessToken.split(':');
            if (tokenParts.length === 2) {
                console.log(`  Token Format: Valid (encrypted iv:ciphertext)`);
            } else {
                console.log('  ⚠️  Token Format: Unexpected');
            }
        }

        if (shopifyConfig.pendingShopUrl) {
            console.log(`\n  ⚠️  Pending Shop URL: ${shopifyConfig.pendingShopUrl}`);
            console.log('     → This suggests an incomplete OAuth flow');
        }

        console.log('\n========================================');
        console.log('Diagnosis Complete');
        console.log('========================================\n');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
