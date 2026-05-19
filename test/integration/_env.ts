// Bootstrap env for integration tests. Loaded by Vitest before any test
// file imports firebase-admin. Sets safe placeholder values for required
// secrets so the platform's runtime checks don't refuse to boot in the
// test process.
//
// IMPORTANT: this file only runs when explicitly listed in setupFiles
// (vitest.integration.config.ts). It must NOT leak into production runs.

// firebase-admin auto-detects the emulator from these:
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    // Fail fast — tests need a running emulator to be meaningful. Without
    // it they'd silently hit production credentials (if any are present)
    // or fail in confusing ways.
    throw new Error(
        '\n\n' +
        '════════════════════════════════════════════════════════════════\n' +
        ' Integration tests require the Firebase emulator.\n' +
        '════════════════════════════════════════════════════════════════\n' +
        '\n' +
        ' Start it in another terminal:\n' +
        '   firebase emulators:start --only firestore,storage\n' +
        '\n' +
        ' Then set in your shell:\n' +
        '   export FIRESTORE_EMULATOR_HOST=localhost:8080\n' +
        '   export FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199\n' +
        '\n',
    );
}

// Reasonable defaults for B2B secrets — these never leave the test process.
process.env.BLUJAY_LICENSE_KEY ??= 'test-license-key';
process.env.B2B_QUOTE_TOKEN_SECRET ??= 'test-quote-token-secret-32-chars-min';
process.env.CRON_SECRET ??= 'test-cron-secret-16-chars-min';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';

// When pointing at the emulator, firebase-admin doesn't validate the
// service account JSON — it only needs the project_id. We provide a
// minimal stub so any code that JSON.parses the env var doesn't choke.
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: 'blujay-emulator-test',
        private_key_id: 'test',
        private_key:
            '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADAN...\\n-----END PRIVATE KEY-----\\n',
        client_email: 'test@blujay-emulator-test.iam.gserviceaccount.com',
        client_id: '0',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
    });
}
