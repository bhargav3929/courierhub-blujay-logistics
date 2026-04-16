/**
 * GET /api/integrations/courier/list
 *
 * Returns the sanitized list of courier integrations for the authenticated
 * client. The credentials blob is NEVER sent to the frontend — only the
 * connection status + public metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';

import { adminApp, adminAuth } from '@/lib/firebaseAdmin';
import type { Client } from '@/types/types';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization') || '';
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

        const db = getFirestore(adminApp);
        const clientSnap = await db.doc(`clients/${uid}`).get();
        const client = clientSnap.exists ? (clientSnap.data() as Client) : null;
        const raw = client?.courierIntegrations || {};

        const sanitized = Object.entries(raw).map(([courierId, integration]) => ({
            courierId,
            status: integration?.status,
            connectedAt: integration?.connectedAt
                ? (integration.connectedAt as any).toMillis?.() ?? null
                : null,
            lastTestedAt: integration?.lastTestedAt
                ? (integration.lastTestedAt as any).toMillis?.() ?? null
                : null,
            lastErrorMessage: integration?.lastErrorMessage,
            publicMeta: integration?.publicMeta,
        }));

        return NextResponse.json({ integrations: sanitized });
    } catch (err: any) {
        console.error('[courier/list] error:', err);
        return NextResponse.json(
            { error: err?.message || 'Failed to list courier integrations' },
            { status: 500 }
        );
    }
}
