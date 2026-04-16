import crypto from 'crypto';

/**
 * Symmetric AES-256-CBC encryption for per-client courier API credentials.
 *
 * The encryption key is derived from the COURIER_CREDS_SECRET env var (falls
 * back to SHOPIFY_API_SECRET so existing deployments don't need a new secret
 * before the first deploy — set COURIER_CREDS_SECRET in production).
 *
 * Format: `iv_hex:encrypted_hex`
 */

const getKey = (): Buffer => {
    const secret = process.env.COURIER_CREDS_SECRET || process.env.SHOPIFY_API_SECRET;
    if (!secret) {
        throw new Error(
            'COURIER_CREDS_SECRET (or SHOPIFY_API_SECRET as fallback) must be configured to store courier credentials'
        );
    }
    return crypto.createHash('sha256').update(secret).digest();
};

export function encryptCreds(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptCreds(ciphertext: string): string {
    const [ivHex, encrypted] = ciphertext.split(':');
    if (!ivHex || !encrypted) {
        throw new Error('Invalid encrypted credentials format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/** Convenience — encrypt an object by JSON-serializing it first. */
export function encryptCredsObject<T extends Record<string, any>>(obj: T): string {
    return encryptCreds(JSON.stringify(obj));
}

/** Convenience — decrypt and JSON-parse. Throws on malformed input. */
export function decryptCredsObject<T extends Record<string, any>>(ciphertext: string): T {
    return JSON.parse(decryptCreds(ciphertext)) as T;
}
