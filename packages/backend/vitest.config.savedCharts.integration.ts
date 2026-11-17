import { defineConfig } from 'vitest/config';
import { baseConfig as base } from './vitest.config';

export default defineConfig({
    ...base,
    test: {
        clearMocks: false,
        ...base.test,
        name: 'saved-chart-integration-tests',
        include: [
            'src/models/SavedChartModel.find.integration.test.ts',
            'src/models/SavedChartModel.availableFilters.integration.test.ts',
            'src/models/SavedChartModel.chartTypeImpact.integration.test.ts',
        ],
        exclude: ['**/node_modules/**'],
        hookTimeout: 60000,
    },
});
