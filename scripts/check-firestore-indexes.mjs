/**
 * scripts/check-firestore-indexes.mjs
 *
 * Lints firestore.indexes.json and surfaces the queries each index
 * serves. Does NOT call Firebase — purely offline analysis. For live
 * status of deployed indexes (Building / Enabled), use:
 *   firebase firestore:indexes --project blujay-dd8cd
 *
 * Usage:
 *   node scripts/check-firestore-indexes.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexesPath = resolve(__dirname, '..', 'firestore.indexes.json');

const json = JSON.parse(readFileSync(indexesPath, 'utf8'));

const total = json.indexes.length;
const byCollection = {};
for (const idx of json.indexes) {
    byCollection[idx.collectionGroup] = (byCollection[idx.collectionGroup] || 0) + 1;
}

console.log('');
console.log(`  firestore.indexes.json`);
console.log(`  ${'─'.repeat(60)}`);
console.log(`  Total composite indexes: ${total}`);
console.log('');
console.log('  By collection:');
for (const [coll, n] of Object.entries(byCollection).sort()) {
    console.log(`    ${coll.padEnd(20)} ${n} indexes`);
}
console.log('');

// ─── Validate each index ────────────────────────────────────────────────

const issues = [];
const seenSignatures = new Set();

for (let i = 0; i < json.indexes.length; i++) {
    const idx = json.indexes[i];
    const sig = `${idx.collectionGroup}|${(idx.fields ?? [])
        .map(f => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? '?'}`)
        .join(',')}`;

    if (!idx.collectionGroup) {
        issues.push({ idx: i, msg: 'missing collectionGroup' });
    }
    if (!Array.isArray(idx.fields) || idx.fields.length < 2) {
        issues.push({ idx: i, msg: `composite indexes need ≥2 fields (got ${idx.fields?.length ?? 0})` });
    }
    if (seenSignatures.has(sig)) {
        issues.push({ idx: i, msg: `duplicate of an earlier index: ${sig}` });
    }
    seenSignatures.add(sig);

    // Hint: an index that doesn't include _for is missing rationale.
    if (!idx._for) {
        issues.push({ idx: i, msg: `index has no _for description (helpful for future readers)`, severity: 'hint' });
    }
}

if (issues.length === 0) {
    console.log('  ✓ All indexes pass static checks.');
} else {
    const errors = issues.filter(i => i.severity !== 'hint');
    const hints = issues.filter(i => i.severity === 'hint');
    if (errors.length > 0) {
        console.log(`  ✗ ${errors.length} issue(s):`);
        for (const e of errors) {
            console.log(`     index #${e.idx}: ${e.msg}`);
        }
    }
    if (hints.length > 0) {
        console.log(`  ${hints.length} hint(s) — indexes without rationale:`);
        for (const h of hints.slice(0, 5)) {
            console.log(`     index #${h.idx}`);
        }
        if (hints.length > 5) console.log(`     ... and ${hints.length - 5} more`);
    }
}

// ─── Known query patterns this file should cover ────────────────────────

console.log('');
console.log('  Expected coverage:');
console.log('  ─────────────────');

const expected = [
    // collection, [field names], description
    ['shipments', ['partnerId', 'status', 'createdAt'], 'admin: partner+status'],
    ['shipments', ['partnerId', 'externalRef'], 'admin: partner+externalRef lookup'],
    ['shipments', ['partnerId', 'clientId', 'createdAt'], 'admin: partner+client'],
    ['shipments', ['courier.code', 'courier.awb'], 'admin: AWB lookup'],
    ['shipments', ['fulfillmentMode', 'createdAt'], 'admin: fulfillment-only'],
    ['shipments', ['trackingMode', 'createdAt'], 'admin: trackingMode-only'],
    ['shipments', ['shipmentSource', 'createdAt'], 'admin: source-only'],
    ['shipments', ['status', 'createdAt'], 'admin: status-only'],
    ['shipments', ['courier.code', 'createdAt'], 'admin: courier-only'],
    ['shipments', ['clientId', 'createdAt'], 'admin: clientId-only'],
    ['shipments', ['artifacts.label.status', 'createdAt'], 'admin: label-status-only'],
    ['shipments', ['awaitingCarrierReconciliation', 'createdAt'], 'admin: awaiting-only'],
    ['shipments', ['status', 'courier.code', 'createdAt'], 'admin: status+courier'],
    ['shipments', ['partnerId', 'courier.code', 'createdAt'], 'admin: partner+courier'],
    ['shipments', ['partnerId', 'fulfillmentMode', 'createdAt'], 'admin: partner+fulfillment'],
    ['shipments', ['partnerId', 'artifacts.label.status', 'createdAt'], 'admin: partner+label'],
    ['shipments', ['artifacts.label.status', 'fulfillmentMode', 'createdAt'], 'admin: label+fulfillment'],
    ['shipments', ['courier.code', 'fulfillmentMode', 'createdAt'], 'admin: courier+fulfillment'],
    ['shipments', ['status', 'fulfillmentMode', 'tracking.lastEventAt'], 'PollingWorker'],
    ['shipments', ['awaitingCarrierReconciliation', 'reconcileNextAttemptAt'], 'BookingReconciler'],
    ['shipments', ['artifacts.label.status', 'artifacts.label.attempts'], 'Label failure queue'],
    ['shipments', ['fulfillmentMode', 'artifacts.label.status', 'artifacts.label.attempts'], 'LabelRetrievalJob'],
    ['shipments', ['courier.code', 'status', 'tracking.lastEventAt'], 'Carrier Health: stuck'],
    ['shipments', ['courier.code', 'artifacts.label.status'], 'Carrier Health: labels'],
    ['shipments', ['reconcileCourier', 'awaitingCarrierReconciliation'], 'Carrier Health: reconcile'],
    ['events', ['partnerId', 'occurredAt'], 'events timeline (×2 orders)'],
    ['b2b_jobs', ['status', 'runAt'], 'Job dispatcher'],
    ['b2b_jobs', ['topic', 'status', 'runAt'], 'Topic job dispatcher'],
    ['rate_cards', ['partnerId', 'clientId', 'activeFrom'], 'RateCardEngine'],
    ['b2b_sagas', ['status', 'updatedAt'], 'Operations: compensation_failed'],
];

let covered = 0;
let missing = 0;
for (const [coll, fields, desc] of expected) {
    const fieldSet = new Set(fields);
    const match = json.indexes.find(idx =>
        idx.collectionGroup === coll &&
        idx.fields?.length === fields.length &&
        idx.fields.every(f => fieldSet.has(f.fieldPath))
    );
    if (match) {
        covered++;
    } else {
        missing++;
        console.log(`    ✗ MISSING: ${coll}  [${fields.join(', ')}]  — ${desc}`);
    }
}

console.log('');
if (missing === 0) {
    console.log(`  ✓ All ${expected.length} expected query patterns are covered.`);
} else {
    console.log(`  ${covered}/${expected.length} expected patterns covered. ${missing} missing — add them above.`);
}

console.log('');
console.log('  Next step:');
console.log('    firebase deploy --only firestore:indexes');
console.log('');
process.exit(issues.filter(i => i.severity !== 'hint').length > 0 ? 1 : 0);
