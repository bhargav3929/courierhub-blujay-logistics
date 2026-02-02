// Shipment Service - CRUD operations for shipments
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
    where,
    orderBy,
    limit as firestoreLimit
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { Shipment, ShipmentFilters } from '@/types/types';

const SHIPMENTS_COLLECTION = 'shipments';

/**
 * Create a new shipment
 */
export const createShipment = async (shipmentData: Omit<Shipment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Shipment> => {
    try {
        const newShipment = {
            ...shipmentData,
            status: shipmentData.status || 'pending',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };

        const docRef = await addDoc(collection(db, SHIPMENTS_COLLECTION), newShipment);

        return {
            id: docRef.id,
            ...newShipment
        } as Shipment;
    } catch (error: any) {
        console.error('Error creating shipment:', error);
        throw new Error(error.message || 'Failed to create shipment');
    }
};

/**
 * Get shipment by ID
 */
export const getShipmentById = async (shipmentId: string): Promise<Shipment | null> => {
    try {
        const shipmentDoc = await getDoc(doc(db, SHIPMENTS_COLLECTION, shipmentId));
        if (shipmentDoc.exists()) {
            return { id: shipmentDoc.id, ...shipmentDoc.data() } as Shipment;
        }
        return null;
    } catch (error) {
        console.error('Error getting shipment:', error);
        throw new Error('Failed to fetch shipment');
    }
};

/**
 * Get all shipments with optional filtering
 */
export const getAllShipments = async (filters?: ShipmentFilters): Promise<Shipment[]> => {
    try {
        // IMPORTANT: Ordering by createdAt + filtering by clientId requires a composite index
        // To avoid index requirement, we order ONLY when not filtering by clientId
        // OR we fetch all and sort client-side

        let q;

        if (filters?.clientId) {
            // When filtering by client, skip ordering to avoid index requirement
            q = query(collection(db, SHIPMENTS_COLLECTION), where('clientId', '==', filters.clientId));
        } else {
            // When NOT filtering by client, we can order
            q = query(collection(db, SHIPMENTS_COLLECTION), orderBy('createdAt', 'desc'));
        }

        if (filters?.status) {
            q = query(q, where('status', '==', filters.status));
        }

        if (filters?.courier) {
            q = query(q, where('courier', '==', filters.courier));
        }

        // Date filtering: only apply server-side when NOT filtering by clientId
        // (combining clientId + createdAt range requires a composite index)
        if (!filters?.clientId) {
            if (filters?.startDate) {
                q = query(q, where('createdAt', '>=', Timestamp.fromDate(filters.startDate)));
            }
            if (filters?.endDate) {
                q = query(q, where('createdAt', '<=', Timestamp.fromDate(filters.endDate)));
            }
        }

        const querySnapshot = await getDocs(q);
        let shipments = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Shipment));

        // Client-side date filtering when clientId is set (to avoid composite index requirement)
        if (filters?.clientId) {
            if (filters.startDate) {
                const startMs = filters.startDate.getTime();
                shipments = shipments.filter(s => {
                    const t = s.createdAt?.toMillis?.() || 0;
                    return t >= startMs;
                });
            }
            if (filters.endDate) {
                const endMs = filters.endDate.getTime();
                shipments = shipments.filter(s => {
                    const t = s.createdAt?.toMillis?.() || 0;
                    return t <= endMs;
                });
            }
            shipments.sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
            });
        }

        // Apply search filter (Client-side, as Firestore lacks full-text search)
        if (filters?.searchQuery) {
            const searchLower = filters.searchQuery.toLowerCase();
            shipments = shipments.filter(shipment =>
                shipment.id.toLowerCase().includes(searchLower) ||
                shipment.clientName.toLowerCase().includes(searchLower) ||
                shipment.courier.toLowerCase().includes(searchLower)
            );
        }

        return shipments;
    } catch (error: any) {
        console.error('Error getting shipments:', error);
        if (error.code === 'failed-precondition') {
            console.error("Missing/Failed Index. Create it here: " + error.message);
        }
        throw new Error('Failed to fetch shipments');
    }
};

/**
 * Get shipments by client
 */
export const getShipmentsByClient = async (clientId: string): Promise<Shipment[]> => {
    try {
        const q = query(
            collection(db, SHIPMENTS_COLLECTION),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Shipment));
    } catch (error) {
        console.error('Error getting shipments by client:', error);
        throw new Error('Failed to fetch shipments');
    }
};

/**
 * Get shipments by status
 */
export const getShipmentsByStatus = async (status: Shipment['status']): Promise<Shipment[]> => {
    try {
        const q = query(
            collection(db, SHIPMENTS_COLLECTION),
            where('status', '==', status)
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Shipment));
    } catch (error) {
        console.error('Error getting shipments by status:', error);
        throw new Error('Failed to fetch shipments');
    }
};

/**
 * Get recent shipments
 */
export const getRecentShipments = async (limit: number = 10): Promise<Shipment[]> => {
    try {
        const q = query(
            collection(db, SHIPMENTS_COLLECTION),
            orderBy('createdAt', 'desc'),
            firestoreLimit(limit)
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Shipment));
    } catch (error) {
        console.error('Error getting recent shipments:', error);
        throw new Error('Failed to fetch recent shipments');
    }
};

/**
 * Update shipment status
 */
export const updateShipmentStatus = async (
    shipmentId: string,
    status: Shipment['status']
): Promise<void> => {
    try {
        const updates: any = {
            status,
            updatedAt: Timestamp.now()
        };

        if (status === 'delivered') {
            updates.deliveredAt = Timestamp.now();
        }

        await updateDoc(doc(db, SHIPMENTS_COLLECTION, shipmentId), updates);
    } catch (error) {
        console.error('Error updating shipment status:', error);
        throw new Error('Failed to update shipment status');
    }
};

/**
 * Update shipment
 */
export const updateShipment = async (
    shipmentId: string,
    updates: Partial<Omit<Shipment, 'id' | 'createdAt'>>
): Promise<void> => {
    try {
        await updateDoc(doc(db, SHIPMENTS_COLLECTION, shipmentId), {
            ...updates,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating shipment:', error);
        throw new Error('Failed to update shipment');
    }
};

/**
 * Delete shipment
 */
export const deleteShipment = async (shipmentId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, SHIPMENTS_COLLECTION, shipmentId));
    } catch (error) {
        console.error('Error deleting shipment:', error);
        throw new Error('Failed to delete shipment');
    }
};
