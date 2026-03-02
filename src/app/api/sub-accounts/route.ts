import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import {
    createSubAccount,
    getSubAccountsByParent,
    getSubAccountCount,
    getActiveSubAccountCount
} from '@/services/subAccountService';
import { db } from '@/lib/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { User } from '@/types/types';

/**
 * GET /api/sub-accounts
 * List all sub-accounts for the authenticated franchisee owner
 */
export async function GET(request: NextRequest) {
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
            return NextResponse.json({ error: 'Only franchise owners can access sub-accounts' }, { status: 403 });
        }
        if (user.userType === 'sub_user') {
            return NextResponse.json({ error: 'Sub-accounts cannot manage sub-accounts' }, { status: 403 });
        }

        // Get sub-accounts
        const subAccounts = await getSubAccountsByParent(userId);
        const totalCount = await getSubAccountCount(userId);
        const activeCount = await getActiveSubAccountCount(userId);

        return NextResponse.json({
            subAccounts,
            stats: {
                total: totalCount,
                active: activeCount,
                inactive: totalCount - activeCount
            }
        });
    } catch (error: any) {
        console.error('Error fetching sub-accounts:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch sub-accounts' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/sub-accounts
 * Create a new sub-account
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
            return NextResponse.json({ error: 'Only franchise owners can create sub-accounts' }, { status: 403 });
        }
        if (user.userType === 'sub_user') {
            return NextResponse.json({ error: 'Sub-accounts cannot create sub-accounts' }, { status: 403 });
        }

        // Parse request body
        const body = await request.json();
        const { name, email, phone, password, marginType, marginValue, allowedCouriers } = body;

        // Validate required fields
        if (!name || !email || !phone || !password) {
            return NextResponse.json(
                { error: 'Name, email, phone, and password are required' },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters' },
                { status: 400 }
            );
        }

        // Create sub-account
        const subAccount = await createSubAccount(userId, {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            marginType: marginType || 'flat',
            marginValue: marginValue || 0,
            allowedCouriers: allowedCouriers || []
        }, password);

        return NextResponse.json({ subAccount }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating sub-account:', error);

        // Handle specific Firebase Auth errors
        if (error.code === 'auth/email-already-in-use') {
            return NextResponse.json(
                { error: 'Email is already registered' },
                { status: 400 }
            );
        }
        if (error.code === 'auth/invalid-email') {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Failed to create sub-account' },
            { status: 500 }
        );
    }
}
