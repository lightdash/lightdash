import { MetricQuery, ResultValue } from '@lightdash/common';

export const METRIC_QUERY_2DIM_2METRIC: Pick<
    MetricQuery,
    'metrics' | 'dimensions' | 'tableCalculations' | 'additionalMetrics'
> = {
    metrics: ['views', 'devices'],
    dimensions: ['page', 'site'],
    tableCalculations: [],
};

export const RESULT_ROWS_2DIM_2METRIC: Record<string, ResultValue>[] = [
    {
        page: { raw: '/home', formatted: '/home' },
        site: { raw: 'blog', formatted: 'Blog' },
        views: { raw: 6, formatted: '6.0' },
        devices: { raw: 7, formatted: '7.0' },
    },
    {
        page: { raw: '/about', formatted: '/about' },
        site: { raw: 'blog', formatted: 'Blog' },
        views: { raw: 12, formatted: '12.0' },
        devices: { raw: 0, formatted: '0.0' },
    },
    {
        page: { raw: '/first-post', formatted: '/first-post' },
        site: { raw: 'blog', formatted: 'Blog' },
        views: { raw: 11, formatted: '11.0' },
        devices: { raw: 1, formatted: '1.0' },
    },
    {
        page: { raw: '/home', formatted: '/home' },
        site: { raw: 'docs', formatted: 'Docs' },
        views: { raw: 2, formatted: '2.0' },
        devices: { raw: 10, formatted: '10.0' },
    },
    {
        page: { raw: '/about', formatted: '/about' },
        site: { raw: 'docs', formatted: 'Docs' },
        views: { raw: 2, formatted: '2.0' },
        devices: { raw: 13, formatted: '13.0' },
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

export const RESULT_ROWS_1DIM_2METRIC: Record<string, ResultValue>[] = [
    {
        page: { raw: '/home', formatted: '/home' },
        views: { raw: 6, formatted: '6.0' },
        devices: { raw: 7, formatted: '7.0' },
    },
    {
        page: { raw: '/about', formatted: '/about' },
        views: { raw: 12, formatted: '12.0' },
        devices: { raw: 0, formatted: '0.0' },
    },
    {
        page: { raw: '/first-post', formatted: '/first-post' },
        views: { raw: 11, formatted: '11.0' },
        devices: { raw: 1, formatted: '1.0' },
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

export const RESULT_ROWS_0DIM_2METRIC: Record<string, ResultValue>[] = [
    {
        views: { raw: 6, formatted: '6.0' },
        devices: { raw: 7, formatted: '7.0' },
    },
];
