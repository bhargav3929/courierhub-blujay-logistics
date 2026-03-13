import { createHash } from 'crypto';

/**
 * License validation at config load time.
 * Even if someone bypasses the npm scripts, Next.js itself won't start.
 */
const LICENSE_HASH = '0da120e23fa3a269073d432de1149848bcccebaf9aadd0a5d7d0f987729cedfb';

function validateLicense() {
    const key = process.env.BLUJAY_LICENSE_KEY;
    if (!key) {
        console.error('\n\x1b[31m  LICENSE ERROR: Missing BLUJAY_LICENSE_KEY.\x1b[0m');
        console.error('\x1b[31m  This software is licensed to Blujay Logistics.\x1b[0m\n');
        process.exit(1);
    }
    const hash = createHash('sha256').update(key).digest('hex');
    if (hash !== LICENSE_HASH) {
        console.error('\n\x1b[31m  LICENSE ERROR: Invalid license key.\x1b[0m');
        console.error('\x1b[31m  This software is licensed to Blujay Logistics.\x1b[0m\n');
        process.exit(1);
    }
}

validateLicense();

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
};

export default nextConfig;
