/**
 * scripts/delete-self-shipments.mjs
 *
 * Hard-deletes Self Shipment docs from the legacy `shipments` collection.
 *
 * Usage:
 *   node scripts/delete-self-shipments.mjs                 # list (dry run)
 *   node scripts/delete-self-shipments.mjs --all           # delete all
 *   node scripts/delete-self-shipments.mjs <tid> [<tid>]   # delete specific tracking IDs
 *
 * Reads FIREBASE_SERVICE_ACCOUNT_KEY from .env.local.
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

const args = process.argv.slice(2);
const deleteAll = args.includes('--all');
const specificIds = args.filter(a => !a.startsWith('--'));

const snap = await db.collection('shipments').where('courier', '==', 'Self Shipment').get();

if (snap.empty) {
    console.log('No Self Shipment docs found.');
    process.exit(0);
}

console.log(`\nFound ${snap.size} Self Shipment doc(s):\n`);
const matches = [];
for (const doc of snap.docs) {
    const d = doc.data();
    const tid = d.courierTrackingId || d.awbNo || '(none)';
    const matched =
        deleteAll ||
        specificIds.includes(tid) ||
        specificIds.includes(doc.id);
    console.log(`  ${matched ? '✗' : ' '} ${doc.id}  ·  ${tid}  ·  status=${d.status}  ·  ${d.clientName ?? '(no client)'}`);
    if (matched) matches.push(doc);
}

if (matches.length === 0) {
    console.log('\nNothing to delete. Pass --all or specific tracking IDs / doc IDs.\n');
    process.exit(0);
}

console.log(`\nDeleting ${matches.length} doc(s)...`);
let n = 0;
for (const doc of matches) {
    await doc.ref.delete();
    n++;
}
console.log(`\nDeleted ${n} Self Shipment doc(s).\n`);
process.exit(0);
