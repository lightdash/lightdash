import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'migration-integration-tests',
        include: [
            'src/**/database/migrations/__tests__/*.migration.integration.ts',
            'src/models/ProjectModel/ProjectModel.membershipOrdering.integration.test.ts',
            'src/models/SavedChartModel.composer.integration.test.ts',
            'src/models/DashboardModel/DashboardModel.composer.integration.test.ts',
            'src/models/UsageQueryHistoryModel.integration.test.ts',
            'src/models/QueryHistoryModel/QueryHistoryModel.resultsCacheStats.integration.test.ts',
        ],
        environment: 'node',
        testTimeout: 120000,
        hookTimeout: 600000,
        teardownTimeout: 60000,
        globals: true,
        env: {
            TZ: 'UTC',
            NODE_ENV: 'test',
        },
    },
});
