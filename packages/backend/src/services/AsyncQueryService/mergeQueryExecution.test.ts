import {
    MergeJoinType,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import {
    applyMergeExecutionMode,
    getMergeResultColumnCount,
} from './mergeQueryExecution';

const sourceQuery = (metrics: string[], calculations: string[] = []) =>
    ({
        exploreName: 'orders',
        dimensions: ['orders_month'],
        metrics,
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: calculations.map((name) => ({
            name,
            displayName: name,
            sql: '1',
        })),
    }) satisfies MetricQuery;

const mergeQuery: MergeQuery = {
    sources: [
        { id: 'orders', metricQuery: sourceQuery(['orders_count']) },
        {
            id: 'payments',
            metricQuery: sourceQuery(
                ['payments_sum', 'payments_count'],
                ['payments_average'],
            ),
        },
    ],
    joinKey: [
        {
            name: 'month',
            fieldIdBySourceId: {
                orders: 'orders_month',
                payments: 'orders_month',
            },
        },
    ],
    joinType: MergeJoinType.FULL,
    tableCalculations: [{ name: 'ratio', displayName: 'Ratio', sql: '1' }],
    limit: 500,
};

describe('merge query execution', () => {
    test('counts every column in the merged result', () => {
        expect(getMergeResultColumnCount(mergeQuery)).toBe(6);
    });

    test('leaves interactive queries unchanged', () => {
        expect(
            applyMergeExecutionMode({
                mergeQuery,
                mode: { type: 'interactive' },
                csvCellsLimit: 60,
            }),
        ).toBe(mergeQuery);
    });

    test('applies requested and cell-based export limits once to the merge', () => {
        expect(
            applyMergeExecutionMode({
                mergeQuery,
                mode: { type: 'export', limit: 8 },
                csvCellsLimit: 60,
            }).limit,
        ).toBe(8);
        expect(
            applyMergeExecutionMode({
                mergeQuery,
                mode: { type: 'export', limit: null },
                csvCellsLimit: 60,
            }).limit,
        ).toBe(10);
        expect(mergeQuery.sources[0].metricQuery.limit).toBe(500);
    });

    test('leaves structural validation to compilation', () => {
        expect(
            applyMergeExecutionMode({
                mergeQuery: {
                    sources: [],
                    joinKey: [],
                    joinType: MergeJoinType.FULL,
                    tableCalculations: [],
                    limit: 500,
                },
                mode: { type: 'export', limit: null },
                csvCellsLimit: 60,
            }).limit,
        ).toBe(60);
    });
});
