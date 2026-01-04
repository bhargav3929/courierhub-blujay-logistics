// Client Service - CRUD operations for franchise partners and Shopify merchants
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc, // Added setDoc
    updateDoc,
    deleteDoc,
    Timestamp,
    query,
    where,
    orderBy,
    increment,
    getCountFromServer
} from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { Client, ClientFilters } from '@/types/types';
import { initializeApp, getApp, deleteApp, FirebaseApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";

const CLIENTS_COLLECTION = 'clients';

/**
 * Add a new client
 */
// Helper to create a user without logging out the current admin
const createAuthUser = async (email: string, password: string): Promise<string> => {
    const firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await signOut(secondaryAuth);
        return userCredential.user.uid;
    } catch (error) {
        throw error;
    } finally {
        await deleteApp(secondaryApp);
    }
};

/**
 * Add a new client (Creates Auth User + Firestore Data)
 */
export const addClient = async (
    clientData: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>,
    password?: string
): Promise<Client> => {
    try {
        let uid = "";

        // 1. Create Authentication User if password provided
        if (password) {
            uid = await createAuthUser(clientData.email, password);
        } else {
            // Fallback or explicit error if password is mandatory
            throw new Error("Password is required to create a client account.");
        }

        const timestamp = Timestamp.now();

        // 2. Create User Document (For Auth Context / Role Management)
        await setDoc(doc(db, "users", uid), {
            email: clientData.email,
            name: clientData.name,
            role: clientData.type, // 'franchise' or 'shopify'
            phone: clientData.phone,
            isActive: true,
            createdAt: timestamp,
            clientId: uid // user ID acts as client ID
        });

        // 3. Create Client Document (For Business Logic)
        // We use setDoc with the same UID so we can easily link them. 
        // Previously it was addDoc (auto-ID), but linking by UID is cleaner.
        const newClient = {
            ...clientData,
            id: uid, // Explicitly set ID
            walletBalance: clientData.walletBalance || 0,
            createdAt: timestamp,
            updatedAt: timestamp
        };

        await setDoc(doc(db, CLIENTS_COLLECTION, uid), newClient);

        return newClient as Client;
    } catch (error: any) {
        console.error('Error adding client:', error);
        throw new Error(error.message || 'Failed to add client');
    }
};

/**
 * Get client by ID
 */
export const getClientById = async (clientId: string): Promise<Client | null> => {
    try {
        const clientDoc = await getDoc(doc(db, CLIENTS_COLLECTION, clientId));
        if (clientDoc.exists()) {
            return { id: clientDoc.id, ...clientDoc.data() } as Client;
        }
        return null;
    } catch (error) {
        console.error('Error getting client:', error);
        throw new Error('Failed to fetch client');
    }
};

/**
 * Get all clients with optional filtering
 */
export const getAllClients = async (filters?: ClientFilters): Promise<Client[]> => {
    try {
        let q = query(collection(db, CLIENTS_COLLECTION));

        if (filters?.type) {
            q = query(q, where('type', '==', filters.type));
        }

        if (filters?.status) {
            q = query(q, where('status', '==', filters.status));
        }

        const querySnapshot = await getDocs(q);
        let clients = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Client));

        // Apply search filter if provided
        if (filters?.searchQuery) {
            const searchLower = filters.searchQuery.toLowerCase();
            clients = clients.filter(client =>
                client.name.toLowerCase().includes(searchLower) ||
                client.email.toLowerCase().includes(searchLower) ||
                client.phone.includes(searchLower)
            );
        }

        return clients;
    } catch (error) {
        console.error('Error getting clients:', error);
        throw new Error('Failed to fetch clients');
    }
};

/**
 * Get clients by type (franchise or shopify)
 */
export const getClientsByType = async (type: 'franchise' | 'shopify'): Promise<Client[]> => {
    try {
        const q = query(
            collection(db, CLIENTS_COLLECTION),
            where('type', '==', type)
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Client));
    } catch (error) {
        console.error('Error getting clients by type:', error);
        throw new Error('Failed to fetch clients');
    }
};

/**
 * Update client
 */
export const updateClient = async (
    clientId: string,
    updates: Partial<Omit<Client, 'id' | 'createdAt'>>
): Promise<void> => {
    try {
        await updateDoc(doc(db, CLIENTS_COLLECTION, clientId), {
            ...updates,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating client:', error);
        throw new Error('Failed to update client');
    }
};

/**
 * Update wallet balance
 */
export const updateWalletBalance = async (
    clientId: string,
    amount: number,
    operation: 'add' | 'subtract'
): Promise<void> => {
    try {
        const incrementValue = operation === 'add' ? amount : -amount;
        await updateDoc(doc(db, CLIENTS_COLLECTION, clientId), {
            walletBalance: increment(incrementValue),
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating wallet balance:', error);
        throw new Error('Failed to update wallet balance');
    }
};

/**
 * Toggle client status
 */
export const toggleClientStatus = async (
    clientId: string,
    status: 'active' | 'inactive'
): Promise<void> => {
    try {
        await updateDoc(doc(db, CLIENTS_COLLECTION, clientId), {
            status,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error toggling client status:', error);
        throw new Error('Failed to update client status');
    }
};

/**
 * Delete client
 */
export const deleteClient = async (clientId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, CLIENTS_COLLECTION, clientId));
    } catch (error) {
        console.error('Error deleting client:', error);
        throw new Error('Failed to delete client');
    }
};

/**
 * Get active clients count
 */
export const getActiveClientsCount = async (): Promise<number> => {
    try {
        const q = query(
            collection(db, CLIENTS_COLLECTION),
            where('status', '==', 'active')
        );
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    } catch (error) {
        console.error('Error getting active clients count:', error);
        return 0;
    }
};
