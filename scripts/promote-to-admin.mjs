/**
 * scripts/promote-to-admin.mjs
 *
 * Sets users/<uid>.role = 'admin' so the user can access the
 * (admin) route group (including all /b2b/* pages).
 *
 * Usage:
 *   node scripts/promote-to-admin.mjs                  # lists users
 *   node scripts/promote-to-admin.mjs <email-or-uid>   # promotes that user
 *
 * Reads FIREBASE_SERVICE_ACCOUNT_KEY from .env.local.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

const auth = getAuth();
const db = getFirestore();

const arg = process.argv[2];

async function listUsers() {
    console.log('\n--- Users in this Firebase project ---\n');
    let page = await auth.listUsers(100);
    let n = 0;
    for (const u of page.users) {
        const doc = await db.collection('users').doc(u.uid).get();
        const role = doc.exists ? (doc.data()?.role ?? '(no role field)') : '(no users doc)';
        console.log(`  ${u.email ?? '(no email)'}  ·  ${u.uid}  ·  role=${role}`);
        n++;
    }
    console.log(`\n${n} users total.\n`);
    console.log('Promote one with:  node scripts/promote-to-admin.mjs <email-or-uid>\n');
}

async function findUser(arg) {
    if (arg.includes('@')) {
        try {
            return await auth.getUserByEmail(arg);
        } catch {
            return null;
        }
    }
    try {
        return await auth.getUser(arg);
    } catch {
        return null;
    }
}

async function promote(arg) {
    const u = await findUser(arg);
    if (!u) {
        console.error(`No user found for '${arg}'`);
        process.exit(2);
    }
    const ref = db.collection('users').doc(u.uid);
    const before = await ref.get();
    const beforeRole = before.exists ? (before.data()?.role ?? '(none)') : '(no doc)';

    await ref.set({ role: 'admin' }, { merge: true });

    const after = await ref.get();
    console.log('');
    console.log(`  uid     : ${u.uid}`);
    console.log(`  email   : ${u.email ?? '(none)'}`);
    console.log(`  role    : ${beforeRole}  →  ${after.data()?.role}`);
    console.log('');
    console.log('  Done. Hard-refresh the browser (Ctrl+Shift+R) and reopen /b2b/shipments.');
    console.log('  If the layout still redirects, click "N" avatar → Log out → sign in again.');
    console.log('');
}

if (!arg) {
    await listUsers();
} else {
    await promote(arg);
}
process.exit(0);
