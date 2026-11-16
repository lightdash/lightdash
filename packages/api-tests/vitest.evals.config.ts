import { defineConfig } from 'vitest/config';

// Evals call a real model, so they never run with the API tests: run them by hand against a server that has model credentials.
export default defineConfig({
    test: {
        include: ['evals/**/*.eval.ts'],
        environment: 'node',
        testTimeout: 900_000,
        hookTimeout: 120_000,
        globals: true,
        setupFiles: ['vitest.setup.ts'],
        fileParallelism: false,
        sequence: { concurrent: false },
    },
});
