// Razorpay client-side service.
//
// 1. Calls /api/razorpay/create-order to get a razorpay_order_id.
// 2. Lazy-loads the Razorpay Checkout SDK from checkout.razorpay.com.
// 3. Opens checkout, and on success forwards the response to
//    /api/razorpay/verify-payment for HMAC verification + DB update.
//
// All API calls send the user's Firebase ID token in the Authorization header.
import axios from 'axios';
import { getAuth } from 'firebase/auth';

const SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('Razorpay SDK requires a browser'));
    }
    if ((window as any).Razorpay) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
        document.head.appendChild(s);
    });
    return sdkPromise;
}

async function bearerHeader(): Promise<{ Authorization: string }> {
    const u = getAuth().currentUser;
    if (!u) throw new Error('Not authenticated');
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
}

export interface RazorpayCheckoutPrefill {
    name?: string;
    email?: string;
    contact?: string;       // phone — Razorpay's parameter name
}

export interface RazorpayCheckoutResult {
    paid: boolean;
    paymentId?: string;
    signature?: string;
    error?: string;
}

export const razorpayService = {
    /**
     * Open Razorpay Checkout for the given internal order ID.
     * Returns once the modal is closed (success, dismiss, or error).
     */
    async startCheckout(
        orderId: string,
        prefill?: RazorpayCheckoutPrefill,
        opts?: { name?: string; description?: string; themeColor?: string }
    ): Promise<RazorpayCheckoutResult> {
        const headers = await bearerHeader();

        const created = await axios.post(
            '/api/razorpay/create-order',
            { orderId },
            { headers }
        );
        const { key, razorpayOrderId, amount, currency, testMode } = created.data;
        if (!key || !razorpayOrderId) {
            throw new Error('Razorpay order creation returned an incomplete response');
        }

        await loadSdk();

        return new Promise<RazorpayCheckoutResult>((resolve) => {
            const rz = new (window as any).Razorpay({
                key,
                order_id: razorpayOrderId,
                amount,
                currency,
                name: opts?.name || 'Blujay Logistics',
                description:
                    opts?.description ||
                    (testMode ? 'Test payment (sandbox)' : 'Order payment'),
                theme: { color: opts?.themeColor || '#2563eb' },
                prefill,
                handler: async (resp: any) => {
                    try {
                        await axios.post(
                            '/api/razorpay/verify-payment',
                            {
                                orderId,
                                razorpay_order_id: resp.razorpay_order_id,
                                razorpay_payment_id: resp.razorpay_payment_id,
                                razorpay_signature: resp.razorpay_signature,
                                method: resp.method,
                            },
                            { headers }
                        );
                        resolve({
                            paid: true,
                            paymentId: resp.razorpay_payment_id,
                            signature: resp.razorpay_signature,
                        });
                    } catch (err: any) {
                        resolve({
                            paid: false,
                            error:
                                err?.response?.data?.error ||
                                err?.message ||
                                'Verification failed',
                        });
                    }
                },
                modal: {
                    ondismiss: () =>
                        resolve({ paid: false, error: 'Checkout dismissed' }),
                },
            });
            rz.open();
        });
    },
};
