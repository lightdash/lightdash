import { SavedChartDAO } from '@lightdash/common';
import { createRenameFactory } from './rename';

export const tableRename = createRenameFactory({
    from: 'payment',
    to: 'invoice',
    fromReference: 'payment',
    toReference: 'invoice',
    isPrefix: true,
    fromFieldName: undefined,
    toFieldName: undefined,
});

export const fieldRename = createRenameFactory({
    from: 'customer_id',
    to: 'customer_user_id',
    fromReference: 'customer.id',
    toReference: 'customer.user_id',
    isPrefix: false,
    fromFieldName: 'id',
    toFieldName: 'user_id',
});

// TO replace order_status with orders_order_type
export const chartMocked = {
    uuid: 'cf24cd76-d7b0-424d-b482-02d886b77afc',
    projectUuid: '7ec16145-5988-467e-a64d-24acae3851b2',
    name: 'custom metric filter',
    description: undefined,
    tableName: 'orders',
    updatedAt: new Date('2025-03-06T15:00:10.664Z'),
    updatedByUser: {
        userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
        firstName: 'David',
        lastName: 'Attenborough',
    },
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status', 'orders_order_date_week'],
        metrics: ['orders_status_count_distinct_of_status'],
        filters: {
            metrics: {
                id: '1bfd5c88-87d1-4296-8076-588f4a12aac5',
                and: [
                    {
                        id: '4d9840bf-8bd2-480c-afe3-36d7bc75c626',
                        target: {
                            fieldId: 'orders_status_count_distinct_of_status',
                        },
                        values: ['1'],
                        operator: 'equals',
                    },
                ],
            },
        },
        sorts: [],
        limit: 500,
        metricOverrides: {},
        tableCalculations: [
            {
                name: 'table_calc',
                displayName: 'table calc',
                sql: '${orders.status}',
                format: {
                    type: 'default',
                    currency: 'USD',
                    separator: 'default',
                },
                type: 'number',
            },
        ],
        additionalMetrics: [
            {
                name: 'status_count_distinct_of_status',
                label: 'Count distinct of Status',
                description: 'Count distinct of Status on the table Orders ',
                uuid: 'be81c625-06ec-48e2-bff4-7c5de8d8818f',
                sql: '${TABLE}.status',
                table: 'orders',
                type: 'count_distinct',
                baseDimensionName: 'status',
                formatOptions: {
                    type: 'default',
                    separator: 'default',
                },
                filters: [
                    {
                        id: '954711ae-88e0-4b24-9b27-47a676597b18',
                        target: {
                            fieldRef: 'orders.status',
                        },
                        values: ['completed'],
                        operator: 'equals',
                    },
                ],
            },
        ],
        customDimensions: [
            {
                id: 'order status',
                name: 'order status',
                type: 'sql',
                table: 'orders',
                sql: '${orders.status}',
                dimensionType: 'string',
            },
        ],
    },
    chartConfig: {
        type: 'cartesian',
        config: {
            layout: {
                xField: 'orders_order_date_week',
                yField: ['orders_status_count_distinct_of_status'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_status',
                                        value: 'completed',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_status',
                                        value: 'placed',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_status',
                                        value: 'returned',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_status',
                                        value: 'return_pending',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_status',
                                        value: 'shipped',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                ],
            },
        },
    },
    tableConfig: {
        columnOrder: [
            'orders_status',
            'orders_order_date_week',
            'orders_status_count_distinct_of_status',
        ],
    },
    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    pivotConfig: {
        columns: ['orders_status'],
    },
    spaceUuid: '22b8518f-6142-42dc-94e6-279fb8f3b515',
    spaceName: 'Jaffle shop',
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: null,
    dashboardName: null,
    colorPalette: ['#7162FF'],
    slug: 'custom-metric-filter',
} as SavedChartDAO;

export const expectedRenamedChartMocked = {
    uuid: 'cf24cd76-d7b0-424d-b482-02d886b77afc',
    projectUuid: '7ec16145-5988-467e-a64d-24acae3851b2',
    name: 'custom metric filter',
    description: undefined,
    tableName: 'orders',
    updatedAt: new Date('2025-03-06T15:00:10.664Z'),
    updatedByUser: {
        userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
        firstName: 'David',
        lastName: 'Attenborough',
    },
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_order_type', 'orders_order_date_week'],
        metrics: [
            'orders_status_count_distinct_of_status', // This is an additional metric name, we don't change that
        ],
        filters: {
            metrics: {
                id: '1bfd5c88-87d1-4296-8076-588f4a12aac5',
                and: [
                    {
                        id: '4d9840bf-8bd2-480c-afe3-36d7bc75c626',
                        target: {
                            fieldId: 'orders_status_count_distinct_of_status',
                        },
                        values: ['1'],
                        operator: 'equals',
                    },
                ],
            },
        },
        sorts: [],
        limit: 500,
        metricOverrides: {},
        tableCalculations: [
            {
                name: 'table_calc',
                displayName: 'table calc',
                sql: '${orders.order_type}',
                format: {
                    type: 'default',
                    currency: 'USD',
                    separator: 'default',
                },
                type: 'number',
            },
        ],
        additionalMetrics: [
            {
                name: 'status_count_distinct_of_status',
                label: 'Count distinct of Status',
                description: 'Count distinct of Status on the table Orders ',
                uuid: 'be81c625-06ec-48e2-bff4-7c5de8d8818f',
                sql: '${TABLE}.order_type',
                table: 'orders',
                type: 'count_distinct',
                baseDimensionName: 'order_type',
                formatOptions: {
                    type: 'default',
                    separator: 'default',
                },
                filters: [
                    {
                        id: '954711ae-88e0-4b24-9b27-47a676597b18',
                        target: {
                            fieldRef: 'orders.order_type',
                        },
                        values: ['completed'],
                        operator: 'equals',
                    },
                ],
            },
        ],
        customDimensions: [
            {
                id: 'order status',
                name: 'order status',
                type: 'sql',
                table: 'orders',
                sql: '${orders.order_type}',
                dimensionType: 'string',
            },
        ],
    },
    chartConfig: {
        type: 'cartesian',
        config: {
            layout: {
                xField: 'orders_order_date_week',
                yField: ['orders_status_count_distinct_of_status'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_order_type',
                                        value: 'completed',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_order_type',
                                        value: 'placed',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_order_type',
                                        value: 'returned',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_order_type',
                                        value: 'return_pending',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                    {
                        type: 'bar',
                        encode: {
                            xRef: {
                                field: 'orders_order_date_week',
                            },
                            yRef: {
                                field: 'orders_status_count_distinct_of_status',
                                pivotValues: [
                                    {
                                        field: 'orders_order_type',
                                        value: 'shipped',
                                    },
                                ],
                            },
                        },
                        yAxisIndex: 0,
                        isFilteredOut: false,
                    },
                ],
            },
        },
    },
    tableConfig: {
        columnOrder: [
            'orders_order_type',
            'orders_order_date_week',
            'orders_status_count_distinct_of_status',
        ],
    },
    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    pivotConfig: {
        columns: ['orders_order_type'],
    },
    spaceUuid: '22b8518f-6142-42dc-94e6-279fb8f3b515',
    spaceName: 'Jaffle shop',
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: null,
    dashboardName: null,
    colorPalette: ['#7162FF'],
    slug: 'custom-metric-filter',
} as SavedChartDAO;
