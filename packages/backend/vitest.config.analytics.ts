import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        include: ['src/models/AnalyticsModel.integration.test.ts'],
        exclude: ['node_modules', 'dist'],
        testTimeout: 15_000,
        hookTimeout: 15_000,
    },
});
