/**
 * scripts/dedup-looms-shipments.mjs
 *
 * Removes duplicate shipment documents created for Looms & Tassels before
 * the webhook idempotency fix (2026-06-30). The fix prevents new duplicates
 * but existing Firestore docs need a one-time cleanup.
 *
 * Strategy: for every shopifyOrderId that appears more than once under the
 * Looms clientId, keep the OLDEST document (smallest createdAt) and delete
 * all others. Orders that have already been processed (status !== 'shopify_pending')
 * are never the ones deleted — we always retain the document that matters.
 *
 * Usage:
 *   node scripts/dedup-looms-shipments.mjs            # dry run — prints what would be deleted
 *   node scripts/dedup-looms-shipments.mjs --confirm  # actually deletes
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
    process.exit(1);
}
const serviceAccount = JSON.parse(raw.replace(/\n/g, '\\n'));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });

// preferRest avoids gRPC streaming quota contention with the running dev server
const db = getFirestore();
db.settings({ preferRest: true });
const auth = getAuth();
const isDryRun = !process.argv.includes('--confirm');

if (isDryRun) {
    console.log('🔍 DRY RUN — no documents will be deleted. Pass --confirm to apply.\n');
} else {
    console.log('⚠️  LIVE RUN — duplicate documents will be permanently deleted.\n');
}

// 1. Resolve Looms clientId from email
const LOOMS_EMAIL = 'loomestassels@gmail.com';
let loomsUid;
try {
    const user = await auth.getUserByEmail(LOOMS_EMAIL);
    loomsUid = user.uid;
    console.log(`✅ Resolved Looms clientId: ${loomsUid}`);
} catch (err) {
    console.error(`❌ Could not find Firebase Auth user for ${LOOMS_EMAIL}:`, err.message);
    process.exit(1);
}

// 2. Fetch all shipments for this client (paginated to stay within quota)
const PAGE_SIZE = 100;
const allDocs = [];
let lastDoc = null;

console.log('Fetching shipments (paginated)...');
while (true) {
    let q = db.collection('shipments').where('clientId', '==', loomsUid).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const page = await q.get();
    allDocs.push(...page.docs);
    if (page.size < PAGE_SIZE) break;
    lastDoc = page.docs[page.docs.length - 1];
    await new Promise(r => setTimeout(r, 500)); // brief pause between pages
}

console.log(`📦 Total shipment documents for Looms: ${allDocs.length}\n`);

if (allDocs.length === 0) {
    console.log('No shipments found. Nothing to do.');
    process.exit(0);
}

// 3. Group by shopifyOrderId — only orders that have this field set
const groups = new Map(); // shopifyOrderId → [doc, ...]

for (const docSnap of allDocs) {
    const data = docSnap.data();
    const orderId = data.shopifyOrderId;
    if (!orderId) continue; // skip non-Shopify shipments
    if (!groups.has(orderId)) groups.set(orderId, []);
    groups.get(orderId).push(docSnap);
}

// 4. Find duplicated groups
const duplicateGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);
console.log(`🔁 Shopify orders with duplicates: ${duplicateGroups.length}`);

if (duplicateGroups.length === 0) {
    console.log('✅ No duplicates found. Nothing to delete.');
    process.exit(0);
}

// 5. For each duplicate group, keep the OLDEST doc (smallest createdAt seconds)
//    and mark the rest for deletion. If a doc has already been processed
//    (status !== 'shopify_pending'), always keep it regardless of age.
let toDelete = [];
let kept = 0;

for (const [orderId, docs] of duplicateGroups) {
    // Sort: processed docs first, then by createdAt ascending (oldest first)
    docs.sort((a, b) => {
        const aProcessed = a.data().status !== 'shopify_pending' ? 0 : 1;
        const bProcessed = b.data().status !== 'shopify_pending' ? 0 : 1;
        if (aProcessed !== bProcessed) return aProcessed - bProcessed;
        const aTs = a.data().createdAt?.seconds ?? 0;
        const bTs = b.data().createdAt?.seconds ?? 0;
        return aTs - bTs;
    });

    const [keeper, ...dupes] = docs;
    const keeperData = keeper.data();
    console.log(`  Order #${keeperData.shopifyOrderNumber || orderId} (shopifyOrderId: ${orderId})`);
    console.log(`    KEEP  [${keeper.id}] status=${keeperData.status} createdAt=${keeperData.createdAt?.toDate?.().toISOString() ?? 'unknown'}`);
    for (const dupe of dupes) {
        const d = dupe.data();
        console.log(`    DELETE [${dupe.id}] status=${d.status} createdAt=${d.createdAt?.toDate?.().toISOString() ?? 'unknown'}`);
        toDelete.push(dupe.ref);
    }
    kept++;
}

console.log(`\n📊 Summary: ${kept} orders | ${toDelete.length} duplicate docs to delete\n`);

if (isDryRun) {
    console.log('Dry run complete. Re-run with --confirm to apply deletions.');
    process.exit(0);
}

// 6. Delete in batches of 500 (Firestore batch limit)
const BATCH_SIZE = 500;
let deleted = 0;
for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
    console.log(`  🗑️  Deleted ${deleted}/${toDelete.length} documents...`);
}

console.log(`\n✅ Done. Removed ${toDelete.length} duplicate shipment document(s).`);
process.exit(0);
