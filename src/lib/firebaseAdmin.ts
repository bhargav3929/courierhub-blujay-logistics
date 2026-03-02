import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminApp: App;
let adminAuth: Auth;

try {
    if (!getApps().length) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}';

        // Dotenv converts \n to actual newlines, but JSON requires escaped \n in strings
        // Convert actual newlines back to escaped \n for valid JSON parsing
        const fixedRaw = raw.replace(/\n/g, '\\n');
        const serviceAccount = JSON.parse(fixedRaw);

        adminApp = initializeApp({
            credential: cert(serviceAccount),
        });
        console.log('✅ Firebase Admin initialized successfully');
    } else {
        adminApp = getApps()[0];
    }
    adminAuth = getAuth(adminApp);
} catch (error) {
    console.error('Firebase Admin init failed:', error);
}

export { adminAuth };
