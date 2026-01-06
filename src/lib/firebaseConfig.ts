// Firebase configuration and initialization
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { Analytics, getAnalytics } from 'firebase/analytics';

// Exported error state to be checked by AuthContext
export let initializationError: string | null = null;
export let app: FirebaseApp | undefined;
export let auth: Auth; // Will be cast to any if initialization fails to avoid type errors in imports
export let db: Firestore;
export let storage: FirebaseStorage;
export let analytics: Analytics | null = null;

const validateFirebaseConfig = () => {
    const requiredVars = {
        NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const missingVars = Object.entries(requiredVars)
        .filter(([key, value]) => {
            // Check if missing
            if (!value) return true;

            // Check for common placeholders from .env.example
            const placeholders = [
                'your-project-id',
                'your_api_key',
                'AIzaSyXXX', // Partial match for placeholder
                '123456789012',
                'G-XXXXXXXXXX'
            ];

            // If value matches any placeholder pattern or still contains "your-" (common in examples)
            if (placeholders.some(p => value.includes(p)) || value.includes('your-')) {
                return true;
            }

            return false;
        })
        .map(([key]) => key);

    if (missingVars.length > 0) {
        return `Invalid or Missing Firebase keys (detected placeholders): ${missingVars.join(', ')}`;
    }
    return null;
};

// Check configuration
const configError = validateFirebaseConfig();

if (configError) {
    console.error(`🔥 Firebase Configuration Error 🔥\n${configError}`);
    initializationError = configError;

    // Export potentially dangerous nulls/dummies to prevent import crashes, 
    // but the app should check initializationError before using them.
    app = undefined;
    // We cast to any here to satisfy strict TS exports while allowing the app to load
    // so we can show the error screen.
    auth = {} as Auth;
    db = {} as Firestore;
    storage = {} as FirebaseStorage;
} else {
    // valid config
    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };

    try {
        console.log('[FirebaseConfig] Loading with Project ID:', firebaseConfig.projectId);
        console.log('[FirebaseConfig] API Key present:', !!firebaseConfig.apiKey, 'Starts with:', firebaseConfig.apiKey?.substring(0, 5));

        app = initializeApp(firebaseConfig);
        console.log('✅ Firebase initialized successfully');

        auth = getAuth(app);

        // Initialize Firestore with simplified settings (removed persistence to fix SST errors)
        db = getFirestore(app);

        storage = getStorage(app);

        // Initialize Analytics (Safe check)
        if (typeof window !== 'undefined') {
            getAnalytics(app);
        }
    } catch (error: any) {
        console.error('❌ Firebase initialization failed:', error);
        initializationError = `Firebase initialization failed: ${error.message}`;
        auth = {} as Auth;
        db = {} as Firestore;
        storage = {} as FirebaseStorage;
    }
}

export default app;
