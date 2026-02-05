import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let adminApp: App;

if (!getApps().length) {
    const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
    );

    adminApp = initializeApp({
        credential: cert(serviceAccount),
    });
} else {
    adminApp = getApps()[0];
}

export const adminAuth = getAuth(adminApp);
