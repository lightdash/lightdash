import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
    ...base,
    test: {
        ...base.test,
        name: 'saved-chart-integration-tests',
        include: [
            'src/models/SavedChartModel.find.integration.test.ts',
            'src/models/SavedChartModel.chartTypeImpact.integration.test.ts',
        ],
        exclude: ['**/node_modules/**'],
        hookTimeout: 60000,
    },
});
