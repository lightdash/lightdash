import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { toResultRows } from './results';

const itemsMap: ItemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.status',
        hidden: false,
    } as Dimension,
    orders_revenue: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'revenue',
        label: 'Revenue',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.amount',
        hidden: false,
        format: 'usd',
    } as Metric,
};

describe('toResultRows', () => {
    test('formats raw values by their field', () => {
        const rows = toResultRows(
            [{ orders_status: 'completed', orders_revenue: 1234.5 }],
            itemsMap,
        );
        expect(rows).toEqual([
            {
                orders_status: {
                    value: { raw: 'completed', formatted: 'completed' },
                },
                orders_revenue: {
                    value: { raw: 1234.5, formatted: '$1,234.50' },
                },
            },
        ]);
    });

    test('keeps a formatted value the source already has', () => {
        const rows = toResultRows(
            [{ orders_revenue: 1234.5 }],
            itemsMap,
            (_row, fieldId) =>
                fieldId === 'orders_revenue' ? '1.2k' : undefined,
        );
        expect(rows[0].orders_revenue.value.formatted).toBe('1.2k');
    });

    test('formats a field it does not know as plain text', () => {
        const rows = toResultRows([{ unknown: 42 }], itemsMap);
        expect(rows[0].unknown.value).toEqual({ raw: 42, formatted: '42' });
    });
});
