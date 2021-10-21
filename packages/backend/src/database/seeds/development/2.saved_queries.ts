import { Knex } from 'knex';
import { DBChartTypes } from 'common';
import { createSavedQuery } from '../../entities/savedQueries';

export async function seed(knex: Knex): Promise<void> {
    // Deletes ALL existing entries
    await knex('saved_queries').del();

    // Get the project id
    const [{ project_uuid: projectUuid }] = await knex('projects')
        .select('*')
        .limit(1);

    // Inserts seed entries
    await createSavedQuery(projectUuid, {
        name: 'How much revenue do we have per payment method?',
        tableName: 'payments',
        metricQuery: {
            dimensions: ['payments_payment_method'],
            metrics: [
                'payments_total_revenue',
                'payments_unique_payment_count',
            ],
            filters: [],
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
            chartType: DBChartTypes.COLUMN,
            seriesLayout: {},
        },
        tableConfig: {
            columnOrder: [
                'payments_payment_method',
                'payments_total_revenue',
                'payments_unique_payment_count',
            ],
        },
    });

    await createSavedQuery(projectUuid, {
        name: "What's the average spend per customer?",
        tableName: 'orders',
        metricQuery: {
            dimensions: ['customers_customer_id'],
            metrics: ['orders_avg_amount'],
            filters: [],
            limit: 500,
            sorts: [{ fieldId: 'orders_avg_amount', descending: true }],
            tableCalculations: [],
        },
        chartConfig: {
            chartType: DBChartTypes.COLUMN,
            seriesLayout: {
                xDimension: 'customers_customer_id',
                yMetrics: ['orders_avg_amount'],
            },
        },
        tableConfig: {
            columnOrder: ['customers_customer_id', 'orders_avg_amount'],
        },
    });

    await createSavedQuery(projectUuid, {
        name: 'How many orders we have over time ?',
        tableName: 'orders',
        metricQuery: {
            dimensions: ['orders_order_date'],
            metrics: ['orders_unique_order_count'],
            filters: [],
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
            chartType: DBChartTypes.LINE,
            seriesLayout: {
                xDimension: 'orders_order_date',
                yMetrics: [
                    'orders_unique_order_count',
                    'cumulative_order_count',
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
