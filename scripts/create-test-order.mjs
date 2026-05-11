/**
 * scripts/create-test-order.mjs
 *
 * Inject a fake "paid order" into Firestore so the Ship Links UI can be
 * tested without going through Razorpay or Shiprocket.
 *
 * Usage:
 *   node scripts/create-test-order.mjs                  # lists users, prints usage
 *   node scripts/create-test-order.mjs <email-or-uid>   # creates an order for that user
 *
 * Reads FIREBASE_SERVICE_ACCOUNT_KEY from .env.local.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '';
if (!raw) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
    process.exit(1);
}
const serviceAccount = JSON.parse(raw.replace(/\n/g, '\\n'));
if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();

const arg = process.argv[2];

async function findUser() {
    if (!arg) {
        console.log('--- Available users in this Firebase project ---\n');
        let count = 0;
        let page = await auth.listUsers(100);
        while (page.users.length) {
            for (const u of page.users) {
                count++;
                console.log(
                    `  ${count}. uid=${u.uid}  email=${u.email || '(none)'}  lastSignIn=${u.metadata.lastSignInTime || '(never)'}`
                );
            }
            if (!page.pageToken) break;
            page = await auth.listUsers(100, page.pageToken);
        }
        console.log('\nUsage: node scripts/create-test-order.mjs <email-or-uid>');
        process.exit(0);
    }

    if (arg.includes('@')) {
        try {
            return await auth.getUserByEmail(arg);
        } catch (err) {
            throw new Error(`No user found with email: ${arg}`);
        }
    }
    try {
        return await auth.getUser(arg);
    } catch (err) {
        throw new Error(`No user found with uid: ${arg}`);
    }
}

const user = await findUser();
console.log(`Using user: ${user.uid} (${user.email || '(no email)'})`);

const now = Timestamp.now();
const orderDoc = {
    clientId: user.uid,
    externalOrderId: null,
    customer: {
        name: 'Test Customer',
        phone: '9999999999',
        email: 'test-customer@example.com',
    },
    shippingAddress: {
        name: 'Test Customer',
        phone: '9999999999',
        email: 'test-customer@example.com',
        line1: '123 MG Road',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        country: 'India',
    },
    billingAddress: {
        name: 'Test Customer',
        phone: '9999999999',
        email: 'test-customer@example.com',
        line1: '123 MG Road',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        country: 'India',
    },
    items: [
        {
            name: 'Sample Test Product',
            sku: 'TEST-SKU-001',
            quantity: 1,
            unitPrice: 50000, // paise (₹500)
            weight: 500, // grams
        },
    ],
    amounts: {
        subtotal: 50000,
        shipping: 0,
        tax: 0,
        discount: 0,
        total: 50000,
        codCollect: 0,
    },
    payment: {
        provider: 'razorpay',
        status: 'paid',
        amount: 50000,
        currency: 'INR',
        method: 'card',
        providerOrderId: 'order_test_' + Date.now(),
        providerPaymentId: 'pay_test_' + Date.now(),
        paidAt: now,
        attempts: 1,
    },
    automation: {
        stage: 'shipment_pending',
        attempts: 0,
        history: [
            { stage: 'order_created', at: now },
            { stage: 'awaiting_payment', at: now },
            { stage: 'payment_received', at: now },
            { stage: 'shipment_pending', at: now },
        ],
    },
    metadata: { source: 'create-test-order.mjs' },
    notes: 'Manually injected test order — no Razorpay/Shiprocket required',
    createdAt: now,
    updatedAt: now,
};

const ref = await db.collection('orders').add(orderDoc);
console.log(`\n✅ Test order created.`);
console.log(`   Order ID: ${ref.id}`);
console.log(`   Status:   payment.status=paid, automation.stage=shipment_pending`);
console.log(
    `\nRefresh http://localhost:3000/ship-links — it should appear within 1 second.`
);
process.exit(0);
