import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
} from '@lightdash/common';
import { getUnpivotedColumns } from './getUnpivotedColumns';

const statusDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
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
    orders_status: statusDimension,
    orders_revenue: revenueMetric,
};

const warehouseFields = {
    orders_status: { type: DimensionType.STRING },
    orders_revenue: { type: DimensionType.NUMBER },
    computed_col: { type: DimensionType.NUMBER },
};

describe('getUnpivotedColumns', () => {
    test('enriches columns whose reference matches an item in the items map', () => {
        const columns = getUnpivotedColumns({}, warehouseFields, itemsMap);
        expect(columns.orders_status).toEqual({
            reference: 'orders_status',
            type: DimensionType.STRING,
            label: 'Orders Status',
            provenance: { fieldId: 'orders_status' },
        });
        expect(columns.orders_revenue).toEqual({
            reference: 'orders_revenue',
            type: DimensionType.NUMBER,
            label: 'Orders Revenue',
            format: '#,##0.###',
            provenance: { fieldId: 'orders_revenue' },
        });
    });

    test('columns without a matching item stay bare', () => {
        const columns = getUnpivotedColumns({}, warehouseFields, itemsMap);
        expect(columns.computed_col).toEqual({
            reference: 'computed_col',
            type: DimensionType.NUMBER,
        });
    });

    test('columns are bare when no items map is provided', () => {
        const columns = getUnpivotedColumns({}, warehouseFields);
        expect(columns.orders_status).toEqual({
            reference: 'orders_status',
            type: DimensionType.STRING,
        });
    });

    test('already-captured columns are returned untouched', () => {
        const existing = {
            foo: { reference: 'foo', type: DimensionType.STRING },
        };
        expect(getUnpivotedColumns(existing, warehouseFields, itemsMap)).toBe(
            existing,
        );
    });
});
