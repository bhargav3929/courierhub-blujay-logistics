// Order service — client-side reads via firebase/firestore.
// All writes go through /api/orders/* (server-side admin SDK).
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit as firestoreLimit,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import type { Order } from '@/types/order';

const ORDERS_COLLECTION = 'orders';

export const getOrderById = async (orderId: string): Promise<Order | null> => {
    try {
        const snap = await getDoc(doc(db, ORDERS_COLLECTION, orderId));
        if (snap.exists()) {
            return { id: snap.id, ...snap.data() } as Order;
        }
        return null;
    } catch (err) {
        console.error('Error getting order:', err);
        throw new Error('Failed to fetch order');
    }
};

export const getOrdersForClient = async (
    clientId: string,
    opts: { limit?: number } = {}
): Promise<Order[]> => {
    try {
        const q = query(
            collection(db, ORDERS_COLLECTION),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc'),
            firestoreLimit(opts.limit ?? 100)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
    } catch (err) {
        console.error('Error listing orders:', err);
        throw new Error('Failed to list orders');
    }
};
