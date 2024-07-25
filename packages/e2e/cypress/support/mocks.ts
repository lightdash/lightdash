import {
    ChartType,
    CreateDashboard,
    CreateSavedChart,
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

export const dashboardMock: CreateDashboard = {
    name: 'Create dashboard via API',
    tiles: [],
    tabs: [],
};
