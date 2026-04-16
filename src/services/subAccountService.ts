// Sub-Account Service - CRUD operations for franchisee sub-accounts
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    Timestamp,
    query,
    where,
    getCountFromServer
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { Client, User, UserType } from '@/types/types';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const CLIENTS_COLLECTION = 'clients';
const USERS_COLLECTION = 'users';

/**
 * Create Firebase Auth user without logging out current user
 * (Uses secondary app instance)
 */
const createAuthUser = async (email: string, password: string): Promise<string> => {
    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const secondaryApp = initializeApp(firebaseConfig, `SubAccountApp_${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await signOut(secondaryAuth);
        return userCredential.user.uid;
    } catch (error: any) {
        // If email already exists, check if it's an orphan
        if (error.code === 'auth/email-already-in-use') {
            const users = await getDocs(
                query(collection(db, USERS_COLLECTION), where('email', '==', email))
            );
            if (users.empty) {
                // Orphaned auth account - delete via Admin SDK and retry
                await fetch('/api/admin/delete-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                // Retry with fresh app
                const retryApp = initializeApp(firebaseConfig, `SubAccountRetry_${Date.now()}`);
                const retryAuth = getAuth(retryApp);
                try {
                    const retryCredential = await createUserWithEmailAndPassword(retryAuth, email, password);
                    await signOut(retryAuth);
                    return retryCredential.user.uid;
                } finally {
                    await deleteApp(retryApp);
                }
            }
        }
        throw error;
    } finally {
        await deleteApp(secondaryApp);
    }
};

export interface SubAccountData {
    name: string;
    email: string;
    phone: string;
    marginType: 'flat' | 'percentage';
    marginValue: number;
    allowedCouriers: string[];
}

/**
 * Create a new sub-account for a franchisee owner
 * Creates Auth user + User doc + Client doc
 */
export const createSubAccount = async (
    parentId: string,
    data: SubAccountData,
    password: string
): Promise<Client> => {
    try {
        // Validate parent exists and is a primary user that supports sub-accounts
        const parentUserDoc = await getDoc(doc(db, USERS_COLLECTION, parentId));
        if (!parentUserDoc.exists()) {
            throw new Error('Parent user not found');
        }
        const parentUser = parentUserDoc.data() as User;
        if (parentUser.role !== 'franchise' && parentUser.role !== 'white_label') {
            throw new Error('Only franchise or white-label owners can create sub-accounts');
        }
        if (parentUser.userType === 'sub_user') {
            throw new Error('Sub-accounts cannot create their own sub-accounts');
        }

        // Get parent client for default values
        const parentClientDoc = await getDoc(doc(db, CLIENTS_COLLECTION, parentId));
        const parentClient = parentClientDoc.exists() ? parentClientDoc.data() as Client : null;

        // Validate allowed couriers are subset of parent's
        if (parentClient && data.allowedCouriers.length > 0) {
            const invalidCouriers = data.allowedCouriers.filter(
                c => !parentClient.allowedCouriers.includes(c)
            );
            if (invalidCouriers.length > 0) {
                throw new Error(`Invalid couriers: ${invalidCouriers.join(', ')}. Must be subset of parent's allowed couriers.`);
            }
        }

        // 1. Create Firebase Auth user
        const uid = await createAuthUser(data.email, password);
        const timestamp = Timestamp.now();

        // Sub-account inherits parent's role/type so it sees the same portal flavor
        const childRole = parentUser.role; // 'franchise' | 'white_label'
        const childType = childRole as 'franchise' | 'white_label';

        // 2. Create User document
        const userDoc: Partial<User> = {
            email: data.email,
            name: data.name,
            role: childRole,
            phone: data.phone,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
            clientId: uid,
            userType: 'sub_user',
            parentId: parentId
        };
        await setDoc(doc(db, USERS_COLLECTION, uid), userDoc);

        // 3. Create Client document
        const clientDoc: Client = {
            id: uid,
            name: data.name,
            email: data.email,
            phone: data.phone,
            type: childType,
            status: 'active',
            marginType: data.marginType,
            marginValue: data.marginValue,
            allowedCouriers: data.allowedCouriers.length > 0
                ? data.allowedCouriers
                : (parentClient?.allowedCouriers || []),
            walletBalance: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
            userType: 'sub_user',
            parentId: parentId
        };
        await setDoc(doc(db, CLIENTS_COLLECTION, uid), clientDoc);

        return clientDoc;
    } catch (error: any) {
        console.error('Error creating sub-account:', error);
        throw new Error(error.message || 'Failed to create sub-account');
    }
};

/**
 * Get all sub-accounts for a franchisee owner
 */
export const getSubAccountsByParent = async (parentId: string): Promise<Client[]> => {
    try {
        const q = query(
            collection(db, CLIENTS_COLLECTION),
            where('parentId', '==', parentId),
            where('userType', '==', 'sub_user')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Client));
    } catch (error) {
        console.error('Error getting sub-accounts:', error);
        throw new Error('Failed to fetch sub-accounts');
    }
};

/**
 * Get just the IDs of sub-accounts (for shipment queries)
 */
export const getSubAccountIds = async (parentId: string): Promise<string[]> => {
    try {
        const subAccounts = await getSubAccountsByParent(parentId);
        return subAccounts.map(sa => sa.id);
    } catch (error) {
        console.error('Error getting sub-account IDs:', error);
        return [];
    }
};

/**
 * Get sub-account count for a franchisee owner
 */
export const getSubAccountCount = async (parentId: string): Promise<number> => {
    try {
        const q = query(
            collection(db, CLIENTS_COLLECTION),
            where('parentId', '==', parentId),
            where('userType', '==', 'sub_user')
        );
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    } catch (error) {
        console.error('Error getting sub-account count:', error);
        return 0;
    }
};

/**
 * Get active sub-account count for a franchisee owner
 */
export const getActiveSubAccountCount = async (parentId: string): Promise<number> => {
    try {
        const q = query(
            collection(db, CLIENTS_COLLECTION),
            where('parentId', '==', parentId),
            where('userType', '==', 'sub_user'),
            where('status', '==', 'active')
        );
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    } catch (error) {
        console.error('Error getting active sub-account count:', error);
        return 0;
    }
};

/**
 * Get a single sub-account by ID
 * Verifies it belongs to the parent
 */
export const getSubAccountById = async (
    subAccountId: string,
    parentId: string
): Promise<Client | null> => {
    try {
        const clientDoc = await getDoc(doc(db, CLIENTS_COLLECTION, subAccountId));
        if (!clientDoc.exists()) {
            return null;
        }
        const client = { id: clientDoc.id, ...clientDoc.data() } as Client;

        // Verify parent ownership
        if (client.parentId !== parentId || client.userType !== 'sub_user') {
            return null;
        }

        return client;
    } catch (error) {
        console.error('Error getting sub-account:', error);
        throw new Error('Failed to fetch sub-account');
    }
};

/**
 * Update a sub-account
 */
export const updateSubAccount = async (
    subAccountId: string,
    parentId: string,
    updates: Partial<SubAccountData>
): Promise<void> => {
    try {
        // Verify ownership
        const existing = await getSubAccountById(subAccountId, parentId);
        if (!existing) {
            throw new Error('Sub-account not found or access denied');
        }

        // If updating couriers, validate against parent
        if (updates.allowedCouriers && updates.allowedCouriers.length > 0) {
            const parentClientDoc = await getDoc(doc(db, CLIENTS_COLLECTION, parentId));
            if (parentClientDoc.exists()) {
                const parentClient = parentClientDoc.data() as Client;
                const invalidCouriers = updates.allowedCouriers.filter(
                    c => !parentClient.allowedCouriers.includes(c)
                );
                if (invalidCouriers.length > 0) {
                    throw new Error(`Invalid couriers: ${invalidCouriers.join(', ')}`);
                }
            }
        }

        const timestamp = Timestamp.now();

        // Update both User and Client docs
        const updateData = {
            ...updates,
            updatedAt: timestamp
        };

        await Promise.all([
            updateDoc(doc(db, CLIENTS_COLLECTION, subAccountId), updateData),
            updateDoc(doc(db, USERS_COLLECTION, subAccountId), {
                name: updates.name,
                phone: updates.phone,
                updatedAt: timestamp
            })
        ]);
    } catch (error: any) {
        console.error('Error updating sub-account:', error);
        throw new Error(error.message || 'Failed to update sub-account');
    }
};

/**
 * Toggle sub-account status (active/inactive)
 */
export const toggleSubAccountStatus = async (
    subAccountId: string,
    parentId: string,
    status: 'active' | 'inactive'
): Promise<void> => {
    try {
        // Verify ownership
        const existing = await getSubAccountById(subAccountId, parentId);
        if (!existing) {
            throw new Error('Sub-account not found or access denied');
        }

        const timestamp = Timestamp.now();

        // Update both collections
        await Promise.all([
            updateDoc(doc(db, CLIENTS_COLLECTION, subAccountId), {
                status,
                updatedAt: timestamp
            }),
            updateDoc(doc(db, USERS_COLLECTION, subAccountId), {
                isActive: status === 'active',
                updatedAt: timestamp
            })
        ]);
    } catch (error: any) {
        console.error('Error toggling sub-account status:', error);
        throw new Error(error.message || 'Failed to update sub-account status');
    }
};

/**
 * Delete a sub-account
 * Removes Auth account + User doc + Client doc
 */
export const deleteSubAccount = async (
    subAccountId: string,
    parentId: string
): Promise<void> => {
    try {
        // Verify ownership
        const existing = await getSubAccountById(subAccountId, parentId);
        if (!existing) {
            throw new Error('Sub-account not found or access denied');
        }

        // Delete Firebase Auth account via Admin SDK
        const res = await fetch('/api/admin/delete-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: subAccountId }),
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to delete auth account');
        }

        // Delete from both Firestore collections
        await Promise.all([
            deleteDoc(doc(db, CLIENTS_COLLECTION, subAccountId)),
            deleteDoc(doc(db, USERS_COLLECTION, subAccountId))
        ]);
    } catch (error: any) {
        console.error('Error deleting sub-account:', error);
        throw new Error(error.message || 'Failed to delete sub-account');
    }
};
