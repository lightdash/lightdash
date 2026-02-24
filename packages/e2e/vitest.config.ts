import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['api-tests/tests/**/*.test.ts'],
        environment: 'node',
        testTimeout: 120_000,
        hookTimeout: 30_000,
        globals: true,
        setupFiles: ['api-tests/vitest.setup.ts'],
        pool: 'forks',
        fileParallelism: false, // tests share DB state; parallel execution causes space/chart deletion race conditions
    },
});
