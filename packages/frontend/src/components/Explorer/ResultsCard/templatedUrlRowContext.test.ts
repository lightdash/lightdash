import {
    DimensionType,
    FieldType,
    MetricType,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildTemplatedUrlRowContext } from './templatedUrlRowContext';

const dimension = (table: string, name: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const metric = (table: string, name: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label: name,
    table,
    tableLabel: table,
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const items: ItemsMap = {
    customers_first_name: dimension('customers', 'first_name'),
    customers_customer_id: dimension('customers', 'customer_id'),
    orders_total_order_amount: metric('orders', 'total_order_amount'),
    calc_1: {
        name: 'calc_1',
        displayName: 'calc 1',
        sql: '1',
    } as TableCalculation,
    custom_1: { id: 'custom_1', name: 'custom 1' } as CustomDimension,
};
const getItem = (fieldId: string) => items[fieldId];

describe('buildTemplatedUrlRowContext', () => {
    it('nests values under row.<table>.<field> and lists the item ids present', () => {
        const context = buildTemplatedUrlRowContext(
            {
                customers_first_name: { raw: 'Ada', formatted: 'Ada' },
                customers_customer_id: { raw: 7, formatted: '7' },
                orders_total_order_amount: { raw: 32, formatted: '$32.00' },
            },
            getItem,
        );

        expect(context).toEqual({
            itemIdsInRow: [
                'customers_first_name',
                'customers_customer_id',
                'orders_total_order_amount',
            ],
            row: {
                customers: {
                    first_name: { raw: 'Ada', formatted: 'Ada' },
                    customer_id: { raw: 7, formatted: '7' },
                },
                orders: {
                    total_order_amount: { raw: 32, formatted: '$32.00' },
                },
            },
        });
    });

    it('skips unknown ids, non-field items and missing values', () => {
        const context = buildTemplatedUrlRowContext(
            {
                customers_first_name: { raw: 'Ada', formatted: 'Ada' },
                calc_1: { raw: 1, formatted: '1' },
                custom_1: { raw: 'x', formatted: 'x' },
                not_a_field: { raw: 'x', formatted: 'x' },
                customers_customer_id: undefined,
            },
            getItem,
        );

        expect(context).toEqual({
            itemIdsInRow: ['customers_first_name'],
            row: {
                customers: { first_name: { raw: 'Ada', formatted: 'Ada' } },
            },
        });
    });
});
