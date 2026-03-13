import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_KEY=(['"]?)([\s\S]*?)\1(?:\n|$)/);
let rawKey = match[2];
if ((rawKey.startsWith("'") && rawKey.endsWith("'")) || (rawKey.startsWith('"') && rawKey.endsWith('"'))) {
    rawKey = rawKey.slice(1, -1);
}
const serviceAccount = JSON.parse(rawKey);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
    console.log('=== Checking App 3 Usage ===\n');
    
    // Check users with app3 connected
    const usersWithApp3 = await db.collection('users')
        .where('shopifyConfig.appId', '==', 'app3')
        .get();
    
    if (usersWithApp3.empty) {
        console.log('✅ No users connected to App 3 - it is available for use');
    } else {
        console.log('❌ Users connected to App 3:');
        usersWithApp3.forEach(doc => {
            const data = doc.data();
            console.log(`  - ${data.email} (${doc.id})`);
            console.log(`    Shop: ${data.shopifyConfig?.shopUrl}`);
        });
    }
    
    // Check pending installs for app3
    console.log('\n=== Pending Installs for App 3 ===');
    const pendingSnapshot = await db.collection('pendingShopifyInstalls').get();
    let app3Pending = false;
    pendingSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.appId === 'app3') {
            app3Pending = true;
            console.log(`Shop: ${doc.id}, claimed: ${data.claimed}`);
        }
    });
    if (!app3Pending) {
        console.log('No pending installs for App 3');
    }
}

main().catch(console.error);
