import {
    DimensionType,
    FieldType,
    formatRows,
    MetricType,
    VizAggregationOptions,
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

    test('formats exactly as the query API does, in its timezone', () => {
        const fields = {
            ...itemsMap,
            orders_created_at: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.TIMESTAMP,
                name: 'created_at',
                label: 'Created at',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '',
                hidden: false,
            } as Dimension,
            orders_order_date: {
                fieldType: FieldType.DIMENSION,
                type: DimensionType.DATE,
                name: 'order_date',
                label: 'Order date',
                table: 'orders',
                tableLabel: 'Orders',
                sql: '',
                hidden: false,
            } as Dimension,
        };
        const raw = [
            {
                orders_revenue: 1234.5,
                orders_created_at: '2024-03-01T23:30:00Z',
                orders_order_date: '2024-03-01',
            },
        ];

        for (const timezone of [undefined, 'America/New_York']) {
            expect(toResultRows(raw, fields, { timezone })).toEqual(
                formatRows(raw, fields, undefined, undefined, timezone),
            );
        }
        // A bare date is normalised the way the API sends it to the chart.
        expect(toResultRows(raw, fields)[0].orders_order_date.value.raw).toBe(
            '2024-03-01T00:00:00Z',
        );
    });

    test('formats a pivoted column as the field it pivots', () => {
        const rows = toResultRows(
            [{ orders_status: 'completed', orders_revenue_any_web: 1200.5 }],
            itemsMap,
            {
                pivotValuesColumns: [
                    {
                        referenceField: 'orders_revenue',
                        pivotColumnName: 'orders_revenue_any_web',
                        aggregation: VizAggregationOptions.ANY,
                        pivotValues: [
                            { referenceField: 'orders_channel', value: 'web' },
                        ],
                    },
                ],
            },
        );
        expect(rows[0].orders_revenue_any_web.value.formatted).toBe(
            '$1,200.50',
        );
    });

    test('formats a field it does not know as plain text', () => {
        const rows = toResultRows([{ unknown: 42 }], itemsMap);
        expect(rows[0].unknown.value).toEqual({ raw: 42, formatted: '42' });
    });

    test('formats by a minimal field definition', () => {
        const rows = toResultRows([{ revenue: 1200.5 }], {
            revenue: {
                fieldType: FieldType.METRIC,
                type: MetricType.SUM,
                label: 'Revenue',
                format: 'usd',
            },
        });
        expect(rows[0].revenue.value).toEqual({
            raw: 1200.5,
            formatted: '$1,200.50',
        });
    });
});
