/**
 * scripts/delete-test-orders.mjs
 *
 * Removes any orders that were injected by create-test-order.mjs (tagged
 * with metadata.source = 'create-test-order.mjs'). Real customer orders
 * never get this tag, so this is safe to run any time.
 *
 * Usage:
 *   node scripts/delete-test-orders.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
    process.exit(1);
}
const serviceAccount = JSON.parse(raw.replace(/\n/g, '\\n'));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

const snap = await db
    .collection('orders')
    .where('metadata.source', '==', 'create-test-order.mjs')
    .get();

if (snap.empty) {
    console.log('No test orders found.');
    process.exit(0);
}

console.log(`Found ${snap.size} test order(s). Deleting...`);
for (const doc of snap.docs) {
    await doc.ref.delete();
    console.log(`  ✅ Deleted ${doc.id}`);
}
console.log('Done.');
process.exit(0);
