#!/usr/bin/env node
/**
 * Fail-closed environment validation for the B2B platform.
 *
 * Run as a `prebuild` / `prestart` hook to refuse to start the server
 * with missing or malformed required env vars. Mirrors the pattern of
 * scripts/validate-license.mjs.
 *
 * Usage:
 *   node scripts/validate-b2b-env.mjs
 *
 * To enable on every build, chain after the existing license check in
 * package.json:
 *   "prebuild": "node scripts/validate-license.mjs && node scripts/validate-b2b-env.mjs"
 *
 * Exits 1 with a clear error message; exits 0 quietly on success.
 */

const checks = [
    {
        name: 'BLUJAY_LICENSE_KEY',
        required: true,
        validate: (v) => (v && v.length > 0 ? null : 'must be set (validated by validate-license.mjs)'),
    },
    {
        name: 'FIREBASE_SERVICE_ACCOUNT_KEY',
        required: true,
        validate: (v) => {
            if (!v || v.length < 100) return 'must be set; expecting a Firebase service-account JSON';
            try {
                JSON.parse(v.replace(/\n/g, '\\n'));
                return null;
            } catch {
                return 'must be valid JSON (one-line; \\n-escaped newlines)';
            }
        },
    },
    {
        name: 'B2B_QUOTE_TOKEN_SECRET',
        required: true,
        validate: (v) =>
            v && v.length >= 32 ? null : 'must be ≥32 chars (generate via `openssl rand -hex 32`)',
    },
    {
        name: 'CRON_SECRET',
        required: true,
        validate: (v) =>
            v && v.length >= 16 ? null : 'must be ≥16 chars (generate via `openssl rand -hex 24`)',
    },
    {
        name: 'NEXT_PUBLIC_APP_URL',
        required: process.env.NODE_ENV === 'production',
        validate: (v) => {
            if (!v) return 'required in production';
            try {
                new URL(v);
                return null;
            } catch {
                return 'must be a valid URL (https://…)';
            }
        },
    },
];

const failures = [];
for (const c of checks) {
    const v = process.env[c.name];
    if (!c.required && !v) continue;
    const err = c.validate(v);
    if (err) failures.push(`  • ${c.name}: ${err}`);
}

if (failures.length > 0) {
    console.error('');
    console.error('═════════════════════════════════════════════════════════════════');
    console.error(' B2B ENV VALIDATION FAILED');
    console.error('═════════════════════════════════════════════════════════════════');
    console.error('');
    console.error('The following environment variables are missing or invalid:');
    console.error('');
    for (const f of failures) console.error(f);
    console.error('');
    console.error('See .env.example for the full list of required variables.');
    console.error('');
    process.exit(1);
}

// success — be quiet, like validate-license.mjs
