import { MERGE_TABLE_NAME, type MetricQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartQueryDimensions } from './getChartQueryDimensions';

const primary: Pick<MetricQuery, 'dimensions'> = {
    dimensions: ['orders_order_date_month'],
};
const merged = {
    metricQuery: {
        exploreName: MERGE_TABLE_NAME,
        dimensions: ['merge_join_key_0'],
        metrics: ['a_orders_total_order_amount', 'b_payments_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
};

describe('getChartQueryDimensions', () => {
    it('uses the merged result dimensions once a merge has run', () => {
        expect(getChartQueryDimensions(primary, merged)).toEqual([
            'merge_join_key_0',
        ]);
    });

    it('falls back to the query dimensions without a merge', () => {
        expect(getChartQueryDimensions(primary, null)).toEqual([
            'orders_order_date_month',
        ]);
    });

    it('reports no dimensions for a chart with no query yet', () => {
        expect(getChartQueryDimensions(undefined, null)).toEqual([]);
    });
});
