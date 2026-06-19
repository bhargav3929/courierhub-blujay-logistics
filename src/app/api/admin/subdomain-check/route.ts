// POST /api/admin/subdomain-check
//
// Live availability check called from the super-admin "Create client" form as
// the admin types a subdomain. Returns one of:
//   { available: true }
//   { available: false, reason: 'invalid' | 'taken' | 'reserved', message?: string }
//
// Auth: requires a Firebase Bearer token belonging to an admin / super_admin.
// We don't reuse authenticateRequest() here because it returns clientId for
// the standard client portal; admin checks need a different role test.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, adminApp } from '@/lib/firebaseAdmin';
import { getFirestore } from 'firebase-admin/firestore';
import { checkSubdomainAvailability } from '@/services/server/subdomainResolver';

const bodySchema = z.object({
    value: z.string().min(1).max(64),
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
    // Look up the user's role in Firestore. The `users` collection is the
    // source of truth for role assignments.
    try {
        const db = getFirestore(adminApp);
        const snap = await db.collection('users').doc(uid).get();
        const role = snap.exists ? (snap.data()?.role as string | undefined) : undefined;
        if (role !== 'admin' && role !== 'super_admin') {
            return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
        }
        return { uid };
    } catch (err: any) {
        console.error('[subdomain-check] role lookup failed:', err?.message || err);
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

    try {
        const result = await checkSubdomainAvailability(parsed.data.value.trim().toLowerCase());
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('[subdomain-check] lookup failed:', err?.message || err);
        return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
}
