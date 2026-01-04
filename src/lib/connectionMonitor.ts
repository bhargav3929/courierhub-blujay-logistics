// Connection Monitor - Real-time monitoring of Firestore connection state
import { onSnapshot, collection, enableNetwork } from 'firebase/firestore';
import { db } from './firebaseConfig';

export type ConnectionStatus = 'online' | 'offline' | 'connecting';

interface ConnectionState {
    status: ConnectionStatus;
    lastOnline: Date | null;
    lastOffline: Date | null;
}

class ConnectionMonitor {
    private listeners: Set<(status: ConnectionStatus) => void> = new Set();
    private state: ConnectionState = {
        status: 'connecting',
        lastOnline: null,
        lastOffline: null
    };
    private unsubscribe: (() => void) | null = null;

    constructor() {
        this.initialize();
    }

    /**
     * Initialize connection monitoring
     */
    private initialize() {
        // Monitor online/offline events
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.handleOnline());
            window.addEventListener('offline', () => this.handleOffline());

            // Set initial state based on navigator
            this.state.status = navigator.onLine ? 'online' : 'offline';
        }

        // Monitor Firestore connection by listening to a dummy collection
        // This helps detect Firestore-specific connection issues
        this.monitorFirestoreConnection();
    }

    /**
     * Monitor Firestore connection health
     */
    private monitorFirestoreConnection() {
        try {
            // Listen to a metadata change to detect connection
            // This is a lightweight way to monitor connection without reading data
            const unsubscribe = onSnapshot(
                collection(db, '_connection_monitor'),
                () => {
                    // Successfully connected to Firestore
                    if (this.state.status !== 'online') {
                        this.handleOnline();
                    }
                },
                (error) => {
                    // Connection error
                    console.warn('Firestore connection error:', error);
                    if (this.state.status !== 'offline') {
                        this.handleOffline();
                    }
                }
            );

            this.unsubscribe = unsubscribe;
        } catch (error) {
            console.error('Failed to initialize Firestore connection monitor:', error);
        }
    }

    /**
     * Handle online event
     */
    private handleOnline() {
        this.state.status = 'online';
        this.state.lastOnline = new Date();
        this.notifyListeners('online');
        console.log('🟢 Connection restored');
    }

    /**
     * Handle offline event
     */
    private handleOffline() {
        this.state.status = 'offline';
        this.state.lastOffline = new Date();
        this.notifyListeners('offline');
        console.log('🔴 Connection lost');
    }

    /**
     * Notify all listeners of status change
     */
    private notifyListeners(status: ConnectionStatus) {
        this.listeners.forEach(listener => {
            try {
                listener(status);
            } catch (error) {
                console.error('Error in connection listener:', error);
            }
        });
    }

    /**
     * Subscribe to connection status changes
     */
    public subscribe(callback: (status: ConnectionStatus) => void): () => void {
        this.listeners.add(callback);

        // Immediately notify with current status
        callback(this.state.status);

        // Return unsubscribe function
        return () => {
            this.listeners.delete(callback);
        };
    }

    /**
     * Get current connection status
     */
    public getStatus(): ConnectionStatus {
        return this.state.status;
    }

    /**
     * Get full connection state
     */
    public getState(): ConnectionState {
        return { ...this.state };
    }

    /**
     * Check if currently online
     */
    public isOnline(): boolean {
        return this.state.status === 'online';
    }

    /**
     * Check if currently offline
     */
    public isOffline(): boolean {
        return this.state.status === 'offline';
    }

    /**
     * Manually trigger connection check
     */
    public async checkConnection(): Promise<boolean> {
        if (!navigator.onLine) {
            this.handleOffline();
            return false;
        }

        try {
            // Try to enable network (this will fail if already enabled, which is fine)
            await enableNetwork(db);
            this.handleOnline();
            return true;
        } catch (error) {
            console.error('Connection check failed:', error);
            this.handleOffline();
            return false;
        }
    }

    /**
     * Clean up resources
     */
    public destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        if (typeof window !== 'undefined') {
            window.removeEventListener('online', () => this.handleOnline());
            window.removeEventListener('offline', () => this.handleOffline());
        }

        this.listeners.clear();
    }
}

// Create singleton instance
export const connectionMonitor = new ConnectionMonitor();
