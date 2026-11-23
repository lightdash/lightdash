import { ChartType, type ChartAsCode, type Explore } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartFieldErrors } from './chartFieldErrors';

const field = (name: string, fieldType: 'dimension' | 'metric') => ({
    name,
    table: 'orders',
    fieldType,
    hidden: false,
});

const explore = {
    name: 'orders',
    tables: {
        orders: {
            name: 'orders',
            dimensions: {
                status: field('status', 'dimension'),
                order_date_month: field('order_date_month', 'dimension'),
            },
            metrics: {
                total_order_amount: field('total_order_amount', 'metric'),
            },
        },
    },
} as unknown as Explore;

const chart = (
    metricQuery: Partial<ChartAsCode['metricQuery']>,
    layout = { xField: 'orders_status', yField: ['orders_total_order_amount'] },
) =>
    ({
        slug: 'c',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total_order_amount'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            ...metricQuery,
        },
        chartConfig: { type: ChartType.CARTESIAN, config: { layout } },
    }) as unknown as ChartAsCode;

describe('getChartFieldErrors', () => {
    it('accepts a chart whose fields exist', () => {
        expect(getChartFieldErrors(chart({}), explore)).toEqual([]);
    });

    it('names unknown ids in the query, sorts, filters and layout with the closest ids', () => {
        const errors = getChartFieldErrors(
            chart(
                {
                    metrics: ['orders_total_amount'],
                    sorts: [
                        { fieldId: 'orders_total_amount', descending: true },
                    ],
                    filters: {
                        dimensions: {
                            id: 'g',
                            and: [
                                {
                                    id: 'r',
                                    target: { fieldId: 'orders_state' },
                                    operator: 'equals',
                                    values: ['x'],
                                },
                            ],
                        },
                    } as unknown as ChartAsCode['metricQuery']['filters'],
                },
                { xField: 'orders_status', yField: ['orders_total_amount'] },
            ),
            explore,
        );
        expect(errors).toEqual([
            '"orders_total_amount" is not a field of explore "orders" (closest: orders_total_order_amount, orders_order_date_month, orders_status).',
            '"orders_state" is not a field of explore "orders" (closest: orders_order_date_month, orders_status, orders_total_order_amount).',
        ]);
    });

    it('flags a metric listed as a dimension', () => {
        expect(
            getChartFieldErrors(
                chart({
                    dimensions: ['orders_status', 'orders_total_order_amount'],
                }),
                explore,
            ),
        ).toEqual([
            'metricQuery.dimensions has "orders_total_order_amount", which is not a dimension (closest: orders_order_date_month, orders_status).',
        ]);
    });
});
