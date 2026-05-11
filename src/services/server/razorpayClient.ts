// Server-only Razorpay SDK wrapper.
// RAZORPAY_KEY_SECRET must NEVER be exposed to the browser.
// Use NEXT_PUBLIC_RAZORPAY_KEY_ID for the browser checkout SDK
// (the key_id is safe to publish; it identifies the merchant only).
import Razorpay from 'razorpay';

let cached: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
    if (cached) return cached;
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        throw new Error(
            'Razorpay credentials missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local (test keys for dev).'
        );
    }
    cached = new Razorpay({ key_id: keyId, key_secret: keySecret });
    return cached;
}

export function getRazorpayPublicKeyId(): string {
    return (
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
        process.env.RAZORPAY_KEY_ID ||
        ''
    );
}

export function isRazorpayTestMode(): boolean {
    const id = process.env.RAZORPAY_KEY_ID || '';
    return id.startsWith('rzp_test_');
}
