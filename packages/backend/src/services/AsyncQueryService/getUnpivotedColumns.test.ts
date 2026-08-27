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

    test('columns without a matching item get a friendly label and nothing else', () => {
        const columns = getUnpivotedColumns({}, warehouseFields, itemsMap);
        expect(columns.computed_col).toEqual({
            reference: 'computed_col',
            type: DimensionType.NUMBER,
            label: 'Computed col',
        });
    });

    test('raw SQL columns never enrich from virtual-view items (PROD-9832)', () => {
        // SqlQueryComposer keys its items map `${table}_${column}` while raw
        // SQL warehouse columns use bare names — and even a bare-keyed map
        // must not stamp provenance, because the item's identity is not the
        // column reference.
        const virtualViewItemsMap: ItemsMap = {
            sql_query_explorer_payment_method: {
                ...statusDimension,
                name: 'payment_method',
                table: 'sql_query_explorer',
            },
            payment_method: {
                ...statusDimension,
                name: 'payment_method',
                table: 'sql_query_explorer',
            },
        };
        const columns = getUnpivotedColumns(
            {},
            { payment_method: { type: DimensionType.STRING } },
            virtualViewItemsMap,
        );
        expect(columns.payment_method).toEqual({
            reference: 'payment_method',
            type: DimensionType.STRING,
            label: 'Payment method',
        });
    });

    test('parameter placeholders interpolate against used parameter values', () => {
        const parameterisedItemsMap: ItemsMap = {
            orders_revenue: {
                ...revenueMetric,
                format: '${ld.parameters.currency=="usd"?"$":"€"}0.00',
            },
        };
        const withValues = getUnpivotedColumns(
            {},
            { orders_revenue: { type: DimensionType.NUMBER } },
            parameterisedItemsMap,
            { currency: 'usd' },
        );
        expect(withValues.orders_revenue.format).toEqual('$0.00');

        // No values persisted (pre-migration rows) → format omitted.
        const withoutValues = getUnpivotedColumns(
            {},
            { orders_revenue: { type: DimensionType.NUMBER } },
            parameterisedItemsMap,
            null,
        );
        expect(withoutValues.orders_revenue.format).toBeUndefined();
    });

    test('columns get friendly labels when no items map is provided', () => {
        const columns = getUnpivotedColumns({}, warehouseFields);
        expect(columns.orders_status).toEqual({
            reference: 'orders_status',
            type: DimensionType.STRING,
            label: 'Orders status',
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
