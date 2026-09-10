import {
    DimensionType,
    FieldType,
    MetricType,
    VizAggregationOptions,
    VizIndexType,
    type Dimension,
    type ItemsMap,
    type Metric,
    type PivotValuesColumn,
    type QueryHistory,
    type ResultColumns,
} from '@lightdash/common';
import { getPivotedColumns } from './getPivotedColumns';

const dateDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date',
    label: 'Order date',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.order_date',
    hidden: false,
    groups: [],
};

const revenueMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
    groups: [],
};

const itemsMap: ItemsMap = {
    orders_order_date: dateDimension,
    orders_revenue: revenueMetric,
};

const unpivotedColumns: ResultColumns = {
    orders_order_date: {
        reference: 'orders_order_date',
        type: DimensionType.DATE,
        label: 'Orders Order date',
        provenance: { fieldId: 'orders_order_date' },
    },
};

const pivotConfiguration: NonNullable<QueryHistory['pivotConfiguration']> = {
    indexColumn: {
        reference: 'orders_order_date',
        type: VizIndexType.TIME,
    },
    valuesColumns: [
        {
            reference: 'orders_revenue',
            aggregation: VizAggregationOptions.ANY,
        },
    ],
    groupByColumns: [{ reference: 'orders_status' }],
    sortBy: undefined,
};

const pivotValuesColumns: PivotValuesColumn[] = [
    {
        referenceField: 'orders_revenue',
        pivotColumnName: 'orders_revenue_any_completed',
        aggregation: VizAggregationOptions.ANY,
        pivotValues: [
            {
                referenceField: 'orders_status',
                value: 'completed',
                formatted: 'Completed',
            },
        ],
    },
];

describe('getPivotedColumns', () => {
    test('index columns inherit the unpivoted enrichment by reference', () => {
        const columns = getPivotedColumns(
            unpivotedColumns,
            pivotConfiguration,
            pivotValuesColumns,
            itemsMap,
        );
        expect(columns.orders_order_date).toBe(
            unpivotedColumns.orders_order_date,
        );
    });

    test('pivoted value columns carry source-metric metadata and a composed label', () => {
        const columns = getPivotedColumns(
            unpivotedColumns,
            pivotConfiguration,
            pivotValuesColumns,
            itemsMap,
        );
        expect(columns.orders_revenue_any_completed).toEqual({
            reference: 'orders_revenue_any_completed',
            type: DimensionType.NUMBER,
            label: 'Orders Revenue - Completed',
            format: '#,##0.###',
            provenance: { fieldId: 'orders_revenue' },
        });
    });

    test('value column types are derived from the aggregation and source item', () => {
        const lastOrderAtMetric: Metric = {
            ...revenueMetric,
            type: MetricType.MAX,
            name: 'last_order_at',
            label: 'Last order at',
            baseDimensionType: DimensionType.TIMESTAMP,
        };
        const isRepeatMetric: Metric = {
            ...revenueMetric,
            type: MetricType.BOOLEAN,
            name: 'is_repeat',
            label: 'Is repeat',
        };
        const typedItemsMap: ItemsMap = {
            ...itemsMap,
            orders_last_order_at: lastOrderAtMetric,
            orders_is_repeat: isRepeatMetric,
        };
        const typedValueColumns: PivotValuesColumn[] = [
            {
                referenceField: 'orders_last_order_at',
                pivotColumnName: 'orders_last_order_at_any_completed',
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [],
            },
            {
                referenceField: 'orders_is_repeat',
                pivotColumnName: 'orders_is_repeat_any_completed',
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [],
            },
            {
                // Numeric aggregations always produce NUMBER.
                referenceField: 'orders_last_order_at',
                pivotColumnName: 'orders_last_order_at_count_completed',
                aggregation: VizAggregationOptions.COUNT,
                pivotValues: [],
            },
        ];
        const columns = getPivotedColumns(
            unpivotedColumns,
            pivotConfiguration,
            typedValueColumns,
            typedItemsMap,
        );
        // A MAX metric's own type maps to NUMBER. Value-picking aggregations
        // report the base dimension type instead.
        expect(columns.orders_last_order_at_any_completed.type).toEqual(
            DimensionType.TIMESTAMP,
        );
        expect(columns.orders_is_repeat_any_completed.type).toEqual(
            DimensionType.BOOLEAN,
        );
        expect(columns.orders_last_order_at_count_completed.type).toEqual(
            DimensionType.NUMBER,
        );
    });

    test('an items map keyed by anything but getItemId throws', () => {
        // Metadata and the type derivation resolve their source item through
        // the same shared rule, so a mis-keyed producer map fails loudly
        // instead of silently dropping the metric's format and provenance.
        const misKeyedItemsMap: ItemsMap = {
            orders_revenue: { ...revenueMetric, name: 'other_revenue' },
        };
        expect(() =>
            getPivotedColumns(
                unpivotedColumns,
                pivotConfiguration,
                pivotValuesColumns,
                misKeyedItemsMap,
            ),
        ).toThrow('must be keyed by getItemId');
    });

    test('value columns without an items map get a reference-derived label and no provenance', () => {
        const columns = getPivotedColumns(
            unpivotedColumns,
            pivotConfiguration,
            pivotValuesColumns,
        );
        expect(columns.orders_revenue_any_completed).toEqual({
            reference: 'orders_revenue_any_completed',
            type: DimensionType.NUMBER,
            label: 'Orders revenue - Completed',
        });
    });
});
