import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'migration-integration-tests',
        include: [
            'src/**/database/migrations/__tests__/*.migration.integration.ts',
        ],
        environment: 'node',
        testTimeout: 120000,
        hookTimeout: 120000,
        teardownTimeout: 60000,
        globals: true,
        env: {
            TZ: 'UTC',
            NODE_ENV: 'test',
        },
    },
});
