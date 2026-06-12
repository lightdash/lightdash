import { parseVizConfig } from './utils';

describe('AI agent artifact utils', () => {
    it('keeps legacy runQuery artifact parsing', () => {
        const parsed = parseVizConfig({
            title: 'Legacy',
            description: 'Legacy artifact',
            queryConfig: {
                exploreName: 'orders',
                dimensions: ['orders_created_date'],
                metrics: ['orders_count'],
                sorts: [],
                limit: 500,
            },
            chartConfig: null,
            customMetrics: null,
            tableCalculations: null,
            filters: null,
        });

        expect(parsed?.metricQuery).toMatchObject({
            exploreName: 'orders',
            dimensions: ['orders_created_date'],
            metrics: ['orders_count'],
        });
    });
});
