// Courier API Service - Manage courier configurations and API credentials
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    Timestamp,
    query,
    where
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { CourierAPI } from '@/types/types';

const COURIERS_COLLECTION = 'courierAPIs';

/**
 * Add a new courier API configuration
 */
export const addCourierAPI = async (courierData: Omit<CourierAPI, 'id' | 'createdAt' | 'updatedAt'>): Promise<CourierAPI> => {
    try {
        const newCourier = {
            ...courierData,
            isConnected: !!(courierData.apiKey && courierData.apiSecret),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        const docRef = await addDoc(collection(db, COURIERS_COLLECTION), newCourier);

        return {
            id: docRef.id,
            ...newCourier
        } as CourierAPI;
    } catch (error: any) {
        console.error('Error adding courier API:', error);
        throw new Error(error.message || 'Failed to add courier API');
    }
};

/**
 * Get courier by ID
 */
export const getCourierById = async (courierId: string): Promise<CourierAPI | null> => {
    try {
        const courierDoc = await getDoc(doc(db, COURIERS_COLLECTION, courierId));
        if (courierDoc.exists()) {
            return { id: courierDoc.id, ...courierDoc.data() } as CourierAPI;
        }
        return null;
    } catch (error) {
        console.error('Error getting courier:', error);
        throw new Error('Failed to fetch courier');
    }
};

/**
 * Get all couriers
 */
export const getAllCouriers = async (): Promise<CourierAPI[]> => {
    try {
        const querySnapshot = await getDocs(collection(db, COURIERS_COLLECTION));
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as CourierAPI));
    } catch (error) {
        console.error('Error getting couriers:', error);
        throw new Error('Failed to fetch couriers');
    }
};

/**
 * Get active couriers
 */
export const getActiveCouriers = async (): Promise<CourierAPI[]> => {
    try {
        const q = query(
            collection(db, COURIERS_COLLECTION),
            where('status', '==', 'active')
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as CourierAPI));
    } catch (error) {
        console.error('Error getting active couriers:', error);
        throw new Error('Failed to fetch active couriers');
    }
};

/**
 * Update courier API
 */
export const updateCourierAPI = async (
    courierId: string,
    updates: Partial<Omit<CourierAPI, 'id' | 'createdAt'>>
): Promise<void> => {
    try {
        await updateDoc(doc(db, COURIERS_COLLECTION, courierId), {
            ...updates,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating courier API:', error);
        throw new Error('Failed to update courier API');
    }
};

/**
 * Toggle courier status
 */
export const toggleCourierStatus = async (
    courierId: string,
    status: 'active' | 'inactive'
): Promise<void> => {
    try {
        await updateDoc(doc(db, COURIERS_COLLECTION, courierId), {
            status,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error toggling courier status:', error);
        throw new Error('Failed to update courier status');
    }
};

/**
 * Update last sync timestamp
 */
export const updateLastSync = async (courierId: string): Promise<void> => {
    try {
        await updateDoc(doc(db, COURIERS_COLLECTION, courierId), {
            lastSync: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating last sync:', error);
        throw new Error('Failed to update last sync');
    }
};

/**
 * Delete courier
 */
export const deleteCourier = async (courierId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, COURIERS_COLLECTION, courierId));
    } catch (error) {
        console.error('Error deleting courier:', error);
        throw new Error('Failed to delete courier');
    }
};
