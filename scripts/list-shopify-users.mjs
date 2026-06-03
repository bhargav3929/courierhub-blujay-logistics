// List all users that have a shopifyConfig. Read-only.
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
const serviceAccount = JSON.parse(raw.replace(/\n/g, '\\n'));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection('users').get();
console.log(`Total users: ${snap.size}\n`);
for (const d of snap.docs) {
    const u = d.data();
    if (!u.shopifyConfig) continue;
    const c = u.shopifyConfig;
    console.log(`${(u.email||'(no email)').padEnd(34)} uid=${d.id}`);
    console.log(`   shop=${c.shopUrl} app=${c.appId} connected=${c.isConnected} webhook=${c.webhookStatus} updated=${c.updatedAt}`);
}
process.exit(0);
