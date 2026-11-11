import {
    MERGE_TABLE_NAME,
    MergeJoinType,
    type MetricQuery,
    type SavedMergeDefinition,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartQueryDimensions } from './getChartQueryDimensions';

const primary: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_total_order_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
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
        expect(getChartQueryDimensions(primary, merged, null)).toEqual([
            'merge_join_key_0',
        ]);
    });

    it('falls back to the query dimensions without a merge', () => {
        expect(getChartQueryDimensions(primary, null, null)).toEqual([
            'orders_order_date_month',
            'orders_status',
        ]);
    });

    it('reports no dimensions for a chart with no query yet', () => {
        expect(getChartQueryDimensions(undefined, null, null)).toEqual([]);
    });

    it('derives the merged dimensions from a saved merge that has not run here', () => {
        const merge: SavedMergeDefinition = {
            chartAs: 'monthly_orders',
            queries: {
                monthly_payments: {
                    explore: 'payments',
                    dimensions: ['payments_payment_month'],
                    metrics: ['payments_count'],
                    repeat: true,
                },
            },
            join: MergeJoinType.FULL,
            keys: {
                orders_order_date_month: [
                    'monthly_payments.payments_payment_month',
                ],
            },
            keyNames: { orders_order_date_month: 'month' },
            limit: 500,
        };
        expect(getChartQueryDimensions(primary, null, merge)).toEqual([
            'merge_month',
            'monthly_orders_orders_status',
        ]);
    });
});
