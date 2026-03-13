import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read .env.local to get the service account key
const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');

// Extract FIREBASE_SERVICE_ACCOUNT_KEY from .env.local
const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(['"]?)([\s\S]*?)\1(?:\n|$)/);
if (!match) {
    console.error('Could not find FIREBASE_SERVICE_ACCOUNT_KEY in .env.local');
    process.exit(1);
}

let rawKey = match[2];
// Remove surrounding quotes if present
if ((rawKey.startsWith("'") && rawKey.endsWith("'")) || (rawKey.startsWith('"') && rawKey.endsWith('"'))) {
    rawKey = rawKey.slice(1, -1);
}

const serviceAccount = JSON.parse(rawKey);

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function main() {
    // 1. Check user loomestassels@gmail.com
    const userId = 'ecXvcAZyHgfYBKbTazcq9mmNdOt1';
    const userDoc = await db.collection('users').doc(userId).get();
    
    console.log('=== User: loomestassels@gmail.com ===');
    console.log('UID:', userId);
    
    if (userDoc.exists) {
        const data = userDoc.data();
        console.log('Email:', data.email);
        console.log('Role:', data.role);
        console.log('Client Type:', data.clientType);
        console.log('');
        console.log('Shopify Config:');
        if (data.shopifyConfig) {
            console.log('  shopUrl:', data.shopifyConfig.shopUrl || 'NOT SET');
            console.log('  isConnected:', data.shopifyConfig.isConnected || false);
            console.log('  pendingShopUrl:', data.shopifyConfig.pendingShopUrl || 'NOT SET');
            console.log('  appId:', data.shopifyConfig.appId || 'NOT SET');
            console.log('  scopes:', data.shopifyConfig.scopes || 'NOT SET');
            console.log('  accessToken:', data.shopifyConfig.accessToken ? 'EXISTS (encrypted)' : 'NO');
        } else {
            console.log('  NO shopifyConfig field');
        }
    } else {
        console.log('USER NOT FOUND');
    }
    
    console.log('\n=== Pending Shopify Installs (App 2) ===');
    const pendingSnapshot = await db.collection('pendingShopifyInstalls').get();
    
    if (pendingSnapshot.empty) {
        console.log('No pending installs found');
    } else {
        pendingSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.appId === 'app2' || !data.appId) {
                console.log(`Shop: ${doc.id}`);
                console.log(`  appId: ${data.appId || 'NOT SET (could be any app)'}`);
                console.log(`  claimed: ${data.claimed}`);
                console.log(`  installedAt: ${data.installedAt}`);
                console.log(`  scopes: ${data.scopes}`);
                console.log('');
            }
        });
    }
    
    // Also check for any users with app2 connected
    console.log('\n=== Users with App 2 Connected ===');
    const usersWithApp2 = await db.collection('users')
        .where('shopifyConfig.appId', '==', 'app2')
        .get();
    
    if (usersWithApp2.empty) {
        console.log('No users with App 2 connected');
    } else {
        usersWithApp2.forEach(doc => {
            const data = doc.data();
            console.log(`User: ${data.email} (${doc.id})`);
            console.log(`  Shop: ${data.shopifyConfig?.shopUrl}`);
            console.log(`  Connected: ${data.shopifyConfig?.isConnected}`);
        });
    }
}

main().catch(console.error);
