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

    test('columns without a matching item get only a label derived from the reference', () => {
        const columns = getUnpivotedColumns({}, warehouseFields, itemsMap);
        expect(columns.computed_col).toEqual({
            reference: 'computed_col',
            type: DimensionType.NUMBER,
            label: 'Computed col',
        });
    });

    test('items stored under other field ids never contribute metadata', () => {
        // An items map keyed `${table}_${column}` cannot match a bare column
        // reference, so the column falls back to a reference-derived label.
        const prefixedItemsMap: ItemsMap = {
            sql_query_explorer_payment_method: {
                ...statusDimension,
                name: 'payment_method',
                table: 'sql_query_explorer',
            },
        };
        const columns = getUnpivotedColumns(
            {},
            { payment_method: { type: DimensionType.STRING } },
            prefixedItemsMap,
        );
        expect(columns.payment_method).toEqual({
            reference: 'payment_method',
            type: DimensionType.STRING,
            label: 'Payment method',
        });
    });

    test('an items map keyed by anything but getItemId throws', () => {
        // A matching key whose item belongs to a different field id means the
        // producer keyed its map wrong; failing loudly beats silently losing
        // the field's metadata.
        const misKeyedItemsMap: ItemsMap = {
            payment_method: {
                ...statusDimension,
                name: 'payment_method',
                table: 'sql_query_explorer',
            },
        };
        expect(() =>
            getUnpivotedColumns(
                {},
                { payment_method: { type: DimensionType.STRING } },
                misKeyedItemsMap,
            ),
        ).toThrow('must be keyed by getItemId');
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

    test('columns get labels derived from their references when no items map is provided', () => {
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
