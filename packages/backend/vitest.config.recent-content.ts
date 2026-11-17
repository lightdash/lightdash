import { defineConfig } from 'vitest/config';
import { baseConfig as unitConfig } from './vitest.config';

// PostgreSQL only: these tests do not bootstrap an app or require an EE license.
export default defineConfig({
    ...unitConfig,
    test: {
        clearMocks: false,
        ...unitConfig.test,
        include: ['src/models/RecentContentModel.integration.test.ts'],
        exclude: ['node_modules', 'dist'],
        testTimeout: 15_000,
        hookTimeout: 15_000,
    },
});
