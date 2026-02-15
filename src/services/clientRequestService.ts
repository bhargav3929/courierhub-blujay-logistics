// Client Request Service - Self-registration applications from prospective clients
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    Timestamp,
    query,
    where,
    orderBy,
    getCountFromServer
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { ClientRequest } from '@/types/types';
const CLIENT_REQUESTS_COLLECTION = 'clientRequests';

/**
 * Submit a new client request (self-registration)
 * Checks for existing pending request with the same email to prevent duplicates
 */
export const submitClientRequest = async (
    data: Omit<ClientRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<ClientRequest> => {
    try {
        // Check for existing pending request with the same email
        const existingQuery = query(
            collection(db, CLIENT_REQUESTS_COLLECTION),
            where('email', '==', data.email),
            where('status', '==', 'pending')
        );
        const existing = await getDocs(existingQuery);
        if (!existing.empty) {
            throw new Error('A request with this email is already pending review');
        }

        const timestamp = Timestamp.now();
        const requestData = {
            ...data,
            status: 'pending' as const,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const docRef = await addDoc(collection(db, CLIENT_REQUESTS_COLLECTION), requestData);

        return { id: docRef.id, ...requestData };
    } catch (error: any) {
        console.error('Error submitting client request:', error);
        throw new Error(error.message || 'Failed to submit client request');
    }
};

/**
 * Get all client requests with optional status filter
 */
export const getAllClientRequests = async (
    filters?: { status?: ClientRequest['status'] }
): Promise<ClientRequest[]> => {
    try {
        let q = query(
            collection(db, CLIENT_REQUESTS_COLLECTION),
            orderBy('createdAt', 'desc')
        );

        if (filters?.status) {
            q = query(
                collection(db, CLIENT_REQUESTS_COLLECTION),
                where('status', '==', filters.status),
                orderBy('createdAt', 'desc')
            );
        }

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        } as ClientRequest));
    } catch (error: any) {
        console.error('Error getting client requests:', error);
        throw new Error('Failed to fetch client requests');
    }
};

/**
 * Get a single client request by ID
 */
export const getClientRequestById = async (id: string): Promise<ClientRequest | null> => {
    try {
        const docSnap = await getDoc(doc(db, CLIENT_REQUESTS_COLLECTION, id));
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as ClientRequest;
        }
        return null;
    } catch (error) {
        console.error('Error getting client request:', error);
        throw new Error('Failed to fetch client request');
    }
};

/**
 * Get count of pending requests (for admin badge)
 */
export const getPendingRequestsCount = async (): Promise<number> => {
    try {
        const q = query(
            collection(db, CLIENT_REQUESTS_COLLECTION),
            where('status', '==', 'pending')
        );
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    } catch (error) {
        console.error('Error getting pending requests count:', error);
        return 0;
    }
};

/**
 * Mark a client request as accepted.
 * The actual client account creation is handled separately by the admin
 * through the Add Client form (using addClient from clientService).
 */
export const acceptClientRequest = async (id: string): Promise<void> => {
    try {
        const request = await getClientRequestById(id);
        if (!request) throw new Error('Client request not found');
        if (request.status !== 'pending') throw new Error('Request is not pending');

        await updateDoc(doc(db, CLIENT_REQUESTS_COLLECTION, id), {
            status: 'accepted',
            updatedAt: Timestamp.now(),
        });
    } catch (error: any) {
        console.error('Error accepting client request:', error);
        throw new Error(error.message || 'Failed to accept client request');
    }
};

/**
 * Reject a client request
 */
export const rejectClientRequest = async (id: string): Promise<void> => {
    try {
        const request = await getClientRequestById(id);
        if (!request) throw new Error('Client request not found');
        if (request.status !== 'pending') throw new Error('Request is not pending');

        await updateDoc(doc(db, CLIENT_REQUESTS_COLLECTION, id), {
            status: 'rejected',
            updatedAt: Timestamp.now(),
        });
    } catch (error: any) {
        console.error('Error rejecting client request:', error);
        throw new Error(error.message || 'Failed to reject client request');
    }
};
