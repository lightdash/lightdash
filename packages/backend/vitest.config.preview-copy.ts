import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';

// PostgreSQL only: requires a migrated database, but no app or EE license.
export default defineConfig({
    ...unitConfig,
    test: {
        ...unitConfig.test,
        include: [
            'src/models/ProjectModel/ProjectModel.previewCopy.integration.test.ts',
        ],
        exclude: ['node_modules', 'dist'],
        testTimeout: 120_000,
        hookTimeout: 30_000,
    },
});
