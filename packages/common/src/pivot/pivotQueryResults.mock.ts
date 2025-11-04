import { type ItemsMap, type ReadyQueryResultsPage } from '../index';
import {
    CustomFormatType,
    DimensionType,
    FieldType,
    MetricType,
} from '../types/field';
import { type MetricQuery } from '../types/metricQuery';
import { type PivotData } from '../types/pivot';
import { type ResultRow } from '../types/results';
import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '../visualizations/types';

export const METRIC_QUERY_2DIM_2METRIC: Pick<
    MetricQuery,
    'metrics' | 'dimensions' | 'tableCalculations' | 'additionalMetrics'
> = {
    metrics: ['views', 'devices'],
    dimensions: ['page', 'site'],
    tableCalculations: [],
};

export const RESULT_ROWS_2DIM_2METRIC: ResultRow[] = [
    {
        page: { value: { raw: '/home', formatted: '/home' } },
        site: { value: { raw: 'blog', formatted: 'Blog' } },
        views: { value: { raw: 6, formatted: '6.0' } },
        devices: { value: { raw: 7, formatted: '7.0' } },
    },
    {
        page: { value: { raw: '/about', formatted: '/about' } },
        site: { value: { raw: 'blog', formatted: 'Blog' } },
        views: { value: { raw: 12, formatted: '12.0' } },
        devices: { value: { raw: 0, formatted: '0.0' } },
    },
    {
        page: { value: { raw: '/first-post', formatted: '/first-post' } },
        site: { value: { raw: 'blog', formatted: 'Blog' } },
        views: { value: { raw: 11, formatted: '11.0' } },
        devices: { value: { raw: 1, formatted: '1.0' } },
    },
    {
        page: { value: { raw: '/home', formatted: '/home' } },
        site: { value: { raw: 'docs', formatted: 'Docs' } },
        views: { value: { raw: 2, formatted: '2.0' } },
        devices: { value: { raw: 10, formatted: '10.0' } },
    },
    {
        page: { value: { raw: '/about', formatted: '/about' } },
        site: { value: { raw: 'docs', formatted: 'Docs' } },
        views: { value: { raw: 2, formatted: '2.0' } },
        devices: { value: { raw: 13, formatted: '13.0' } },
    },
];

export const METRIC_QUERY_1DIM_2METRIC: Pick<
    MetricQuery,
    'metrics' | 'dimensions' | 'tableCalculations' | 'additionalMetrics'
> = {
    metrics: ['views', 'devices'],
    dimensions: ['page'],
    tableCalculations: [],
};

export const RESULT_ROWS_1DIM_2METRIC: ResultRow[] = [
    {
        page: { value: { raw: '/home', formatted: '/home' } },
        views: { value: { raw: 6, formatted: '6.0' } },
        devices: { value: { raw: 7, formatted: '7.0' } },
    },
    {
        page: { value: { raw: '/about', formatted: '/about' } },
        views: { value: { raw: 12, formatted: '12.0' } },
        devices: { value: { raw: 0, formatted: '0.0' } },
    },
    {
        page: { value: { raw: '/first-post', formatted: '/first-post' } },
        views: { value: { raw: 11, formatted: '11.0' } },
        devices: { value: { raw: 1, formatted: '1.0' } },
    },
];

export const METRIC_QUERY_0DIM_2METRIC: Pick<
    MetricQuery,
    'metrics' | 'dimensions' | 'tableCalculations' | 'additionalMetrics'
> = {
    metrics: ['views', 'devices'],
    dimensions: [],
    tableCalculations: [],
};

export const RESULT_ROWS_0DIM_2METRIC: ResultRow[] = [
    {
        views: { value: { raw: 6, formatted: '6.0' } },
        devices: { value: { raw: 7, formatted: '7.0' } },
    },
];

export const getFieldMock = (fieldId: string): ItemsMap[string] | undefined => {
    if (fieldId === 'orders_is_completed') {
        return {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.BOOLEAN,
            name: 'is_completed',
            label: 'Is completed',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.is_completed',
            hidden: false,
        };
    }
    if (fieldId === 'payments_payment_method') {
        return {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            name: 'payment_method',
            label: 'Payment Method',
            table: 'payments',
            tableLabel: 'Payments',
            sql: '${TABLE}.payment_method',
            hidden: false,
        };
    }
    if (fieldId === 'orders_order_date_year') {
        return {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.TIMESTAMP,
            name: 'order_date_year',
            label: 'Order Date Year',
            table: 'orders',
            tableLabel: 'Orders',
            sql: '${TABLE}.order_date_year',
            hidden: false,
        };
    }
    if (fieldId === 'payments_total_revenue') {
        return {
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name: 'total_revenue',
            label: 'Total Revenue',
            table: 'payments',
            tableLabel: 'Payments',
            sql: 'SUM(${TABLE}.amount)',
            hidden: false,
        };
    }
    if (fieldId === 'orders_total_order_amount') {
        return {
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name: 'total_order_amount',
            label: 'Order Amount',
            table: 'orders',
            tableLabel: 'Orders',
            sql: 'SUM(${TABLE}.amount)',
            hidden: false,
            format: CustomFormatType.CURRENCY,
        };
    }
    if (fieldId === 'orders_average_order_size') {
        return {
            fieldType: FieldType.METRIC,
            type: MetricType.AVERAGE,
            name: 'average_order_size',
            label: 'Average Order Size',
            table: 'orders',
            tableLabel: 'Orders',
            sql: 'AVG(${TABLE}.amount)',
            hidden: false,
            format: CustomFormatType.CURRENCY,
        };
    }

    // default
    return undefined;
};

export const NON_PIVOTED_ROWS: ResultRow[] = [
    {
        payments_payment_method: {
            value: {
                raw: 'bank_transfer',
                formatted: 'bank_transfer',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 493.78,
                formatted: '493.78',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'coupon',
                formatted: 'coupon',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 125.64,
                formatted: '125.64',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'credit_card',
                formatted: 'credit_card',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 780.06,
                formatted: '780.06',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'gift_card',
                formatted: 'gift_card',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 347.29,
                formatted: '347.29',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'bank_transfer',
                formatted: 'bank_transfer',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2024-01-01T00:00:00Z',
                formatted: '2024',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 301.9,
                formatted: '301.9',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'coupon',
                formatted: 'coupon',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2024-01-01T00:00:00Z',
                formatted: '2024',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 82,
                formatted: '82',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'credit_card',
                formatted: 'credit_card',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2024-01-01T00:00:00Z',
                formatted: '2024',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 630.1,
                formatted: '630.1',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'gift_card',
                formatted: 'gift_card',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2024-01-01T00:00:00Z',
                formatted: '2024',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 175.6,
                formatted: '175.6',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'bank_transfer',
                formatted: 'bank_transfer',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2023-01-01T00:00:00Z',
                formatted: '2023',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 10.5,
                formatted: '10.5',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'coupon',
                formatted: 'coupon',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2023-01-01T00:00:00Z',
                formatted: '2023',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 51,
                formatted: '51',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'credit_card',
                formatted: 'credit_card',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2023-01-01T00:00:00Z',
                formatted: '2023',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 42,
                formatted: '42',
            },
        },
    },
    {
        payments_payment_method: {
            value: {
                raw: 'gift_card',
                formatted: 'gift_card',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2023-01-01T00:00:00Z',
                formatted: '2023',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 14,
                formatted: '14',
            },
        },
    },
];

export const SQL_PIVOTED_ROWS: ResultRow[] = [
    {
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        payments_total_revenue_any_bank_transfer: {
            value: {
                raw: 493.78,
                formatted: '493.78',
            },
        },
        payments_total_revenue_any_coupon: {
            value: {
                raw: 125.64,
                formatted: '125.64',
            },
        },
        payments_total_revenue_any_credit_card: {
            value: {
                raw: 780.06,
                formatted: '780.06',
            },
        },
        payments_total_revenue_any_gift_card: {
            value: {
                raw: 347.29,
                formatted: '347.29',
            },
        },
    },
    {
        orders_order_date_year: {
            value: {
                raw: '2024-01-01T00:00:00Z',
                formatted: '2024',
            },
        },
        payments_total_revenue_any_bank_transfer: {
            value: {
                raw: 301.9,
                formatted: '301.9',
            },
        },
        payments_total_revenue_any_coupon: {
            value: {
                raw: 82,
                formatted: '82',
            },
        },
        payments_total_revenue_any_credit_card: {
            value: {
                raw: 630.1,
                formatted: '630.1',
            },
        },
        payments_total_revenue_any_gift_card: {
            value: {
                raw: 175.6,
                formatted: '175.6',
            },
        },
    },
    {
        orders_order_date_year: {
            value: {
                raw: '2023-01-01T00:00:00Z',
                formatted: '2023',
            },
        },
        payments_total_revenue_any_bank_transfer: {
            value: {
                raw: 10.5,
                formatted: '10.5',
            },
        },
        payments_total_revenue_any_coupon: {
            value: {
                raw: 51,
                formatted: '51',
            },
        },
        payments_total_revenue_any_credit_card: {
            value: {
                raw: 42,
                formatted: '42',
            },
        },
        payments_total_revenue_any_gift_card: {
            value: {
                raw: 14,
                formatted: '14',
            },
        },
    },
];

export const SQL_PIVOT_DETAILS: NonNullable<
    ReadyQueryResultsPage['pivotDetails']
> = {
    totalColumnCount: 4,
    valuesColumns: [
        {
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    value: 'bank_transfer',
                    referenceField: 'payments_payment_method',
                },
            ],
            referenceField: 'payments_total_revenue',
            pivotColumnName: 'payments_total_revenue_any_bank_transfer',
        },
        {
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    value: 'coupon',
                    referenceField: 'payments_payment_method',
                },
            ],
            referenceField: 'payments_total_revenue',
            pivotColumnName: 'payments_total_revenue_any_coupon',
        },
        {
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    value: 'credit_card',
                    referenceField: 'payments_payment_method',
                },
            ],
            referenceField: 'payments_total_revenue',
            pivotColumnName: 'payments_total_revenue_any_credit_card',
        },
        {
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    value: 'gift_card',
                    referenceField: 'payments_payment_method',
                },
            ],
            referenceField: 'payments_total_revenue',
            pivotColumnName: 'payments_total_revenue_any_gift_card',
        },
    ],
    indexColumn: [
        {
            type: VizIndexType.TIME,
            reference: 'orders_order_date_year',
        },
    ],
    groupByColumns: [
        {
            reference: 'payments_payment_method',
        },
    ],
    sortBy: [
        {
            direction: SortByDirection.DESC,
            reference: 'orders_order_date_year',
        },
    ],
    originalColumns: {},
};

export const EXPECTED_PIVOT_DATA: PivotData = {
    titleFields: [
        [
            {
                fieldId: 'payments_payment_method',
                direction: 'header',
            },
        ],
        [
            {
                fieldId: 'orders_order_date_year',
                direction: 'index',
            },
        ],
    ],
    headerValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
        {
            type: FieldType.METRIC,
        },
    ],
    headerValues: [
        [
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'bank_transfer',
                    formatted: 'bank_transfer',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'coupon',
                    formatted: 'coupon',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'credit_card',
                    formatted: 'credit_card',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'gift_card',
                    formatted: 'gift_card',
                },
                colSpan: 1,
            },
        ],
        [
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
        ],
    ],
    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_order_date_year',
        },
    ],
    indexValues: [
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2025-01-01T00:00:00Z',
                    formatted: '2025',
                },
                colSpan: 1,
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2024-01-01T00:00:00Z',
                    formatted: '2024',
                },
                colSpan: 1,
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2023-01-01T00:00:00Z',
                    formatted: '2023',
                },
                colSpan: 1,
            },
        ],
    ],
    dataColumnCount: 4,
    dataValues: [
        [
            {
                raw: 493.78,
                formatted: '493.78',
            },
            {
                raw: 125.64,
                formatted: '125.64',
            },
            {
                raw: 780.06,
                formatted: '780.06',
            },
            {
                raw: 347.29,
                formatted: '347.29',
            },
        ],
        [
            {
                raw: 301.9,
                formatted: '301.9',
            },
            {
                raw: 82,
                formatted: '82',
            },
            {
                raw: 630.1,
                formatted: '630.1',
            },
            {
                raw: 175.6,
                formatted: '175.6',
            },
        ],
        [
            {
                raw: 10.5,
                formatted: '10.5',
            },
            {
                raw: 51,
                formatted: '51',
            },
            {
                raw: 42,
                formatted: '42',
            },
            {
                raw: 14,
                formatted: '14',
            },
        ],
    ],
    cellsCount: 5,
    rowsCount: 3,
    pivotConfig: {
        pivotDimensions: ['payments_payment_method'],
        metricsAsRows: false,
        columnOrder: [
            'payments_payment_method',
            'orders_order_date_year',
            'payments_total_revenue',
        ],
        hiddenMetricFieldIds: [],
        columnTotals: false,
        rowTotals: false,
    },
    retrofitData: {
        allCombinedData: [
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                payments_payment_method__payments_total_revenue__0: {
                    value: {
                        raw: 493.78,
                        formatted: '493.78',
                    },
                },
                payments_payment_method__payments_total_revenue__1: {
                    value: {
                        raw: 125.64,
                        formatted: '125.64',
                    },
                },
                payments_payment_method__payments_total_revenue__2: {
                    value: {
                        raw: 780.06,
                        formatted: '780.06',
                    },
                },
                payments_payment_method__payments_total_revenue__3: {
                    value: {
                        raw: 347.29,
                        formatted: '347.29',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2024-01-01T00:00:00Z',
                        formatted: '2024',
                    },
                },
                payments_payment_method__payments_total_revenue__0: {
                    value: {
                        raw: 301.9,
                        formatted: '301.9',
                    },
                },
                payments_payment_method__payments_total_revenue__1: {
                    value: {
                        raw: 82,
                        formatted: '82',
                    },
                },
                payments_payment_method__payments_total_revenue__2: {
                    value: {
                        raw: 630.1,
                        formatted: '630.1',
                    },
                },
                payments_payment_method__payments_total_revenue__3: {
                    value: {
                        raw: 175.6,
                        formatted: '175.6',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2023-01-01T00:00:00Z',
                        formatted: '2023',
                    },
                },
                payments_payment_method__payments_total_revenue__0: {
                    value: {
                        raw: 10.5,
                        formatted: '10.5',
                    },
                },
                payments_payment_method__payments_total_revenue__1: {
                    value: {
                        raw: 51,
                        formatted: '51',
                    },
                },
                payments_payment_method__payments_total_revenue__2: {
                    value: {
                        raw: 42,
                        formatted: '42',
                    },
                },
                payments_payment_method__payments_total_revenue__3: {
                    value: {
                        raw: 14,
                        formatted: '14',
                    },
                },
            },
        ],
        pivotColumnInfo: [
            {
                fieldId: 'orders_order_date_year',
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__0',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__1',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__2',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__3',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
        ],
    },
    rowTotalFields: undefined,
    rowTotals: undefined,
    columnTotalFields: undefined,
    columnTotals: undefined,
    groupedSubtotals: undefined,
};

export const EXPECTED_PIVOT_DATA_WITH_TOTALS: PivotData = {
    titleFields: [
        [
            {
                fieldId: 'payments_payment_method',
                direction: 'header',
            },
        ],
        [
            {
                fieldId: 'orders_order_date_year',
                direction: 'index',
            },
        ],
    ],
    headerValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
        {
            type: FieldType.METRIC,
        },
    ],
    headerValues: [
        [
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'bank_transfer',
                    formatted: 'bank_transfer',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'coupon',
                    formatted: 'coupon',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'credit_card',
                    formatted: 'credit_card',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'gift_card',
                    formatted: 'gift_card',
                },
                colSpan: 1,
            },
        ],
        [
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
        ],
    ],
    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_order_date_year',
        },
    ],
    indexValues: [
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2025-01-01T00:00:00Z',
                    formatted: '2025',
                },
                colSpan: 1,
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2024-01-01T00:00:00Z',
                    formatted: '2024',
                },
                colSpan: 1,
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2023-01-01T00:00:00Z',
                    formatted: '2023',
                },
                colSpan: 1,
            },
        ],
    ],
    dataColumnCount: 4,
    dataValues: [
        [
            {
                raw: 493.78,
                formatted: '493.78',
            },
            {
                raw: 125.64,
                formatted: '125.64',
            },
            {
                raw: 780.06,
                formatted: '780.06',
            },
            {
                raw: 347.29,
                formatted: '347.29',
            },
        ],
        [
            {
                raw: 301.9,
                formatted: '301.9',
            },
            {
                raw: 82,
                formatted: '82',
            },
            {
                raw: 630.1,
                formatted: '630.1',
            },
            {
                raw: 175.6,
                formatted: '175.6',
            },
        ],
        [
            {
                raw: 10.5,
                formatted: '10.5',
            },
            {
                raw: 51,
                formatted: '51',
            },
            {
                raw: 42,
                formatted: '42',
            },
            {
                raw: 14,
                formatted: '14',
            },
        ],
    ],
    rowTotalFields: [
        [null],
        [
            {
                fieldId: 'payments_total_revenue',
            },
        ],
    ],
    columnTotalFields: [[{ fieldId: undefined }]],
    rowTotals: [[1746.77], [1189.6], [117.5]],
    columnTotals: [[806.18, 258.64, 1452.1599999999999, 536.89]],
    cellsCount: 6,
    rowsCount: 3,
    pivotConfig: {
        pivotDimensions: ['payments_payment_method'],
        metricsAsRows: false,
        columnOrder: [
            'payments_payment_method',
            'orders_order_date_year',
            'payments_total_revenue',
        ],
        hiddenMetricFieldIds: [],
        columnTotals: true,
        rowTotals: true,
    },
    retrofitData: {
        allCombinedData: [
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                payments_payment_method__payments_total_revenue__0: {
                    value: {
                        raw: 493.78,
                        formatted: '493.78',
                    },
                },
                payments_payment_method__payments_total_revenue__1: {
                    value: {
                        raw: 125.64,
                        formatted: '125.64',
                    },
                },
                payments_payment_method__payments_total_revenue__2: {
                    value: {
                        raw: 780.06,
                        formatted: '780.06',
                    },
                },
                payments_payment_method__payments_total_revenue__3: {
                    value: {
                        raw: 347.29,
                        formatted: '347.29',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 1746.77,
                        formatted: '1,746.77',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2024-01-01T00:00:00Z',
                        formatted: '2024',
                    },
                },
                payments_payment_method__payments_total_revenue__0: {
                    value: {
                        raw: 301.9,
                        formatted: '301.9',
                    },
                },
                payments_payment_method__payments_total_revenue__1: {
                    value: {
                        raw: 82,
                        formatted: '82',
                    },
                },
                payments_payment_method__payments_total_revenue__2: {
                    value: {
                        raw: 630.1,
                        formatted: '630.1',
                    },
                },
                payments_payment_method__payments_total_revenue__3: {
                    value: {
                        raw: 175.6,
                        formatted: '175.6',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 1189.6,
                        formatted: '1,189.6',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2023-01-01T00:00:00Z',
                        formatted: '2023',
                    },
                },
                payments_payment_method__payments_total_revenue__0: {
                    value: {
                        raw: 10.5,
                        formatted: '10.5',
                    },
                },
                payments_payment_method__payments_total_revenue__1: {
                    value: {
                        raw: 51,
                        formatted: '51',
                    },
                },
                payments_payment_method__payments_total_revenue__2: {
                    value: {
                        raw: 42,
                        formatted: '42',
                    },
                },
                payments_payment_method__payments_total_revenue__3: {
                    value: {
                        raw: 14,
                        formatted: '14',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 117.5,
                        formatted: '117.5',
                    },
                },
            },
        ],
        pivotColumnInfo: [
            {
                fieldId: 'orders_order_date_year',
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__0',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__1',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__2',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__payments_total_revenue__3',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'row-total-0',
                baseId: 'row-total-0',
                underlyingId: 'payments_total_revenue',
                columnType: 'rowTotal',
            },
        ],
    },
    groupedSubtotals: undefined,
};

export const EXPECTED_PIVOT_DATA_METRICS_AS_ROWS: PivotData = {
    titleFields: [
        [
            {
                fieldId: 'orders_order_date_year',
                direction: 'index',
            },
            {
                fieldId: 'payments_payment_method',
                direction: 'header',
            },
        ],
    ],
    headerValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
    ],
    headerValues: [
        [
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'bank_transfer',
                    formatted: 'bank_transfer',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'coupon',
                    formatted: 'coupon',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'credit_card',
                    formatted: 'credit_card',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'gift_card',
                    formatted: 'gift_card',
                },
                colSpan: 1,
            },
        ],
    ],
    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_order_date_year',
        },
        {
            type: FieldType.METRIC,
        },
    ],
    indexValues: [
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2025-01-01T00:00:00Z',
                    formatted: '2025',
                },
                colSpan: 1,
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2024-01-01T00:00:00Z',
                    formatted: '2024',
                },
                colSpan: 1,
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2023-01-01T00:00:00Z',
                    formatted: '2023',
                },
                colSpan: 1,
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
        ],
    ],
    dataColumnCount: 4,
    dataValues: [
        [
            {
                raw: 493.78,
                formatted: '493.78',
            },
            {
                raw: 125.64,
                formatted: '125.64',
            },
            {
                raw: 780.06,
                formatted: '780.06',
            },
            {
                raw: 347.29,
                formatted: '347.29',
            },
        ],
        [
            {
                raw: 301.9,
                formatted: '301.9',
            },
            {
                raw: 82,
                formatted: '82',
            },
            {
                raw: 630.1,
                formatted: '630.1',
            },
            {
                raw: 175.6,
                formatted: '175.6',
            },
        ],
        [
            {
                raw: 10.5,
                formatted: '10.5',
            },
            {
                raw: 51,
                formatted: '51',
            },
            {
                raw: 42,
                formatted: '42',
            },
            {
                raw: 14,
                formatted: '14',
            },
        ],
    ],
    rowTotalFields: [[{ fieldId: undefined }]],
    columnTotalFields: [
        [
            null,
            {
                fieldId: 'payments_total_revenue',
            },
        ],
    ],
    rowTotals: [[1746.77], [1189.6], [117.5]],
    columnTotals: [[806.18, 258.64, 1452.1599999999999, 536.89]],
    cellsCount: 7,
    rowsCount: 3,
    pivotConfig: {
        pivotDimensions: ['payments_payment_method'],
        metricsAsRows: true,
        columnOrder: [
            'payments_payment_method',
            'orders_order_date_year',
            'payments_total_revenue',
        ],
        hiddenMetricFieldIds: [],
        columnTotals: true,
        rowTotals: true,
    },
    retrofitData: {
        allCombinedData: [
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                'label-1': {
                    value: {
                        raw: 'Payments Total revenue',
                        formatted: 'Payments Total revenue',
                    },
                },
                payments_payment_method__0: {
                    value: {
                        raw: 493.78,
                        formatted: '493.78',
                    },
                },
                payments_payment_method__1: {
                    value: {
                        raw: 125.64,
                        formatted: '125.64',
                    },
                },
                payments_payment_method__2: {
                    value: {
                        raw: 780.06,
                        formatted: '780.06',
                    },
                },
                payments_payment_method__3: {
                    value: {
                        raw: 347.29,
                        formatted: '347.29',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 1746.77,
                        formatted: '1,746.77',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2024-01-01T00:00:00Z',
                        formatted: '2024',
                    },
                },
                'label-1': {
                    value: {
                        raw: 'Payments Total revenue',
                        formatted: 'Payments Total revenue',
                    },
                },
                payments_payment_method__0: {
                    value: {
                        raw: 301.9,
                        formatted: '301.9',
                    },
                },
                payments_payment_method__1: {
                    value: {
                        raw: 82,
                        formatted: '82',
                    },
                },
                payments_payment_method__2: {
                    value: {
                        raw: 630.1,
                        formatted: '630.1',
                    },
                },
                payments_payment_method__3: {
                    value: {
                        raw: 175.6,
                        formatted: '175.6',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 1189.6,
                        formatted: '1,189.6',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2023-01-01T00:00:00Z',
                        formatted: '2023',
                    },
                },
                'label-1': {
                    value: {
                        raw: 'Payments Total revenue',
                        formatted: 'Payments Total revenue',
                    },
                },
                payments_payment_method__0: {
                    value: {
                        raw: 10.5,
                        formatted: '10.5',
                    },
                },
                payments_payment_method__1: {
                    value: {
                        raw: 51,
                        formatted: '51',
                    },
                },
                payments_payment_method__2: {
                    value: {
                        raw: 42,
                        formatted: '42',
                    },
                },
                payments_payment_method__3: {
                    value: {
                        raw: 14,
                        formatted: '14',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 117.5,
                        formatted: '117.5',
                    },
                },
            },
        ],
        pivotColumnInfo: [
            {
                fieldId: 'orders_order_date_year',
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'label-1',
                columnType: 'label',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'payments_payment_method__0',
                baseId: 'payments_payment_method',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__1',
                baseId: 'payments_payment_method',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__2',
                baseId: 'payments_payment_method',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'payments_payment_method__3',
                baseId: 'payments_payment_method',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'row-total-0',
                baseId: 'row-total-0',
                columnType: 'rowTotal',
                underlyingId: undefined,
            },
        ],
    },
    groupedSubtotals: undefined,
};

export const COMPLEX_NON_PIVOTED_ROWS: ResultRow[] = [
    {
        payments_payment_method: {
            value: {
                raw: 'bank_transfer',
                formatted: 'bank_transfer',
            },
        },
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        orders_is_completed: {
            value: {
                raw: false,
                formatted: 'False',
            },
        },
        orders_promo_code: {
            value: {
                raw: 'AFTER',
                formatted: 'AFTER',
            },
        },
        payments_total_revenue: {
            value: {
                raw: 52.5,
                formatted: '52.5',
            },
        },
        orders_average_order_size: {
            value: {
                raw: 52.5,
                formatted: '$52.50',
            },
        },
        orders_total_order_amount: {
            value: {
                raw: 52.5,
                formatted: '$52.50',
            },
        },
    },
];

export const COMPLEX_SQL_PIVOTED_ROWS: ResultRow[] = [
    {
        orders_order_date_year: {
            value: {
                raw: '2025-01-01T00:00:00Z',
                formatted: '2025',
            },
        },
        orders_promo_code: {
            value: {
                raw: 'AFTER',
                formatted: 'AFTER',
            },
        },
        payments_total_revenue_any_bank_transfer_false: {
            value: {
                raw: 52.5,
                formatted: '52.5',
            },
        },
        orders_average_order_size_any_bank_transfer_false: {
            value: {
                raw: 52.5,
                formatted: '$52.50',
            },
        },
        orders_total_order_amount_any_bank_transfer_false: {
            value: {
                raw: 52.5,
                formatted: '$52.50',
            },
        },
    },
];

export const COMPLEX_SQL_PIVOT_DETAILS: NonNullable<
    ReadyQueryResultsPage['pivotDetails']
> = {
    totalColumnCount: 3,
    valuesColumns: [
        {
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    value: 'bank_transfer',
                    referenceField: 'payments_payment_method',
                },
                {
                    value: false,
                    referenceField: 'orders_is_completed',
                },
            ],
            referenceField: 'payments_total_revenue',
            pivotColumnName: 'payments_total_revenue_any_bank_transfer_false',
        },
        {
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    value: 'bank_transfer',
                    referenceField: 'payments_payment_method',
                },
                {
                    value: false,
                    referenceField: 'orders_is_completed',
                },
            ],
            referenceField: 'orders_average_order_size',
            pivotColumnName:
                'orders_average_order_size_any_bank_transfer_false',
        },
        {
            aggregation: VizAggregationOptions.ANY,
            pivotValues: [
                {
                    value: 'bank_transfer',
                    referenceField: 'payments_payment_method',
                },
                {
                    value: false,
                    referenceField: 'orders_is_completed',
                },
            ],
            referenceField: 'orders_total_order_amount',
            pivotColumnName:
                'orders_total_order_amount_any_bank_transfer_false',
        },
    ],
    indexColumn: [
        {
            type: VizIndexType.TIME,
            reference: 'orders_order_date_year',
        },
        {
            type: VizIndexType.CATEGORY,
            reference: 'orders_promo_code',
        },
    ],
    groupByColumns: [
        {
            reference: 'payments_payment_method',
        },
        {
            reference: 'orders_is_completed',
        },
    ],
    sortBy: [
        {
            direction: SortByDirection.DESC,
            reference: 'orders_order_date_year',
        },
    ],
    originalColumns: {},
};

// multiple dimensions, multiple metrics, multiple pivots, totals
// @ts-ignore
export const EXPECTED_COMPLEX_PIVOT_DATA: PivotData = {
    titleFields: [
        [
            null,
            {
                fieldId: 'payments_payment_method',
                direction: 'header',
            },
        ],
        [
            null,
            {
                fieldId: 'orders_is_completed',
                direction: 'header',
            },
        ],
        [
            {
                fieldId: 'orders_order_date_year',
                direction: 'index',
            },
            {
                fieldId: 'orders_promo_code',
                direction: 'index',
            },
        ],
    ],
    headerValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_is_completed',
        },
        {
            type: FieldType.METRIC,
        },
    ],
    headerValues: [
        [
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'bank_transfer',
                    formatted: 'bank_transfer',
                },
                colSpan: 3,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'bank_transfer',
                    formatted: 'bank_transfer',
                },
                colSpan: 0,
            },
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'bank_transfer',
                    formatted: 'bank_transfer',
                },
                colSpan: 0,
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_is_completed',
                value: {
                    raw: false,
                    formatted: 'False',
                },
                colSpan: 3,
            },
            {
                type: 'value',
                fieldId: 'orders_is_completed',
                value: {
                    raw: false,
                    formatted: 'False',
                },
                colSpan: 0,
            },
            {
                type: 'value',
                fieldId: 'orders_is_completed',
                value: {
                    raw: false,
                    formatted: 'False',
                },
                colSpan: 0,
            },
        ],
        [
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
            {
                type: 'label',
                fieldId: 'orders_average_order_size',
            },
            {
                type: 'label',
                fieldId: 'orders_total_order_amount',
            },
        ],
    ],
    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_order_date_year',
        },
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_promo_code',
        },
    ],
    indexValues: [
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2025-01-01T00:00:00Z',
                    formatted: '2025',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'orders_promo_code',
                value: {
                    raw: 'AFTER',
                    formatted: 'AFTER',
                },
                colSpan: 1,
            },
        ],
    ],
    dataColumnCount: 3,
    dataValues: [
        [
            {
                raw: 52.5,
                formatted: '52.5',
            },
            {
                raw: 52.5,
                formatted: '$52.50',
            },
            {
                raw: 52.5,
                formatted: '$52.50',
            },
        ],
    ],
    rowTotalFields: [
        [null, null],
        [null, null],
        [
            {
                fieldId: 'payments_total_revenue',
            },
            {
                fieldId: 'orders_total_order_amount',
            },
        ],
    ],
    columnTotalFields: [[null, { fieldId: undefined }]],
    rowTotals: [[52.5, 52.5]],
    columnTotals: [[52.5, 52.5, 52.5]],
    cellsCount: 7,
    rowsCount: 1,
    pivotConfig: {
        pivotDimensions: ['payments_payment_method', 'orders_is_completed'],
        metricsAsRows: false,
        columnOrder: [
            'payments_payment_method',
            'orders_order_date_year',
            'orders_is_completed',
            'orders_promo_code',
            'payments_total_revenue',
            'orders_average_order_size',
            'orders_total_order_amount',
        ],
        hiddenMetricFieldIds: [],
        columnTotals: true,
        rowTotals: true,
    },
    retrofitData: {
        allCombinedData: [
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                orders_promo_code: {
                    value: {
                        raw: 'AFTER',
                        formatted: 'AFTER',
                    },
                },
                payments_payment_method__orders_is_completed__payments_total_revenue__0:
                    {
                        value: {
                            raw: 52.5,
                            formatted: '52.5',
                        },
                    },
                payments_payment_method__orders_is_completed__orders_average_order_size__1:
                    {
                        value: {
                            raw: 52.5,
                            formatted: '$52.50',
                        },
                    },
                payments_payment_method__orders_is_completed__orders_total_order_amount__2:
                    {
                        value: {
                            raw: 52.5,
                            formatted: '$52.50',
                        },
                    },
                'row-total-0': {
                    value: {
                        raw: 52.5,
                        formatted: '52.5',
                    },
                },
                'row-total-1': {
                    value: {
                        raw: 52.5,
                        formatted: '52.5',
                    },
                },
            },
        ],
        pivotColumnInfo: [
            {
                fieldId: 'orders_order_date_year',
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'orders_promo_code',
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId:
                    'payments_payment_method__orders_is_completed__payments_total_revenue__0',
                baseId: 'payments_total_revenue',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId:
                    'payments_payment_method__orders_is_completed__orders_average_order_size__1',
                baseId: 'orders_average_order_size',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId:
                    'payments_payment_method__orders_is_completed__orders_total_order_amount__2',
                baseId: 'orders_total_order_amount',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'row-total-0',
                baseId: 'row-total-0',
                underlyingId: 'payments_total_revenue',
                columnType: 'rowTotal',
            },
            {
                fieldId: 'row-total-1',
                baseId: 'row-total-1',
                underlyingId: 'orders_total_order_amount',
                columnType: 'rowTotal',
            },
        ],
    },
    groupedSubtotals: undefined,
};

// multiple dimensions, multiple metrics, multiple pivots, totals and metric as rows
export const EXPECTED_COMPLEX_PIVOT_DATA_WITH_METRICS_AS_ROWS: PivotData = {
    titleFields: [
        [
            null,
            null,
            {
                fieldId: 'payments_payment_method',
                direction: 'header',
            },
        ],
        [
            {
                fieldId: 'orders_order_date_year',
                direction: 'index',
            },
            {
                fieldId: 'orders_promo_code',
                direction: 'index',
            },
            {
                fieldId: 'orders_is_completed',
                direction: 'header',
            },
        ],
    ],
    headerValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'payments_payment_method',
        },
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_is_completed',
        },
    ],
    headerValues: [
        [
            {
                type: 'value',
                fieldId: 'payments_payment_method',
                value: {
                    raw: 'bank_transfer',
                    formatted: 'bank_transfer',
                },
                colSpan: 1,
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_is_completed',
                value: {
                    raw: false,
                    formatted: 'False',
                },
                colSpan: 1,
            },
        ],
    ],
    indexValueTypes: [
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_order_date_year',
        },
        {
            type: FieldType.DIMENSION,
            fieldId: 'orders_promo_code',
        },
        {
            type: FieldType.METRIC,
        },
    ],
    indexValues: [
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2025-01-01T00:00:00Z',
                    formatted: '2025',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'orders_promo_code',
                value: {
                    raw: 'AFTER',
                    formatted: 'AFTER',
                },
                colSpan: 1,
            },
            {
                type: 'label',
                fieldId: 'payments_total_revenue',
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2025-01-01T00:00:00Z',
                    formatted: '2025',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'orders_promo_code',
                value: {
                    raw: 'AFTER',
                    formatted: 'AFTER',
                },
                colSpan: 1,
            },
            {
                type: 'label',
                fieldId: 'orders_average_order_size',
            },
        ],
        [
            {
                type: 'value',
                fieldId: 'orders_order_date_year',
                value: {
                    raw: '2025-01-01T00:00:00Z',
                    formatted: '2025',
                },
                colSpan: 1,
            },
            {
                type: 'value',
                fieldId: 'orders_promo_code',
                value: {
                    raw: 'AFTER',
                    formatted: 'AFTER',
                },
                colSpan: 1,
            },
            {
                type: 'label',
                fieldId: 'orders_total_order_amount',
            },
        ],
    ],
    dataColumnCount: 1,
    dataValues: [
        [
            {
                raw: 52.5,
                formatted: '52.5',
            },
        ],
        [
            {
                raw: 52.5,
                formatted: '$52.50',
            },
        ],
        [
            {
                raw: 52.5,
                formatted: '$52.50',
            },
        ],
    ],
    rowTotalFields: [[null], [{ fieldId: undefined }]],
    columnTotalFields: [
        [
            null,
            null,
            {
                fieldId: 'payments_total_revenue',
            },
        ],
        [
            null,
            null,
            {
                fieldId: 'orders_total_order_amount',
            },
        ],
    ],
    rowTotals: [[52.5], [52.5], [52.5]],
    columnTotals: [[52.5], [52.5]],
    cellsCount: 5,
    rowsCount: 3,
    pivotConfig: {
        pivotDimensions: ['payments_payment_method', 'orders_is_completed'],
        metricsAsRows: true,
        columnOrder: [
            'payments_payment_method',
            'orders_order_date_year',
            'orders_is_completed',
            'orders_promo_code',
            'payments_total_revenue',
            'orders_average_order_size',
            'orders_total_order_amount',
        ],
        hiddenMetricFieldIds: [],
        columnTotals: true,
        rowTotals: true,
    },
    retrofitData: {
        allCombinedData: [
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                orders_promo_code: {
                    value: {
                        raw: 'AFTER',
                        formatted: 'AFTER',
                    },
                },
                'label-2': {
                    value: {
                        raw: 'Payments Total revenue',
                        formatted: 'Payments Total revenue',
                    },
                },
                payments_payment_method__orders_is_completed__0: {
                    value: {
                        raw: 52.5,
                        formatted: '52.5',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 52.5,
                        formatted: '52.5',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                orders_promo_code: {
                    value: {
                        raw: 'AFTER',
                        formatted: 'AFTER',
                    },
                },
                'label-2': {
                    value: {
                        raw: 'Orders Average order size',
                        formatted: 'Orders Average order size',
                    },
                },
                payments_payment_method__orders_is_completed__0: {
                    value: {
                        raw: 52.5,
                        formatted: '$52.50',
                    },
                },
            },
            {
                orders_order_date_year: {
                    value: {
                        raw: '2025-01-01T00:00:00Z',
                        formatted: '2025',
                    },
                },
                orders_promo_code: {
                    value: {
                        raw: 'AFTER',
                        formatted: 'AFTER',
                    },
                },
                'label-2': {
                    value: {
                        raw: 'Orders Total order amount',
                        formatted: 'Orders Total order amount',
                    },
                },
                payments_payment_method__orders_is_completed__0: {
                    value: {
                        raw: 52.5,
                        formatted: '$52.50',
                    },
                },
                'row-total-0': {
                    value: {
                        raw: 52.5,
                        formatted: '52.5',
                    },
                },
            },
        ],
        pivotColumnInfo: [
            {
                fieldId: 'orders_order_date_year',
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'orders_promo_code',
                columnType: 'indexValue',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'label-2',
                columnType: 'label',
                baseId: undefined,
                underlyingId: undefined,
            },
            {
                fieldId: 'payments_payment_method__orders_is_completed__0',
                baseId: 'orders_is_completed',
                underlyingId: undefined,
                columnType: undefined,
            },
            {
                fieldId: 'row-total-0',
                baseId: 'row-total-0',
                columnType: 'rowTotal',
                underlyingId: undefined,
            },
        ],
    },
    groupedSubtotals: undefined,
};
