// Diagnose a merchant's Shopify connection health.
// Usage: node scripts/diagnose-shopify-connection.mjs <email>
//
// Reads the user's shopifyConfig, decrypts the token, and queries Shopify:
//   - GET /shop.json        → is the access token still valid?
//   - GET /webhooks.json    → are the orders/create + uninstall webhooks still registered, and to which URL?
// Read-only. Never writes anything.

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const API_VERSION = '2026-04';
const email = process.argv[2];
if (!email) { console.error('Usage: node scripts/diagnose-shopify-connection.mjs <email>'); process.exit(1); }

// ── init firebase-admin (same pattern as other scripts) ──
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing in .env.local'); process.exit(1); }
const serviceAccount = JSON.parse(raw.replace(/\n/g, '\\n'));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── token decrypt (mirror of shopifyTokenCrypto.decryptTokenWithSecret) ──
function decryptTokenWithSecret(encryptedToken, secret) {
    const [ivHex, encrypted] = encryptedToken.split(':');
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

const SECRET_BY_APP = {
    public: (process.env.SHOPIFY_PUBLIC_API_SECRET || '').trim(),
    looms: (process.env.SHOPIFY_LOOMS_API_SECRET || '').trim(),
    gayatri: (process.env.SHOPIFY_GAYATRI_API_SECRET || '').trim(),
    app2: (process.env.SHOPIFY2_API_SECRET || '').trim(),
    app3: (process.env.SHOPIFY3_API_SECRET || '').trim(),
};

const snap = await db.collection('users').where('email', '==', email).get();
if (snap.empty) { console.error('No user with email', email); process.exit(1); }

for (const docSnap of snap.docs) {
    const u = docSnap.data();
    const cfg = u.shopifyConfig;
    console.log('\n================ USER', docSnap.id, '================');
    console.log('email:', u.email, '| role:', u.role);
    if (!cfg) { console.log('No shopifyConfig — never connected.'); continue; }

    console.log('shopUrl       :', cfg.shopUrl);
    console.log('appId         :', cfg.appId);
    console.log('isConnected   :', cfg.isConnected);
    console.log('scopes        :', cfg.scopes);
    console.log('webhookStatus :', cfg.webhookStatus, cfg.webhookError ? `(err: ${cfg.webhookError})` : '');
    console.log('updatedAt     :', cfg.updatedAt);

    if (!cfg.accessToken || !cfg.shopUrl) { console.log('No token/shopUrl stored.'); continue; }

    const secret = SECRET_BY_APP[cfg.appId] ?? (process.env.SHOPIFY_API_SECRET || '').trim();
    let token;
    try { token = decryptTokenWithSecret(cfg.accessToken, secret); }
    catch (e) { console.log('❌ Token DECRYPT failed:', e.message, '(wrong secret for appId?)'); continue; }

    const h = { 'X-Shopify-Access-Token': token };

    // 1) Token validity
    try {
        const r = await fetch(`https://${cfg.shopUrl}/admin/api/${API_VERSION}/shop.json`, { headers: h });
        console.log('\nGET /shop.json →', r.status, r.ok ? '✅ token VALID' : '❌ token REJECTED');
        if (!r.ok) console.log('   body:', (await r.text()).slice(0, 200));
    } catch (e) { console.log('GET /shop.json error:', e.message); }

    // 2) Webhook subscriptions
    try {
        const r = await fetch(`https://${cfg.shopUrl}/admin/api/${API_VERSION}/webhooks.json`, { headers: h });
        if (!r.ok) { console.log('GET /webhooks.json →', r.status, (await r.text()).slice(0, 200)); }
        else {
            const { webhooks } = await r.json();
            console.log(`\nActive webhook subscriptions (${webhooks.length}):`);
            for (const w of webhooks) console.log(`  • ${w.topic.padEnd(22)} → ${w.address}  (api ${w.api_version})`);
            if (!webhooks.some(w => w.topic === 'orders/create')) {
                console.log('  ⚠️  NO orders/create webhook — this is why orders stop being fetched!');
            }
        }
    } catch (e) { console.log('GET /webhooks.json error:', e.message); }
}
process.exit(0);
