import {
    DimensionType,
    FieldType,
    MetricType,
    VizAggregationOptions,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
    type RawResultRow,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { type ChartData } from './chartData';

/**
 * A small "orders" explore shared by the package's end-to-end tests: two
 * string dimensions and two metrics, three rows.
 */

const dimension = (name: string, label: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const metric = (
    name: string,
    label: string,
    type: MetricType,
    format?: string,
): Metric => ({
    fieldType: FieldType.METRIC,
    type,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
    ...(format ? { format } : {}),
});

export const ordersItemsMap: ItemsMap = {
    orders_status: dimension('status', 'Status'),
    orders_channel: dimension('channel', 'Channel'),
    orders_revenue: metric('revenue', 'Revenue', MetricType.SUM, 'usd'),
    orders_count: metric('count', 'Orders', MetricType.COUNT),
};

export const ordersMetricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_channel'],
    metrics: ['orders_revenue', 'orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

export const ordersColumnOrder = [
    'orders_status',
    'orders_channel',
    'orders_revenue',
    'orders_count',
];

export const ordersRawRows: RawResultRow[] = [
    {
        orders_status: 'completed',
        orders_channel: 'web',
        orders_revenue: 1200.5,
        orders_count: 12,
    },
    {
        orders_status: 'shipped',
        orders_channel: 'web',
        orders_revenue: 800,
        orders_count: 8,
    },
    {
        orders_status: 'completed',
        orders_channel: 'store',
        orders_revenue: 300,
        orders_count: 3,
    },
];

const cell = (raw: unknown, formatted: string) => ({
    value: { raw, formatted },
});

export const ordersRows: ResultRow[] = [
    {
        orders_status: cell('completed', 'completed'),
        orders_channel: cell('web', 'web'),
        orders_revenue: cell(1200.5, '$1,200.50'),
        orders_count: cell(12, '12'),
    },
    {
        orders_status: cell('shipped', 'shipped'),
        orders_channel: cell('web', 'web'),
        orders_revenue: cell(800, '$800.00'),
        orders_count: cell(8, '8'),
    },
    {
        orders_status: cell('completed', 'completed'),
        orders_channel: cell('store', 'store'),
        orders_revenue: cell(300, '$300.00'),
        orders_count: cell(3, '3'),
    },
];

export const ordersResults = {
    rows: ordersRows,
    metricQuery: ordersMetricQuery,
};

/** The orders as a chart's data. */
export const ordersData: ChartData = {
    rows: ordersRows,
    fields: ordersItemsMap,
    query: ordersMetricQuery,
};

export const palette = ['#111111', '#222222', '#333333', '#444444'];

/**
 * The same orders pivoted by channel, as the query API answers a pivoted
 * query: one revenue column per channel, and the pivot details that map
 * each column back to its field and pivot value.
 */
export const ordersPivotDetails: NonNullable<
    ReadyQueryResultsPage['pivotDetails']
> = {
    totalColumnCount: 2,
    indexColumn: undefined,
    groupByColumns: [{ reference: 'orders_channel' }],
    sortBy: undefined,
    originalColumns: {},
    valuesColumns: ['web', 'store'].map((channel) => ({
        referenceField: 'orders_revenue',
        pivotColumnName: `orders_revenue_any_${channel}`,
        aggregation: VizAggregationOptions.ANY,
        pivotValues: [{ referenceField: 'orders_channel', value: channel }],
    })),
};

export const ordersPivotedRows: ResultRow[] = [
    {
        orders_status: cell('completed', 'completed'),
        orders_revenue_any_web: cell(1200.5, '$1,200.50'),
        orders_revenue_any_store: cell(300, '$300.00'),
    },
    {
        orders_status: cell('shipped', 'shipped'),
        orders_revenue_any_web: cell(800, '$800.00'),
        orders_revenue_any_store: cell(0, '$0.00'),
    },
];

export const ordersPivotedResults = {
    rows: ordersPivotedRows,
    metricQuery: ordersMetricQuery,
    pivotDetails: ordersPivotDetails,
};

export const ordersPivotedData: ChartData = {
    ...ordersData,
    rows: ordersPivotedRows,
    pivotDetails: ordersPivotDetails,
};
