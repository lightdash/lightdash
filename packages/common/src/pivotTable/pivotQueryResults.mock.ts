import { type MetricQuery } from '../types/metricQuery';
import { type ResultRow } from '../types/results';

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
