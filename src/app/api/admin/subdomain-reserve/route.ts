// POST /api/admin/subdomain-reserve
//
// Body: { tenantId: string, subdomain: string }
//
// Atomically reserves a subdomain for a freshly-created white-label tenant.
// Called from the admin "Create client" flow immediately after the client
// document is written. If the reserve fails (race with another admin, or
// validation), the admin UI is responsible for rolling back by deleting the
// orphaned client.
//
// Why this is a server route and not done client-side:
//   - reserveSubdomain() needs firebase-admin's transactional Firestore so
//     two parallel reserves of the same name can't both succeed.
//   - subdomainIndex is meant to be append-only-by-admin; client-side writes
//     would require relaxing rules, which is the wrong direction.
//
// Auth: Firebase Bearer token belonging to an admin / super_admin.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminApp } from '@/lib/firebaseAdmin';
import { getFirestore } from 'firebase-admin/firestore';
import { reserveSubdomain } from '@/services/server/subdomainResolver';

const bodySchema = z.object({
    tenantId: z.string().min(1).max(128),
    subdomain: z.string().min(3).max(32),
});

async function requireAdmin(req: NextRequest): Promise<{ uid: string } | NextResponse> {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length);
    let uid: string;
    try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
    } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    try {
        const db = getFirestore(adminApp);
        const snap = await db.collection('users').doc(uid).get();
        const role = snap.exists ? (snap.data()?.role as string | undefined) : undefined;
        if (role !== 'admin' && role !== 'super_admin') {
            return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
        }
        return { uid };
    } catch (err: any) {
        console.error('[subdomain-reserve] role lookup failed:', err?.message || err);
        return NextResponse.json({ error: 'Authorization error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request', details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    const subdomain = parsed.data.subdomain.toLowerCase().trim();

    // Verify the target tenant exists and is white_label before reserving —
    // we don't want subdomains attached to non-white-label clients (yet) or
    // pointing at a tenantId that doesn't exist.
    try {
        const db = getFirestore(adminApp);
        const clientSnap = await db.collection('clients').doc(parsed.data.tenantId).get();
        if (!clientSnap.exists) {
            return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
        }
        const clientType = clientSnap.data()?.type;
        if (clientType !== 'white_label') {
            return NextResponse.json(
                { error: 'Only white-label tenants can have subdomains' },
                { status: 400 }
            );
        }
    } catch (err: any) {
        console.error('[subdomain-reserve] tenant verify failed:', err?.message || err);
        return NextResponse.json({ error: 'Tenant verification failed' }, { status: 500 });
    }

    try {
        await reserveSubdomain({
            tenantId: parsed.data.tenantId,
            subdomain,
            tenantType: 'white_label',
        });
    } catch (err: any) {
        const msg = err?.message || 'Failed to reserve subdomain';
        // The most common path: race condition with another admin or a
        // pre-existing reservation. Return 409 so the UI can surface
        // "already taken" cleanly.
        const status = msg.includes('already taken') ? 409 : 400;
        return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json({ ok: true, subdomain });
}
