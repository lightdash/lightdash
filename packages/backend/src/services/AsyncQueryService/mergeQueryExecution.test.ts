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
} from '@lightdash/common';
import {
    applyMergeExportLimit,
    buildComposeMergeOriginalColumns,
    getMergeOutputColumnCount,
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

describe('buildComposeMergeOriginalColumns', () => {
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
