import {
    DimensionType,
    FieldType,
    isMergeMetricSource,
    MergeJoinType,
    MetricType,
    type ItemsMap,
    type MergeQuery,
    type MergeTypedColumn,
    type MetricQuery,
    type QueryHistory,
} from '@lightdash/common';
import {
    applyMergeExportLimit,
    buildComposeMergeOriginalColumns,
    buildMergeRowCapGuard,
    getMergeOutputColumnCount,
    getMergeRowCapError,
    getMergeSourceLabels,
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
        expect(getMergeOutputColumnCount(mergeQuery)).toBe(6);
    });

    test('applies requested and cell-based export limits once to the merge', () => {
        expect(
            applyMergeExportLimit({
                mergeQuery,
                requestedRows: 8,
                csvCellsLimit: 60,
            }).limit,
        ).toBe(8);
        expect(
            applyMergeExportLimit({
                mergeQuery,
                requestedRows: null,
                csvCellsLimit: 60,
            }).limit,
        ).toBe(10);
        const [firstSource] = mergeQuery.sources;
        expect(
            isMergeMetricSource(firstSource) && firstSource.metricQuery.limit,
        ).toBe(500);
    });

    test('leaves structural validation to compilation', () => {
        expect(
            applyMergeExportLimit({
                mergeQuery: {
                    sources: [],
                    joinKey: [],
                    joinType: MergeJoinType.FULL,
                    tableCalculations: [],
                    limit: 500,
                },
                requestedRows: null,
                csvCellsLimit: 60,
            }).limit,
        ).toBe(60);
    });
});

const itemsMap: ItemsMap = {
    orders_month: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.DATE,
        name: 'month',
        label: 'Month',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.month',
        hidden: false,
        groups: [],
    },
    orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.count',
        hidden: false,
        groups: [],
    },
    merged_calc: {
        name: 'merged_calc',
        displayName: 'Merged calc',
        sql: '1',
    },
};
const typedColumns: MergeTypedColumn[] = [
    {
        reference: 'orders_month',
        type: DimensionType.DATE,
        origin: {
            kind: 'joinKey',
            fieldIdBySourceId: {
                orders: 'orders_month',
                payments: 'payments_month',
            },
        },
    },
    {
        reference: 'orders_count',
        type: DimensionType.NUMBER,
        origin: {
            kind: 'source',
            sourceId: 'orders',
            sourceFieldId: 'orders_count',
        },
    },
    {
        reference: 'merged_calc',
        type: DimensionType.NUMBER,
        origin: { kind: 'tableCalculation' },
    },
];

describe('buildComposeMergeOriginalColumns', () => {
    const columns = buildComposeMergeOriginalColumns({
        typedColumns,
        itemsMap,
        usedParametersValues: {},
        legQueryUuidBySourceId: { orders: 'orders-leg-uuid' },
    });

    test('source-owned columns set provenance to the field in the leg query', () => {
        expect(columns.orders_count).toEqual({
            reference: 'orders_count',
            type: DimensionType.NUMBER,
            label: 'Orders Count',
            format: '#,##0.###',
            provenance: {
                fieldId: 'orders_count',
                sourceQueryUuid: 'orders-leg-uuid',
            },
        });
    });

    test('join keys keep the merged field as their own provenance', () => {
        expect(columns.orders_month).toEqual({
            reference: 'orders_month',
            type: DimensionType.DATE,
            label: 'Orders Month',
            provenance: { fieldId: 'orders_month' },
        });
    });

    test('table calculations get a label and no provenance', () => {
        expect(columns.merged_calc).toEqual({
            reference: 'merged_calc',
            type: DimensionType.NUMBER,
            label: 'Merged calc',
        });
    });

    test('a source without a leg query keeps the merged-field provenance', () => {
        const withoutLeg = buildComposeMergeOriginalColumns({
            typedColumns,
            itemsMap,
            usedParametersValues: {},
            legQueryUuidBySourceId: {},
        });
        expect(withoutLeg.orders_count.provenance).toEqual({
            fieldId: 'orders_count',
        });
    });
});

describe('getMergeSourceLabels', () => {
    test('labels a source by the explore label its columns carry', () => {
        expect(
            getMergeSourceLabels({
                sources: [{ id: 'orders' }],
                typedColumns,
                itemsMap,
            }),
        ).toEqual({ orders: 'Orders' });
    });

    test('falls back to the slot label for a source with no value column', () => {
        expect(
            getMergeSourceLabels({
                sources: [{ id: 'orders' }, { id: 'empty' }],
                typedColumns,
                itemsMap,
            }),
        ).toEqual({ orders: 'Orders', empty: 'Query B' });
    });
});

describe('getMergeRowCapError', () => {
    test('refuses and names the source that reached the cap', () => {
        expect(
            getMergeRowCapError({
                legs: [
                    { label: 'Orders', rowCount: 500 },
                    { label: 'Payments', rowCount: 12 },
                ],
                sourceRowCap: 500,
            }),
        ).toBe(
            'Orders returned the maximum of 500 rows, so the merged results would be missing data. Add a filter to Orders, then merge again.',
        );
    });

    test('names every source that reached the cap', () => {
        expect(
            getMergeRowCapError({
                legs: [
                    { label: 'Orders', rowCount: 500 },
                    { label: 'Payments', rowCount: 501 },
                ],
                sourceRowCap: 500,
            }),
        ).toBe(
            'Orders and Payments each returned the maximum of 500 rows, so the merged results would be missing data. Add a filter to each, then merge again.',
        );
    });

    test('allows a merge whose sources are all under the cap', () => {
        expect(
            getMergeRowCapError({
                legs: [
                    { label: 'Orders', rowCount: 499 },
                    { label: 'Payments', rowCount: 0 },
                ],
                sourceRowCap: 500,
            }),
        ).toBeNull();
    });

    test('allows a source whose row count is unknown', () => {
        expect(
            getMergeRowCapError({
                legs: [{ label: 'Orders', rowCount: null }],
                sourceRowCap: 500,
            }),
        ).toBeNull();
    });
});

describe('buildMergeRowCapGuard', () => {
    const completed = (rowCountByTable: Record<string, number | null>) =>
        Object.fromEntries(
            Object.entries(rowCountByTable).map(([table, totalRowCount]) => [
                table,
                { totalRowCount } as QueryHistory,
            ]),
        );
    const guard = buildMergeRowCapGuard({
        legLabelByReferenceTable: {
            merge_source_0: 'Orders',
            merge_source_1: 'Payments',
        },
        sourceRowCap: 500,
    });

    test('reads each leg row count from its completed query history', () => {
        expect(
            guard(completed({ merge_source_0: 500, merge_source_1: 12 })),
        ).toBe(
            'Orders returned the maximum of 500 rows, so the merged results would be missing data. Add a filter to Orders, then merge again.',
        );
        expect(
            guard(completed({ merge_source_0: 499, merge_source_1: 12 })),
        ).toBeNull();
    });

    test('checks only the legs it was given, never a referenced result', () => {
        expect(
            guard(
                completed({
                    merge_source_0: 1,
                    merge_source_1: 1,
                    merge_source_2: 500,
                }),
            ),
        ).toBeNull();
    });
});
