import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        include: [
            'src/models/ContentModel/ContentSimilarity.postgres.integration.test.ts',
        ],
        exclude: ['node_modules', 'dist'],
        testTimeout: 15000,
        hookTimeout: 15000,
    },
});
