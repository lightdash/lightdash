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

    test('value columns without an items map compose a friendly label and never provenance', () => {
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
