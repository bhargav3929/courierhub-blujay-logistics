import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import {
    getSubAccountById,
    toggleSubAccountStatus
} from '@/services/subAccountService';
import { db } from '@/lib/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { User } from '@/types/types';

/**
 * POST /api/sub-accounts/toggle-status
 * Enable or disable a sub-account
 */
export async function POST(request: NextRequest) {
    try {
        // Get auth token from header
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];

        // Verify token with Firebase Admin
        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(token);
        } catch (error) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const userId = decodedToken.uid;

        // Verify user is a primary franchise user
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const user = userDoc.data() as User;
        if (user.role !== 'franchise') {
            return NextResponse.json({ error: 'Only franchise owners can manage sub-accounts' }, { status: 403 });
        }
        if (user.userType === 'sub_user') {
            return NextResponse.json({ error: 'Sub-accounts cannot manage sub-accounts' }, { status: 403 });
        }

        // Parse request body
        const body = await request.json();
        const { subAccountId, status } = body;

        if (!subAccountId) {
            return NextResponse.json({ error: 'Sub-account ID is required' }, { status: 400 });
        }

        if (status !== 'active' && status !== 'inactive') {
            return NextResponse.json({ error: 'Status must be "active" or "inactive"' }, { status: 400 });
        }

        // Verify sub-account exists and belongs to this user
        const subAccount = await getSubAccountById(subAccountId, userId);
        if (!subAccount) {
            return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
        }

        // Toggle status
        await toggleSubAccountStatus(subAccountId, userId, status);

        // Fetch updated sub-account
        const updatedSubAccount = await getSubAccountById(subAccountId, userId);

        return NextResponse.json({
            success: true,
            subAccount: updatedSubAccount,
            message: `Sub-account ${status === 'active' ? 'enabled' : 'disabled'} successfully`
        });
    } catch (error: any) {
        console.error('Error toggling sub-account status:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update sub-account status' },
            { status: 500 }
        );
    }
}
