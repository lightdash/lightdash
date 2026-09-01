import { type AiDeepResearchChartData } from '@lightdash/common';
import { buildDeepResearchVizConfig } from './useDeepResearchExploreUrl';

const chart = {
    source: 'warehouse',
    title: 'Orders',
    chartConfig: null,
    queryUuid: 'query-uuid',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        sorts: [
            {
                fieldId: 'orders_count',
                descending: true,
                nullsFirst: null,
            },
            {
                fieldId: 'orders_status',
                descending: false,
                nullsFirst: false,
            },
        ],
        limit: 500,
        filters: {},
        tableCalculations: [],
        additionalMetrics: [],
    },
    fields: {},
} as unknown as AiDeepResearchChartData;

describe('buildDeepResearchVizConfig', () => {
    it('omits warehouse-default null ordering and preserves explicit ordering', () => {
        expect(buildDeepResearchVizConfig(chart).queryConfig.sorts).toEqual([
            {
                fieldId: 'orders_count',
                descending: true,
            },
            {
                fieldId: 'orders_status',
                descending: false,
                nullsFirst: false,
            },
        ]);
    });
});
