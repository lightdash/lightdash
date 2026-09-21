import { MergeJoinType, type MergeQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toSavedMergeQuery } from './useSavedMerge';

const metricQuery = (exploreName: string) => ({
    exploreName,
    dimensions: [`${exploreName}_date`],
    metrics: [`${exploreName}_total`],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});

describe('toSavedMergeQuery', () => {
    it('persists the exact effective join used by the runtime, the chart query by reference', () => {
        const mergeQuery: MergeQuery = {
            sources: [
                { id: 'orders', metricQuery: metricQuery('orders') },
                { id: 'payments', metricQuery: metricQuery('payments') },
            ],
            joinKey: [
                {
                    name: 'orders_suggested_date',
                    fieldIdBySourceId: {
                        orders: 'orders_suggested_date',
                        payments: 'payments_suggested_date',
                    },
                },
                {
                    name: 'orders_status',
                    fieldIdBySourceId: {
                        orders: 'orders_status',
                        payments: 'payments_status',
                    },
                },
            ],
            joinType: MergeJoinType.INNER,
            tableCalculations: [],
            sorts: [{ fieldId: 'payments_payments_total', descending: true }],
            limit: 500,
        };

        expect(toSavedMergeQuery(mergeQuery, 'orders')).toEqual({
            primarySourceId: 'orders',
            sources: [
                { id: 'orders', kind: 'chart' },
                {
                    id: 'payments',
                    kind: 'query',
                    metricQuery: metricQuery('payments'),
                },
            ],
            joinKey: mergeQuery.joinKey,
            joinType: mergeQuery.joinType,
            tableCalculations: mergeQuery.tableCalculations,
        });
    });

    it('keeps the names a saved chart fixed and the repeat flag per query', () => {
        const mergeQuery: MergeQuery = {
            sources: [
                { id: 'a', metricQuery: metricQuery('orders') },
                {
                    id: 'b',
                    metricQuery: metricQuery('payments'),
                    repeatValues: true,
                },
            ],
            joinKey: [
                {
                    name: 'join_key_0',
                    fieldIdBySourceId: { a: 'orders_date', b: 'payments_date' },
                },
            ],
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
            limit: 500,
        };

        expect(toSavedMergeQuery(mergeQuery, 'a')).toEqual({
            primarySourceId: 'a',
            sources: [
                { id: 'a', kind: 'chart' },
                {
                    id: 'b',
                    kind: 'query',
                    metricQuery: metricQuery('payments'),
                },
            ],
            joinKey: mergeQuery.joinKey,
            joinType: mergeQuery.joinType,
            tableCalculations: mergeQuery.tableCalculations,
            repeatValuesSourceIds: ['b'],
        });
    });
});
