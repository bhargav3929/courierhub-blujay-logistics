// User Service - CRUD operations for admin users
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    Timestamp,
    query,
    where
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '@/lib/firebaseConfig';
import { User, UserRole } from '@/types/types';

const USERS_COLLECTION = 'users';

/**
 * Create a new admin user
 */
export const createUser = async (userData: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    phone?: string;
}): Promise<User> => {
    try {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
            throw new Error('Invalid email format');
        }

        // Validate password strength (minimum 6 characters as per Firebase requirement)
        if (userData.password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }

        // Check if user already exists
        const existingUsersQuery = query(
            collection(db, USERS_COLLECTION),
            where('email', '==', userData.email)
        );
        const existingUsers = await getDocs(existingUsersQuery);

        if (!existingUsers.empty) {
            throw new Error('A user with this email already exists');
        }

        // Create auth user
        const userCredential = await createUserWithEmailAndPassword(
            auth,
            userData.email,
            userData.password
        );

        // Create user document in Firestore using setDoc (not updateDoc!)
        const userDoc = {
            email: userData.email,
            name: userData.name,
            role: userData.role || 'admin',
            phone: userData.phone || '',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            isActive: true
        };

        // CRITICAL FIX: Use setDoc instead of updateDoc for new documents
        await setDoc(doc(db, USERS_COLLECTION, userCredential.user.uid), userDoc);

        return {
            id: userCredential.user.uid,
            ...userDoc
        } as User;
    } catch (error: any) {
        console.error('Error creating user:', error);

        // Provide user-friendly error messages
        if (error.code === 'auth/email-already-in-use') {
            throw new Error('This email is already registered');
        } else if (error.code === 'auth/weak-password') {
            throw new Error('Password is too weak. Please use a stronger password');
        } else if (error.code === 'auth/invalid-email') {
            throw new Error('Invalid email address');
        }

        throw new Error(error.message || 'Failed to create user');
    }
};

/**
 * Get user by ID
 */
export const getUser = async (userId: string): Promise<User | null> => {
    try {
        const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
        if (userDoc.exists()) {
            return { id: userDoc.id, ...userDoc.data() } as User;
        }
        return null;
    } catch (error) {
        console.error('Error getting user:', error);
        throw new Error('Failed to fetch user');
    }
};

/**
 * Get all users
 */
export const getAllUsers = async (): Promise<User[]> => {
    try {
        const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
        return usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as User));
    } catch (error) {
        console.error('Error getting all users:', error);
        throw new Error('Failed to fetch users');
    }
};

/**
 * Update user
 */
export const updateUser = async (
    userId: string,
    updates: Partial<Omit<User, 'id' | 'createdAt'>>
): Promise<void> => {
    try {
        await updateDoc(doc(db, USERS_COLLECTION, userId), {
            ...updates,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating user:', error);
        throw new Error('Failed to update user');
    }
};

/**
 * Delete user
 */
export const deleteUser = async (userId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, USERS_COLLECTION, userId));
    } catch (error) {
        console.error('Error deleting user:', error);
        throw new Error('Failed to delete user');
    }
};

/**
 * Toggle user active status
 */
export const toggleUserStatus = async (userId: string, isActive: boolean): Promise<void> => {
    try {
        await updateDoc(doc(db, USERS_COLLECTION, userId), {
            isActive,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error toggling user status:', error);
        throw new Error('Failed to update user status');
    }
};
