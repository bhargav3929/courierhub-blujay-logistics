import { defineConfig } from 'vitest/config';

// Integration test config. Runs against the Firebase emulator; requires:
//   FIRESTORE_EMULATOR_HOST=localhost:8080
//   FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
//
// Start the emulator first:
//   firebase emulators:start --only firestore,storage
//
// Then:
//   npx vitest --config=vitest.integration.config.ts
//
// Tests are sequential to avoid emulator contention. The default unit
// test config (no --config flag) excludes this folder, so unit tests
// continue to run normally.

export default defineConfig({
    test: {
        include: ['test/integration/**/*.test.ts'],
        exclude: ['node_modules', '.next', 'src/**'],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        setupFiles: ['./test/integration/_env.ts'],
        sequence: { hooks: 'list' },
        // Single-fork: Firestore emulator doesn't love concurrent readers
        // hammering it during writes. Trade-off: slower wall time, but
        // deterministic test outcomes.
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
});
