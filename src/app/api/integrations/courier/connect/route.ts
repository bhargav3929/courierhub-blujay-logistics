/**
 * POST /api/integrations/courier/connect
 *
 * Body: { courierId: CourierId, credentials: Record<string, string> }
 *
 * 1. Authenticates the caller via Firebase ID token in `Authorization: Bearer`
 * 2. Looks up the courier's connect handler → validates credentials against
 *    the real courier API
 * 3. Encrypts the credentials and stores them on the client doc under
 *    `courierIntegrations.{courierId}`
 *
 * The response either echoes `{ ok: true, integration: publicMeta }` or
 * `{ ok: false, error }`. We never echo the plaintext credentials back.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminApp, adminAuth } from '@/lib/firebaseAdmin';
import { encryptCredsObject } from '@/lib/courierCredCrypto';
import { COURIER_TEST_HANDLERS } from '@/services/server/courierConnectHandlers';
import { getCourierById } from '@/config/courierRegistry';
import type { CourierId } from '@/types/types';

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
        const credentials = body.credentials as Record<string, string> | undefined;

        if (!courierId || !ALL_COURIER_IDS.includes(courierId)) {
            return NextResponse.json({ error: 'Unknown courierId' }, { status: 400 });
        }
        if (!credentials || typeof credentials !== 'object') {
            return NextResponse.json({ error: 'credentials object is required' }, { status: 400 });
        }

        const registryEntry = getCourierById(courierId);
        if (!registryEntry) {
            return NextResponse.json({ error: 'Courier not registered' }, { status: 400 });
        }
        if (registryEntry.status === 'coming_soon') {
            return NextResponse.json(
                { error: `${registryEntry.name} integration is not yet open for self-serve connection.` },
                { status: 400 }
            );
        }

        // Validate required fields from registry
        for (const field of registryEntry.fields) {
            if (field.required && !credentials[field.key]) {
                return NextResponse.json(
                    { error: `${field.label} is required.` },
                    { status: 400 }
                );
            }
        }

        // Ping the courier
        const handler = COURIER_TEST_HANDLERS[courierId];
        const testResult = await handler(credentials);
        if (!testResult.ok) {
            return NextResponse.json(
                { error: testResult.error || 'Credentials rejected by courier' },
                { status: 400 }
            );
        }

        // Encrypt + store
        const encrypted = encryptCredsObject(credentials);
        const now = Timestamp.now();

        // Note: `integration` uses admin-SDK Timestamps, which are structurally
        // compatible with the client-SDK Timestamp type on the read path but
        // the compiler can't prove it. Stored as-is; reads in the browser work
        // because both SDKs serialize to the same wire format.
        const integration = {
            courierId,
            status: 'connected' as const,
            credentials: encrypted,
            connectedAt: now,
            updatedAt: now,
            lastTestedAt: now,
            publicMeta: {
                label: registryEntry.name,
                environment: (credentials.environment as 'sandbox' | 'production') || 'production',
                accountIdentifier: testResult.accountIdentifier,
            },
        };

        const db = getFirestore(adminApp);
        await db.doc(`clients/${uid}`).set(
            {
                courierIntegrations: { [courierId]: integration },
                allowedCouriers: FieldValue.arrayUnion(registryEntry.name),
                updatedAt: now,
            },
            { merge: true }
        );

        return NextResponse.json({
            ok: true,
            integration: {
                courierId,
                status: integration.status,
                connectedAt: integration.connectedAt.toMillis(),
                publicMeta: integration.publicMeta,
                warnings: testResult.warnings,
            },
        });
    } catch (err: any) {
        console.error('[courier/connect] error:', err);
        return NextResponse.json(
            { error: err?.message || 'Failed to connect courier' },
            { status: 500 }
        );
    }
}
