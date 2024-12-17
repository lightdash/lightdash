import {
    BinType,
    CartesianSeriesType,
    ChartAsCode,
    ChartType,
    CreateDashboard,
    CreateSavedChart,
    CustomDimensionType,
} from '@lightdash/common';

export const chartMock: CreateSavedChart = {
    name: 'chart in dashboard',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_average_order_size'],
        filters: {},
        sorts: [],
        limit: 1,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.TABLE,
    },
    tableConfig: {
        columnOrder: [],
    },
};

export const chartAsCode: ChartAsCode = {
    name: 'How do payment methods vary across different amount ranges?',
    description: 'Payment range by amount',
    tableName: 'payments',
    updatedAt: new Date('2024-12-17T11:04:43.216Z'),
    metricQuery: {
        exploreName: 'payments',
        dimensions: ['amount_range', 'payments_payment_method'],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [
            {
                fieldId: 'orders_total_order_amount',
                descending: true,
            },
        ],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [
            {
                id: 'amount_range',
                name: 'amount range',
                type: CustomDimensionType.BIN,
                dimensionId: 'payments_amount',
                table: 'payments',
                binType: BinType.FIXED_NUMBER,
                binNumber: 5,
            },
        ],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'amount_range',
                yField: ['orders_total_order_amount'],
                flipAxes: false,
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        encode: {
                            xRef: {
                                field: 'amount_range',
                            },
                            yRef: {
                                field: 'orders_total_order_amount',
                            },
                        },
                        yAxisIndex: 0,
                    },
                ],
            },
        },
    },
    dashboardUuid: null,
    slug: 'how-do-payment-methods-vary-across-different-amount-ranges',
    tableConfig: {
        columnOrder: [
            'amount_range',
            'amount range',
            'orders_total_order_amount',
            'payments_payment_method',
        ],
    },
    spaceSlug: 'jaffle-shop',
    version: 1,
    downloadedAt: new Date('2024-12-17T11:06:55.912Z'),
};

export const dashboardMock: CreateDashboard = {
    name: 'Create dashboard via API',
    tiles: [],
    tabs: [],
};
