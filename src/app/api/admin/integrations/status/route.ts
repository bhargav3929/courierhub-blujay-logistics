// GET /api/admin/integrations/status
//
// Returns the configuration status of platform-level integrations:
//   - Courier fallback credentials (read from env vars by resolveCourierCreds)
//   - Shopify apps (5 separate apps configured via shopify.app.*.toml)
//
// Read-only. Never exposes secret values — only booleans like "configured: true".
// Gated to admin/super_admin roles.

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { adminAuth, adminApp } from '@/lib/firebaseAdmin';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EnvCheck {
    name: string;
    present: boolean;
}

interface CourierStatus {
    id: string;
    name: string;
    hasFallback: boolean;
    requiredEnv: EnvCheck[];
    missing: string[];
    tenantsConnected: number;
}

interface ShopifyAppStatus {
    id: string;
    handle: string;
    name: string;
    clientId: string;
    apiKeyEnv: string;
    apiSecretEnv: string;
    configured: boolean;
    applicationUrl?: string;
    scopes?: string;
    webhookCount?: number;
    storesInstalled?: number;
}

// Each courier has 1+ env vars. All must be set for `hasFallback` to be true.
// Ecom Express + Xpressbees have NO platform fallback by design — they always
// require the tenant to connect their own account.
const COURIERS: Array<{ id: string; name: string; envs: string[] }> = [
    {
        id: 'bluedart',
        name: 'Blue Dart',
        envs: [
            'NEXT_PUBLIC_BLUEDART_CLIENT_ID',
            'NEXT_PUBLIC_BLUEDART_LICENSE_KEY',
            'NEXT_PUBLIC_BLUEDART_LOGIN_ID',
            'NEXT_PUBLIC_BLUEDART_CUSTOMER_CODE',
        ],
    },
    {
        id: 'dtdc',
        name: 'DTDC',
        envs: ['NEXT_PUBLIC_DTDC_API_KEY', 'NEXT_PUBLIC_DTDC_CUSTOMER_CODE'],
    },
    {
        id: 'delhivery',
        name: 'Delhivery',
        envs: ['DELHIVERY_API_TOKEN'],
    },
    {
        id: 'ecom_express',
        name: 'Ecom Express',
        envs: [], // No platform fallback — tenant-only
    },
    {
        id: 'xpressbees',
        name: 'Xpressbees',
        envs: [], // No platform fallback — tenant-only
    },
];

// Maps the on-disk shopify.app.<handle>.toml files to the env-var names
// the runtime expects. Keep in sync with src/config/shopifyApps.ts and the
// webhook routes under /api/integrations/shopify*/.
const SHOPIFY_APPS: Array<{
    handle: string;
    tomlFile: string;
    apiKeyEnv: string;
    apiSecretEnv: string;
}> = [
    { handle: 'public', tomlFile: 'shopify.app.public.toml', apiKeyEnv: 'SHOPIFY_PUBLIC_API_KEY', apiSecretEnv: 'SHOPIFY_PUBLIC_API_SECRET' },
    { handle: 'client2', tomlFile: 'shopify.app.client2.toml', apiKeyEnv: 'SHOPIFY2_API_KEY', apiSecretEnv: 'SHOPIFY2_API_SECRET' },
    { handle: 'client3', tomlFile: 'shopify.app.client3.toml', apiKeyEnv: 'SHOPIFY3_API_KEY', apiSecretEnv: 'SHOPIFY3_API_SECRET' },
    { handle: 'looms', tomlFile: 'shopify.app.looms.toml', apiKeyEnv: 'SHOPIFY_LOOMS_API_KEY', apiSecretEnv: 'SHOPIFY_LOOMS_API_SECRET' },
    { handle: 'gayatri', tomlFile: 'shopify.app.gayatri.toml', apiKeyEnv: 'SHOPIFY_GAYATRI_API_KEY', apiSecretEnv: 'SHOPIFY_GAYATRI_API_SECRET' },
];

// Minimal TOML field extractor — we only need a handful of top-level keys.
// Using a full TOML parser would pull in a dependency for ~6 fields.
function readTomlField(content: string, key: string): string | undefined {
    const re = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm');
    const m = content.match(re);
    return m ? m[1] : undefined;
}

function countWebhookSubscriptions(content: string): number {
    return (content.match(/\[\[webhooks\.subscriptions\]\]/g) || []).length;
}

async function requireAdmin(req: NextRequest): Promise<{ uid: string } | NextResponse> {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Bearer token required' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length);
    try {
        const decoded = await adminAuth.verifyIdToken(token, true);
        const userSnap = await getFirestore(adminApp).doc(`users/${decoded.uid}`).get();
        const role = userSnap.data()?.role;
        if (role !== 'admin' && role !== 'super_admin') {
            return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
        }
        return { uid: decoded.uid };
    } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
}

export async function GET(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const db = getFirestore(adminApp);

    // --- Courier status --------------------------------------------------
    // Count tenants that have a connected integration per courier. One read
    // per courier — cheap, and we genuinely need the count.
    const courierStatuses: CourierStatus[] = await Promise.all(
        COURIERS.map(async (c) => {
            const requiredEnv: EnvCheck[] = c.envs.map((name) => ({
                name,
                present: !!process.env[name],
            }));
            const missing = requiredEnv.filter((e) => !e.present).map((e) => e.name);
            const hasFallback = c.envs.length > 0 && missing.length === 0;

            let tenantsConnected = 0;
            try {
                const snap = await db
                    .collection('clients')
                    .where(`courierIntegrations.${c.id}.status`, '==', 'connected')
                    .count()
                    .get();
                tenantsConnected = snap.data().count;
            } catch (err) {
                // Missing composite index is fine — fall back to 0 rather than 500ing the whole page.
                console.warn(`[admin/integrations/status] tenant count failed for ${c.id}`, err);
            }

            return {
                id: c.id,
                name: c.name,
                hasFallback,
                requiredEnv,
                missing,
                tenantsConnected,
            };
        })
    );

    // --- Shopify apps ----------------------------------------------------
    const shopifyAppStatuses: ShopifyAppStatus[] = await Promise.all(
        SHOPIFY_APPS.map(async (app) => {
            const tomlPath = path.join(process.cwd(), app.tomlFile);
            let clientId = '';
            let name = '';
            let applicationUrl: string | undefined;
            let scopes: string | undefined;
            let webhookCount = 0;
            try {
                const content = await fs.readFile(tomlPath, 'utf8');
                clientId = readTomlField(content, 'client_id') || '';
                name = readTomlField(content, 'name') || app.handle;
                applicationUrl = readTomlField(content, 'application_url');
                scopes = readTomlField(content, 'scopes');
                webhookCount = countWebhookSubscriptions(content);
            } catch (err) {
                console.warn(`[admin/integrations/status] toml read failed for ${app.handle}`, err);
                name = app.handle;
            }

            const apiKeyPresent = !!process.env[app.apiKeyEnv];
            const apiSecretPresent = !!process.env[app.apiSecretEnv];

            let storesInstalled = 0;
            try {
                const snap = await db
                    .collection('users')
                    .where('dedicatedShopifyApp', '==', app.handle)
                    .where('shopifyConfig.isConnected', '==', true)
                    .count()
                    .get();
                storesInstalled = snap.data().count;
            } catch {
                // ignore — index may not exist
            }

            return {
                id: app.handle,
                handle: app.handle,
                name,
                clientId,
                apiKeyEnv: app.apiKeyEnv,
                apiSecretEnv: app.apiSecretEnv,
                configured: apiKeyPresent && apiSecretPresent,
                applicationUrl,
                scopes,
                webhookCount,
                storesInstalled,
            };
        })
    );

    return NextResponse.json({
        couriers: courierStatuses,
        shopifyApps: shopifyAppStatuses,
        fetchedAt: new Date().toISOString(),
    });
}
