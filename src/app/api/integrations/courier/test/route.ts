/**
 * POST /api/integrations/courier/test
 *
 * Body: { courierId: CourierId }
 *
 * Re-validates the stored credentials for a courier. Useful when the user
 * clicks "Test connection" on an already-connected courier.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { adminApp, adminAuth } from '@/lib/firebaseAdmin';
import { decryptCredsObject } from '@/lib/courierCredCrypto';
import { COURIER_TEST_HANDLERS } from '@/services/server/courierConnectHandlers';
import type { Client, CourierId, CourierIntegration } from '@/types/types';

const ALL_COURIER_IDS: CourierId[] = ['bluedart', 'dtdc', 'delhivery', 'ecom_express', 'xpressbees'];

export async function POST(request: NextRequest) {
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

        const body = await request.json().catch(() => ({}));
        const courierId = body.courierId as CourierId;
        if (!courierId || !ALL_COURIER_IDS.includes(courierId)) {
            return NextResponse.json({ error: 'Unknown courierId' }, { status: 400 });
        }

        const db = getFirestore(adminApp);
        const clientSnap = await db.doc(`clients/${uid}`).get();
        if (!clientSnap.exists) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }
        const client = clientSnap.data() as Client;
        const integration = client.courierIntegrations?.[courierId] as CourierIntegration | undefined;
        if (!integration) {
            return NextResponse.json({ error: 'Not connected' }, { status: 404 });
        }

        let creds: Record<string, string>;
        try {
            creds = decryptCredsObject<Record<string, string>>(integration.credentials);
        } catch {
            return NextResponse.json(
                { error: 'Stored credentials could not be read — please reconnect.' },
                { status: 500 }
            );
        }

        const handler = COURIER_TEST_HANDLERS[courierId];
        const result = await handler(creds);
        const now = Timestamp.now();

        // Persist the outcome
        if (result.ok) {
            await db.doc(`clients/${uid}`).set(
                {
                    courierIntegrations: {
                        [courierId]: {
                            status: 'connected',
                            lastTestedAt: now,
                            lastErrorMessage: null,
                            updatedAt: now,
                        },
                    },
                    updatedAt: now,
                },
                { merge: true }
            );
        } else {
            await db.doc(`clients/${uid}`).set(
                {
                    courierIntegrations: {
                        [courierId]: {
                            status: 'error',
                            lastTestedAt: now,
                            lastErrorMessage: result.error || 'Unknown error',
                            updatedAt: now,
                        },
                    },
                    updatedAt: now,
                },
                { merge: true }
            );
        }

        return NextResponse.json({
            ok: result.ok,
            error: result.error,
            accountIdentifier: result.accountIdentifier,
            warnings: result.warnings,
        });
    } catch (err: any) {
        console.error('[courier/test] error:', err);
        return NextResponse.json(
            { error: err?.message || 'Failed to test connection' },
            { status: 500 }
        );
    }
}
