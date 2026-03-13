import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env manually
config({ path: resolve(process.cwd(), '.env.local') });

const email = process.argv[2];
if (!email) {
    console.error('Usage: npx tsx scripts/check-user.ts <email>');
    process.exit(1);
}

// Initialize Firebase Admin
if (!getApps().length) {
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}';
    // Fix escaped newlines in private_key - the literal \n needs to become actual newlines
    // But in JSON, we need \\n to represent \n in the string
    // The issue is dotenv is interpreting \n as literal backslash-n, which becomes invalid JSON
    // We need to convert literal \n sequences back to proper JSON-escaped newlines
    
    // Replace literal backslash-n with actual newline character for the PEM key
    raw = raw.replace(/\\n/g, '\n');
    
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const auth = getAuth();

async function checkUser(email: string) {
    console.log('\n========================================');
    console.log(`Checking Shopify config for: ${email}`);
    console.log('========================================\n');

    try {
        const userRecord = await auth.getUserByEmail(email);
        const uid = userRecord.uid;
        console.log(`✓ User found: ${uid}`);
        console.log(`  Display Name: ${userRecord.displayName || 'N/A'}`);

        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            console.error('\n✗ User document not found in Firestore!');
            return;
        }

        const userData = userDoc.data()!;
        console.log('\n--- User Data ---');
        console.log(`  Company: ${userData.companyName || 'N/A'}`);
        console.log(`  Role: ${userData.role || 'N/A'}`);

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

        console.log('\n--- Scopes ---');
        const scopes = shopifyConfig.scopes || '';
        console.log(`  Raw Scopes: ${scopes}`);

        const scopeList = scopes.split(',').map((s: string) => s.trim()).filter(Boolean);
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
                console.log('  ⚠️  Token Format: Unexpected format');
            }
        }

        // Check recent Shopify shipments
        console.log('\n--- Recent Shopify Shipments ---');
        const shipmentsQuery = await db.collection('shipments')
            .where('clientId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();

        const shopifyShipments = shipmentsQuery.docs.filter(d => d.data().shopifyOrderId);
        if (shopifyShipments.length === 0) {
            console.log('  No Shopify shipments found');
        } else {
            shopifyShipments.slice(0, 5).forEach((doc, i) => {
                const s = doc.data();
                console.log(`\n  [${i + 1}] Shipment ${doc.id}`);
                console.log(`      Shopify Order ID: ${s.shopifyOrderId}`);
                console.log(`      AWB: ${s.courierTrackingId || 'NOT SET'}`);
                console.log(`      Status: ${s.status}`);
                console.log(`      Fulfillment Status: ${s.shopifyFulfillmentStatus || 'NOT SYNCED'}`);
                if (s.shopifyFulfillmentError) {
                    console.log(`      Fulfillment Error: ${s.shopifyFulfillmentError}`);
                }
            });
        }

        console.log('\n========================================');
        console.log('Diagnosis Complete');
        console.log('========================================\n');

    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            console.error(`\n✗ No user found with email: ${email}`);
        } else {
            console.error('\nError:', error.message);
        }
    }

    process.exit(0);
}

checkUser(email);
