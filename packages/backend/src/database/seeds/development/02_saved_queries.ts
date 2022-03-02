import { CartesianSeriesType, ChartType, SEED_PROJECT } from 'common';
import { Knex } from 'knex';
import { savedChartModel } from '../../../models/models';

export async function seed(knex: Knex): Promise<void> {
    // Deletes ALL existing entries
    await knex('saved_queries').del();

    // Inserts seed entries
    await savedChartModel.create(SEED_PROJECT.project_uuid, {
        name: 'How much revenue do we have per payment method?',
        tableName: 'payments',
        metricQuery: {
            dimensions: ['payments_payment_method'],
            metrics: [
                'payments_total_revenue',
                'payments_unique_payment_count',
            ],
            filters: {},
            sorts: [
                {
                    fieldId: 'payments_total_revenue',
                    descending: false,
                },
            ],
            limit: 10,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        flipAxes: true,
                        xField: 'payments_payment_method',
                        yField: 'payments_total_revenue',
                    },
                    {
                        type: CartesianSeriesType.BAR,
                        flipAxes: true,
                        xField: 'payments_payment_method',
                        yField: 'payments_unique_payment_count',
                    },
                ],
            },
        },
        tableConfig: {
            columnOrder: [
                'payments_payment_method',
                'payments_total_revenue',
                'payments_unique_payment_count',
            ],
        },
    });

    await savedChartModel.create(SEED_PROJECT.project_uuid, {
        name: "What's the average spend per customer?",
        tableName: 'orders',
        metricQuery: {
            dimensions: ['customers_customer_id'],
            metrics: ['orders_avg_amount'],
            filters: {},
            limit: 500,
            sorts: [{ fieldId: 'orders_avg_amount', descending: true }],
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                series: [
                    {
                        flipAxes: true,
                        type: CartesianSeriesType.BAR,
                        xField: 'customers_customer_id',
                        yField: 'orders_avg_amount',
                    },
                ],
            },
        },
        tableConfig: {
            columnOrder: ['customers_customer_id', 'orders_avg_amount'],
        },
    });

    await savedChartModel.create(SEED_PROJECT.project_uuid, {
        name: 'How many orders we have over time ?',
        tableName: 'orders',
        metricQuery: {
            dimensions: ['orders_order_date'],
            metrics: ['orders_unique_order_count'],
            filters: {},
            limit: 500,
            sorts: [
                {
                    fieldId: 'orders_order_date',
                    descending: false,
                },
            ],
            tableCalculations: [
                {
                    name: 'cumulative_order_count',
                    displayName: 'Cumulative order count',
                    sql: 'SUM(${orders.unique_order_count})\nOVER(ORDER BY ${orders.order_date})',
                },
            ],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                series: [
                    {
                        type: CartesianSeriesType.LINE,
                        xField: 'orders_order_date',
                        yField: 'orders_unique_order_count',
                    },
                    {
                        type: CartesianSeriesType.LINE,
                        xField: 'orders_order_date',
                        yField: 'cumulative_order_count',
                    },
                ],
            },
        },
        tableConfig: {
            columnOrder: [
                'orders_order_date',
                'orders_unique_order_count',
                'cumulative_order_count',
            ],
        },
    });
}
