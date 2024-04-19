import { type ApiQueryResults } from '../../index';
import { type MetricQuery } from '../../types/metricQuery';
import { type BarVizConfig, type TableConfig } from '../VizConfigTransformers';

export const mockRows = [
    {
        orders_status: {
            value: {
                raw: 'completed',
                formatted: 'Completed',
            },
        },
        orders_order_date_week: {
            value: {
                raw: 1,
                formatted: '1',
            },
        },
        orders_average_order_size: {
            value: {
                raw: 5,
                formatted: '5',
            },
        },
    },
    {
        orders_status: {
            value: {
                raw: 'incomplete',
                formatted: 'Incomplete',
            },
        },
        orders_order_date_week: {
            value: {
                raw: 3,
                formatted: '3',
            },
        },
        orders_average_order_size: {
            value: {
                raw: 7,
                formatted: '7',
            },
        },
    },
];

export const metricQuery: MetricQuery = {
    limit: 25,
    sorts: [],
    filters: {},
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_order_date_week'],
    metrics: ['orders_average_order_size'],
    tableCalculations: [],
    customDimensions: [],
};

export const results: ApiQueryResults = {
    metricQuery,
    rows: mockRows,
    fields: {},
    cacheMetadata: {
        cacheHit: false,
    },
};

export const barVizConfig: BarVizConfig = {
    type: 'bar',
    xAxis: {
        type: 'categorical', // We should decide how rigorous to be with this. Vega uses nominal by default.
        fieldId: 'orders_status',
        label: 'Orders Status',
        sort: 'asc',
        position: 'left',
        gridLines: true,
        axisTicks: [],
    },
    yAxis: [
        {
            type: 'linear',
            fieldId: 'orders_average_order_size',
            label: 'Orders average order size',
            sort: 'asc',
            position: 'left',
            gridLines: true,
            axisTicks: [],
        },
    ],
    series: [],
};

export const TableVizConfig: TableConfig = {
    type: 'table',
    showColumnCalculation: false,
    showRowCalculation: false,
    showTableNames: false,
    hideRowNumbers: true,
    showResultsTotal: false,
    columns: {
        orders_status: {
            visible: true,
            name: 'Orders Status',
            frozen: false,
        },
        orders_order_date_week: {
            visible: true,
            name: 'Orders Order Date Week',
            frozen: false,
        },
        orders_average_order_size: {
            visible: true,
            name: 'Orders Average Order Size',
            frozen: false,
        },
    },
};
