// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/**
 * Validates that all required Firebase environment variables are present
 * @throws Error if any required variable is missing
 */
const validateFirebaseConfig = (): void => {
    const requiredVars = {
        VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
        VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    const missingVars = Object.entries(requiredVars)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missingVars.length > 0) {
        const errorMessage = `
🔥 Firebase Configuration Error 🔥

Missing required environment variables:
${missingVars.map(v => `  - ${v}`).join('\n')}

Please follow these steps:
1. Copy .env.example to .env.local
2. Fill in your Firebase configuration values from Firebase Console
3. Restart the development server

For detailed setup instructions, see FIREBASE_SETUP.md
        `.trim();

        console.error(errorMessage);
        throw new Error(`Missing Firebase environment variables: ${missingVars.join(', ')}`);
    }
};

// Validate configuration before initialization
validateFirebaseConfig();

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase with error handling
let app;
try {
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized successfully');
} catch (error: any) {
    console.error('❌ Firebase initialization failed:', error);
    throw new Error(`Firebase initialization failed: ${error.message}`);
}

// Initialize Firebase services
export const auth = getAuth(app);

// Initialize Firestore with settings for better connectivity
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    }),
    experimentalAutoDetectLongPolling: true // Expert Fix: Helps with "client offline" issues in restricted networks
});

export const storage = getStorage(app);

// Initialize Analytics (Safe check)
let analytics = null;
if (typeof window !== 'undefined') {
    import('firebase/analytics').then(({ getAnalytics }) => {
        analytics = getAnalytics(app);
    }).catch(err => console.log("Analytics failed to load", err));
}
export { analytics };

export default app;
