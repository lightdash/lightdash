import {
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
    type Metric,
    type ResultRow,
} from '@lightdash/common';

const statusDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
} as ItemsMap[string];

const regionDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'region',
    label: 'Region',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.region',
    hidden: false,
} as ItemsMap[string];

export const PIE_REVENUE_METRIC = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
} as Metric;

export const PIE_ITEMS_MAP: ItemsMap = {
    orders_status: statusDimension,
    orders_region: regionDimension,
    orders_revenue: PIE_REVENUE_METRIC,
};

const row = (status: string, region: string, revenue: number): ResultRow => ({
    orders_status: { value: { raw: status, formatted: status } },
    orders_region: { value: { raw: region, formatted: region } },
    orders_revenue: {
        value: { raw: revenue, formatted: String(revenue) },
    },
});

export const PIE_ROWS: ResultRow[] = [
    row('completed', 'EU', 100),
    row('completed', 'US', 50),
    row('pending', 'EU', 30),
    row('cancelled', 'US', 20),
];
