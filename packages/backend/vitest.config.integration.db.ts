import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

// Database-level integration tests: they connect directly via PGCONNECTIONURI
// and do not boot the app, unlike the EE harness in vitest.config.integration.ts.
export default defineConfig({
    test: {
        name: 'db-integration-tests',
        include: ['src/models/**/*integration.test.ts'],
        exclude: ['node_modules', 'dist'],
        environment: 'node',
        testTimeout: 60000,
        hookTimeout: 30000,
        globals: true,
        env: {
            TZ: 'UTC',
            NODE_ENV: 'test',
        },
        reporters: ['verbose'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
