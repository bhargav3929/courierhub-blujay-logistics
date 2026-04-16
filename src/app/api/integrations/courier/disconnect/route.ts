/**
 * POST /api/integrations/courier/disconnect
 *
 * Body: { courierId: CourierId }
 *
 * Deletes the stored integration for the authenticated client. Also removes
 * the courier name from `allowedCouriers` if the client has no other source
 * for it — for safety we leave allowedCouriers alone (the admin can still
 * have granted it).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminApp, adminAuth } from '@/lib/firebaseAdmin';
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
        if (!courierId || !ALL_COURIER_IDS.includes(courierId)) {
            return NextResponse.json({ error: 'Unknown courierId' }, { status: 400 });
        }

        const db = getFirestore(adminApp);
        const clientRef = db.doc(`clients/${uid}`);

        await clientRef.set(
            {
                courierIntegrations: { [courierId]: FieldValue.delete() },
                updatedAt: Timestamp.now(),
            },
            { merge: true }
        );

        return NextResponse.json({ ok: true, courierId });
    } catch (err: any) {
        console.error('[courier/disconnect] error:', err);
        return NextResponse.json(
            { error: err?.message || 'Failed to disconnect courier' },
            { status: 500 }
        );
    }
}
