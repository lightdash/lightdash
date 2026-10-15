import { getMetricQueryEstimateBody } from './useQueryCostEstimate';

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

describe('getMetricQueryEstimateBody', () => {
    it('builds the same query body the explorer executes', () => {
        expect(
            getMetricQueryEstimateBody({
                projectUuid: 'project',
                tableId: 'orders',
                query: metricQuery,
                dateZoomGranularity: 'MONTH',
                usePreAggregateCache: true,
                parameters: { region: 'eu' },
            }),
        ).toEqual({
            query: { ...metricQuery, timezone: undefined },
            dateZoom: { granularity: 'MONTH' },
            usePreAggregateCache: true,
            parameters: { region: 'eu' },
            pivotConfiguration: undefined,
        });
    });

    it('skips saved-chart runs and missing queries', () => {
        expect(
            getMetricQueryEstimateBody({
                projectUuid: 'project',
                tableId: 'orders',
                query: metricQuery,
                chartUuid: 'chart',
            }),
        ).toBeNull();
        expect(
            getMetricQueryEstimateBody({
                projectUuid: 'project',
                tableId: 'orders',
            }),
        ).toBeNull();
    });
});
