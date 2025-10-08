import {
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
} from '../types/field';
import { type MetricQuery } from '../types/metricQuery';
import { ChartType, type CartesianChartConfig } from '../types/savedCharts';

// Items (fields) map derived from issue description
export const mockItems: ItemsMap = {
    customers_customer_id: {
        sql: '${TABLE}.customer_id',
        name: 'customer_id',
        type: DimensionType.STRING,
        index: 1,
        label: 'Customer ID',
        table: 'customers',
        groups: [],
        hidden: false,
        fieldType: FieldType.DIMENSION,
        tableLabel: 'Customers',
        description: 'Unique identifier for each customer',
    },
    payments_payment_method: {
        sql: '${TABLE}.payment_method',
        name: 'payment_method',
        type: DimensionType.STRING,
        index: 2,
        label: 'Payment method',
        table: 'payments',
        groups: [],
        hidden: false,
        fieldType: FieldType.DIMENSION,
        tableLabel: 'Payments',
        description: 'Method of payment used, for example credit card',
    },
    orders_status: {
        sql: '${TABLE}.status',
        name: 'status',
        type: DimensionType.STRING,
        index: 4,
        label: 'Status',
        table: 'orders',
        groups: [],
        hidden: false,
        fieldType: FieldType.DIMENSION,
        tableLabel: 'Orders',
        description:
            '# Order Status\n\nOrders can be one of the following statuses:\n\n| status         | description                                                                                                            |\n| -------------- | ---------------------------------------------------------------------------------------------------------------------- |\n| placed         | The order has been placed but has not yet left the warehouse                                                           |\n| shipped        | The order has ben shipped to the customer and is currently in transit                                                  |\n| completed      | The order has been received by the customer                                                                            |\n| return_pending | The customer has indicated that they would like to return the order, but it has not yet been received at the warehouse |\n| returned       | The order has been returned by the customer and received at the warehouse                                              |',
    },
    payments_total_revenue: {
        sql: '${TABLE}.amount',
        name: 'total_revenue',
        type: MetricType.SUM,
        index: 1,
        label: 'Total revenue',
        table: 'payments',
        groups: [],
        hidden: false,
        filters: [],
        fieldType: FieldType.METRIC,
        spotlight: {
            categories: [],
            visibility: 'show',
        },
        tableLabel: 'Payments',
        description: 'Sum of all payments',
        dimensionReference: 'payments_amount',
    },
};

export const mockMetricQuery: MetricQuery = {
    exploreName: 'payments',
    dimensions: ['payments_payment_method', 'orders_status'],
    metrics: ['payments_total_revenue'],
    filters: {},
    sorts: [
        {
            fieldId: 'payments_payment_method',
            descending: false,
        },
    ],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
    metricOverrides: {},
};

export const mockMetricQueryWithMultipleIndexColumns: MetricQuery = {
    exploreName: 'payments',
    dimensions: [
        'payments_payment_method',
        'orders_status',
        'customers_customer_id',
    ],
    metrics: ['payments_total_revenue'],
    filters: {},
    sorts: [
        {
            fieldId: 'payments_payment_method',
            descending: false,
        },
    ],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
    metricOverrides: {},
};

export const mockCartesianChartConfig: CartesianChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'payments_payment_method',
            yField: ['payments_total_revenue'],
        },
        eChartsConfig: {
            series: [],
        },
    },
};
