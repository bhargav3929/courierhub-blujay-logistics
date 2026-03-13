/**
 * License validation gate — runs before dev, build, and start.
 * Without a valid BLUJAY_LICENSE_KEY, the process exits immediately.
 */
import { createHash } from 'crypto';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local for local development (on Vercel, env vars are injected by the platform)
config({ path: resolve(__dirname, '..', '.env.local') });

const EXPECTED_HASH = '0da120e23fa3a269073d432de1149848bcccebaf9aadd0a5d7d0f987729cedfb';

const key = process.env.BLUJAY_LICENSE_KEY;

if (!key) {
  console.error('\n\x1b[31m========================================\x1b[0m');
  console.error('\x1b[31m  LICENSE ERROR: Missing license key.\x1b[0m');
  console.error('\x1b[31m  This software is licensed to Blujay Logistics.\x1b[0m');
  console.error('\x1b[31m  Unauthorized use is prohibited.\x1b[0m');
  console.error('\x1b[31m========================================\x1b[0m\n');
  process.exit(1);
}

const hash = createHash('sha256').update(key).digest('hex');

if (hash !== EXPECTED_HASH) {
  console.error('\n\x1b[31m========================================\x1b[0m');
  console.error('\x1b[31m  LICENSE ERROR: Invalid license key.\x1b[0m');
  console.error('\x1b[31m  This software is licensed to Blujay Logistics.\x1b[0m');
  console.error('\x1b[31m  Unauthorized use is prohibited.\x1b[0m');
  console.error('\x1b[31m========================================\x1b[0m\n');
  process.exit(1);
}
