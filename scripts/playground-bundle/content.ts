import {
    CartesianSeriesType,
    ChartType,
    DashboardTileTypes,
} from '@lightdash/common';
import { type PlaygroundContent } from '../../packages/backend/src/ee/services/ProjectService/playgroundContentTypes';

export const playgroundContent = {
    version: 1,
    space: {
        name: 'Jaffle Shop',
        path: 'jaffle-shop',
    },
    charts: [
        {
            key: 'orders-over-time',
            slug: 'orders-over-time',
            name: 'Orders over time',
            description: 'Monthly order volume',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_unique_order_count'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_date_month',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_month',
                        yField: ['orders_unique_order_count'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                encode: {
                                    xRef: {
                                        field: 'orders_order_date_month',
                                    },
                                    yRef: {
                                        field: 'orders_unique_order_count',
                                    },
                                },
                                type: CartesianSeriesType.LINE,
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_unique_order_count',
                ],
            },
        },
        {
            key: 'revenue-by-payment-method',
            slug: 'revenue-by-payment-method',
            name: 'Revenue by payment method',
            description: 'Revenue split across each payment method',
            tableName: 'payments',
            metricQuery: {
                exploreName: 'payments',
                dimensions: ['payments_payment_method'],
                metrics: ['payments_total_revenue'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'payments_total_revenue',
                        descending: true,
                    },
                ],
                limit: 10,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        flipAxes: true,
                        xField: 'payments_payment_method',
                        yField: ['payments_total_revenue'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                encode: {
                                    xRef: {
                                        field: 'payments_payment_method',
                                    },
                                    yRef: {
                                        field: 'payments_total_revenue',
                                    },
                                },
                                type: CartesianSeriesType.BAR,
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'payments_payment_method',
                    'payments_total_revenue',
                ],
            },
        },
        {
            key: 'top-customers',
            slug: 'top-customers',
            name: 'Top customers',
            description: 'Customers ranked by total revenue',
            tableName: 'payments',
            metricQuery: {
                exploreName: 'payments',
                dimensions: ['customers_first_name', 'customers_last_name'],
                metrics: ['payments_total_revenue'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'payments_total_revenue',
                        descending: true,
                    },
                ],
                limit: 10,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: false,
                    showRowCalculation: false,
                    showColumnCalculation: false,
                    showResultsTotal: false,
                    columns: {},
                    hideRowNumbers: false,
                    metricsAsRows: false,
                },
            },
            tableConfig: {
                columnOrder: [
                    'customers_first_name',
                    'customers_last_name',
                    'payments_total_revenue',
                ],
            },
        },
    ],
    dashboard: {
        slug: 'jaffle-shop-overview',
        name: 'Jaffle Shop overview',
        description: 'A quick view of revenue, orders, and customers',
        filters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        tabs: [
            {
                uuid: '374f7998-89a9-43e1-baf3-17bcedd065e7',
                name: 'Orders trend',
                order: 0,
            },
            {
                uuid: 'c7ea28b5-e85f-45bb-b68a-824fe4b06150',
                name: 'Revenue split',
                order: 1,
            },
            {
                uuid: '8bbe2066-c17a-4688-97fe-00b46766986e',
                name: 'Top customers',
                order: 2,
            },
        ],
        tiles: [
            {
                type: DashboardTileTypes.HEADING,
                x: 0,
                y: 0,
                w: 36,
                h: 3,
                tabUuid: '374f7998-89a9-43e1-baf3-17bcedd065e7',
                properties: {
                    text: 'Jaffle Shop performance',
                    showDivider: true,
                },
            },
            {
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 3,
                w: 36,
                h: 14,
                tabUuid: '374f7998-89a9-43e1-baf3-17bcedd065e7',
                properties: {
                    chartKey: 'orders-over-time',
                },
            },
            {
                type: DashboardTileTypes.HEADING,
                x: 0,
                y: 0,
                w: 36,
                h: 3,
                tabUuid: 'c7ea28b5-e85f-45bb-b68a-824fe4b06150',
                properties: {
                    text: 'Jaffle Shop performance',
                    showDivider: true,
                },
            },
            {
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 3,
                w: 36,
                h: 14,
                tabUuid: 'c7ea28b5-e85f-45bb-b68a-824fe4b06150',
                properties: {
                    chartKey: 'revenue-by-payment-method',
                },
            },
            {
                type: DashboardTileTypes.HEADING,
                x: 0,
                y: 0,
                w: 36,
                h: 3,
                tabUuid: '8bbe2066-c17a-4688-97fe-00b46766986e',
                properties: {
                    text: 'Jaffle Shop performance',
                    showDivider: true,
                },
            },
            {
                type: DashboardTileTypes.SAVED_CHART,
                x: 0,
                y: 3,
                w: 36,
                h: 14,
                tabUuid: '8bbe2066-c17a-4688-97fe-00b46766986e',
                properties: {
                    chartKey: 'top-customers',
                },
            },
        ],
    },
} satisfies PlaygroundContent;
