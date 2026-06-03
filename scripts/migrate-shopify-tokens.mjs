// One-time migration: upgrade legacy non-expiring Shopify offline tokens to
// expiring tokens via token exchange (no merchant reinstall). Read+write.
//
// Usage:
//   node scripts/migrate-shopify-tokens.mjs <email>     # migrate one user
//   node scripts/migrate-shopify-tokens.mjs --all-public # migrate all public-app installs
//
// Requires the PRODUCTION SHOPIFY_PUBLIC_API_KEY/SECRET in env (the tokens were
// encrypted in prod). Run with prod secrets exported, e.g.:
//   SHOPIFY_PUBLIC_API_KEY=... SHOPIFY_PUBLIC_API_SECRET=... node scripts/migrate-shopify-tokens.mjs <email>

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const API_VERSION = '2026-04';
const arg = process.argv[2];
if (!arg) { console.error('Usage: node scripts/migrate-shopify-tokens.mjs <email> | --all-public'); process.exit(1); }

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
const serviceAccount = JSON.parse(raw.replace(/\n/g, '\\n'));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const PUBLIC_KEY = (process.env.SHOPIFY_PUBLIC_API_KEY || '').trim();
const PUBLIC_SECRET = (process.env.SHOPIFY_PUBLIC_API_SECRET || '').trim();
if (!PUBLIC_KEY || !PUBLIC_SECRET) { console.error('Missing SHOPIFY_PUBLIC_API_KEY / SECRET (export prod values).'); process.exit(1); }

function decrypt(enc, secret) {
    const [ivHex, data] = enc.split(':');
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
}
function encrypt(plain, secret) {
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return iv.toString('hex') + ':' + cipher.update(plain, 'utf8', 'hex') + cipher.final('hex');
}

async function migrateOne(docSnap) {
    const u = docSnap.data();
    const cfg = u.shopifyConfig;
    const label = `${u.email} (${docSnap.id})`;
    if (!cfg || cfg.appId !== 'public' || !cfg.accessToken || !cfg.shopUrl) {
        console.log(`SKIP ${label}: not a public install`); return;
    }
    if (cfg.refreshToken) { console.log(`SKIP ${label}: already has refresh token (expiring)`); return; }

    let oldToken;
    try { oldToken = decrypt(cfg.accessToken, PUBLIC_SECRET); }
    catch (e) { console.log(`FAIL ${label}: decrypt error (${e.message})`); return; }

    // Token exchange: legacy offline → expiring offline.
    const res = await fetch(`https://${cfg.shopUrl}/admin/oauth/access_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: PUBLIC_KEY,
            client_secret: PUBLIC_SECRET,
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token: oldToken,
            subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
            requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
            expiring: 1,
        }),
    });
    if (!res.ok) { console.log(`FAIL ${label}: token exchange ${res.status} ${(await res.text()).slice(0, 160)}`); return; }
    const d = await res.json();
    const now = Date.now();
    const update = {
        'shopifyConfig.accessToken': encrypt(d.access_token, PUBLIC_SECRET),
        'shopifyConfig.updatedAt': new Date().toISOString(),
    };
    if (d.refresh_token) update['shopifyConfig.refreshToken'] = encrypt(d.refresh_token, PUBLIC_SECRET);
    if (d.expires_in) update['shopifyConfig.accessTokenExpiresAt'] = now + d.expires_in * 1000;
    if (d.refresh_token_expires_in) update['shopifyConfig.refreshTokenExpiresAt'] = now + d.refresh_token_expires_in * 1000;
    await docSnap.ref.update(update);

    // Verify the new token works.
    const verify = await fetch(`https://${cfg.shopUrl}/admin/api/${API_VERSION}/shop.json`, { headers: { 'X-Shopify-Access-Token': d.access_token } });
    console.log(`OK   ${label}: migrated — new token ${verify.ok ? '✅ VALID' : `❌ ${verify.status}`} (expires_in=${d.expires_in}s, refresh=${!!d.refresh_token})`);
}

let docs;
if (arg === '--all-public') {
    docs = (await db.collection('users').get()).docs;
} else {
    docs = (await db.collection('users').where('email', '==', arg).get()).docs;
    if (!docs.length) { console.error('No user with email', arg); process.exit(1); }
}
for (const d of docs) await migrateOne(d);
process.exit(0);
