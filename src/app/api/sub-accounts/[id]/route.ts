import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import {
    getSubAccountById,
    updateSubAccount,
    deleteSubAccount
} from '@/services/subAccountService';
import { db } from '@/lib/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { User } from '@/types/types';

/**
 * Verify user is a primary franchise owner
 */
async function verifyFranchiseOwner(request: NextRequest): Promise<{ userId: string } | NextResponse> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];

    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(token);
    } catch (error) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userDoc.data() as User;
    if (user.role !== 'franchise') {
        return NextResponse.json({ error: 'Only franchise owners can access sub-accounts' }, { status: 403 });
    }
    if (user.userType === 'sub_user') {
        return NextResponse.json({ error: 'Sub-accounts cannot manage sub-accounts' }, { status: 403 });
    }

    return { userId };
}

/**
 * GET /api/sub-accounts/[id]
 * Get a single sub-account by ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: subAccountId } = await params;
        const authResult = await verifyFranchiseOwner(request);

        if (authResult instanceof NextResponse) {
            return authResult;
        }

        const { userId } = authResult;

        const subAccount = await getSubAccountById(subAccountId, userId);
        if (!subAccount) {
            return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
        }

        return NextResponse.json({ subAccount });
    } catch (error: any) {
        console.error('Error fetching sub-account:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch sub-account' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/sub-accounts/[id]
 * Update a sub-account
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: subAccountId } = await params;
        const authResult = await verifyFranchiseOwner(request);

        if (authResult instanceof NextResponse) {
            return authResult;
        }

        const { userId } = authResult;

        // Parse request body
        const body = await request.json();
        const { name, phone, marginType, marginValue, allowedCouriers } = body;

        // Build updates object (only include provided fields)
        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name.trim();
        if (phone !== undefined) updates.phone = phone.trim();
        if (marginType !== undefined) updates.marginType = marginType;
        if (marginValue !== undefined) updates.marginValue = marginValue;
        if (allowedCouriers !== undefined) updates.allowedCouriers = allowedCouriers;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        await updateSubAccount(subAccountId, userId, updates);

        // Fetch updated sub-account
        const updatedSubAccount = await getSubAccountById(subAccountId, userId);

        return NextResponse.json({ subAccount: updatedSubAccount });
    } catch (error: any) {
        console.error('Error updating sub-account:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update sub-account' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/sub-accounts/[id]
 * Delete a sub-account (Auth + Firestore)
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: subAccountId } = await params;
        const authResult = await verifyFranchiseOwner(request);

        if (authResult instanceof NextResponse) {
            return authResult;
        }

        const { userId } = authResult;

        // Verify sub-account exists before deleting
        const subAccount = await getSubAccountById(subAccountId, userId);
        if (!subAccount) {
            return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 });
        }

        await deleteSubAccount(subAccountId, userId);

        return NextResponse.json({ success: true, message: 'Sub-account deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting sub-account:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete sub-account' },
            { status: 500 }
        );
    }
}
