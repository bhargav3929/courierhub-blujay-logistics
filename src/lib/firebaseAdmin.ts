import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

let adminApp: App;
let adminAuth: Auth;

try {
    if (!getApps().length) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}';
        const serviceAccount = JSON.parse(raw);

        adminApp = initializeApp({
            credential: cert(serviceAccount),
        });
    } else {
        adminApp = getApps()[0];
    }
    adminAuth = getAuth(adminApp);
} catch (error) {
    console.error('Firebase Admin init failed:', error);
}

export { adminAuth };
