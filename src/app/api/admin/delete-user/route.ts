import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export async function POST(request: NextRequest) {
    try {
        const { userId, email } = await request.json();

        if (!userId && !email) {
            return NextResponse.json(
                { error: 'userId or email is required' },
                { status: 400 }
            );
        }

        let uid = userId;

        // If email provided instead of userId, look up the UID first
        if (!uid && email) {
            const userRecord = await adminAuth.getUserByEmail(email);
            uid = userRecord.uid;
        }

        await adminAuth.deleteUser(uid);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        // If user doesn't exist in Auth, that's fine — still a success
        if (error.code === 'auth/user-not-found') {
            return NextResponse.json({ success: true });
        }

        console.error('Error deleting auth user:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete auth user' },
            { status: 500 }
        );
    }
}
