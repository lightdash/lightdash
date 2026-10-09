import { ChartType } from '../types/savedCharts';

/** A chart this release reads. */
export const KNOWN_DOCUMENT_CHART = {
    source: 'semantic',
    chart: {
        name: 'Orders by status',
        description: '',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_count'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: { type: ChartType.TABLE },
    },
} as const;

/** A chart kind this release doesn't know. */
export const FUTURE_KIND_CHART = {
    source: 'image',
    image: { url: 'https://example.com/logo.png', alt: 'Logo' },
};

/** A known kind saved at a newer version than this release reads. */
export const FUTURE_VERSION_CHART = {
    ...KNOWN_DOCUMENT_CHART,
    version: 99,
    chart: { ...KNOWN_DOCUMENT_CHART.chart, caption: 'Added in version 99' },
};

/** A block tag this release doesn't know, as a newer release writes it. */
export const FUTURE_BLOCK_TAG =
    '<saved-chart slug="monthly-revenue" title="Live">';

/**
 * Stored content as a newer release could write it: a known chart, a chart of
 * an unknown kind, a known kind at a newer version and an unknown block tag.
 */
export const FUTURE_DOCUMENT_CONTENT = {
    markdown: [
        '# Quarterly review',
        '<document-chart id="c1">',
        'Text between charts.',
        '<document-chart id="c2">',
        '<document-chart id="c3">',
        FUTURE_BLOCK_TAG,
        'Closing text.',
    ].join('\n\n'),
    charts: {
        c1: KNOWN_DOCUMENT_CHART,
        c2: FUTURE_KIND_CHART,
        c3: FUTURE_VERSION_CHART,
    },
};
