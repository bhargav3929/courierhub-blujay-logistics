import crypto from 'crypto';

const getEncryptionKey = (): Buffer => {
    const secret = process.env.SHOPIFY_API_SECRET;
    if (!secret) throw new Error('SHOPIFY_API_SECRET not configured');
    return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypt a Shopify access token for safe storage in Firestore.
 * Format: iv_hex:encrypted_hex
 */
export function encryptToken(token: string): string {
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a Shopify access token from Firestore.
 * Expects format: iv_hex:encrypted_hex
 */
export function decryptToken(encryptedToken: string): string {
    const [ivHex, encrypted] = encryptedToken.split(':');
    if (!ivHex || !encrypted) {
        throw new Error('Invalid encrypted token format');
    }
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
