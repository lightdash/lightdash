import {
    DimensionType,
    FilterOperator,
    MetricType,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

export const SEARCH_CONSOLE_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    // Matched with includingRegex
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    // Search Console never reports empty values, so this always holds
    FilterOperator.NOT_NULL,
];

export const SEARCH_CONSOLE_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended: the missing side is today or the earliest retained day
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

const dimension = (
    name: string,
    label: string,
    description?: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type: DimensionType.STRING,
    filterOperators: SEARCH_CONSOLE_STRING_FILTERS,
});

// Search Analytics can't filter on metrics
const metric = (
    name: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    aiHint?: string,
    format?: string,
): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators: [],
    aggregation,
    ...(format ? { format } : {}),
});

// Additivity per the Search Analytics docs
// (https://developers.google.com/webmaster-tools/v1/searchanalytics/query,
// https://support.google.com/webmasters/answer/7042828): clicks and
// impressions are counts, CTR is clicks / impressions and position is an
// impression-weighted average, which summed rows can't rebuild.

export const SEARCH_CONSOLE_PERFORMANCE_EXPLORE: LiveExploreDefinition = {
    name: 'performance',
    label: 'Search performance',
    description:
        'Google Search clicks, impressions, click-through rate and average position for one Search Console site. Dates are in Pacific Time.',
    aiHint: 'Without a Date filter the query reads the last 28 days; the last two or three days are incomplete. Search type defaults to web; filter it to exactly one of web, image, video or news. Search appearance can only be used on its own, with no other dimension (filtering by other dimensions is fine). Google hides rare queries for privacy, so totals by Query are lower than site totals. Splitting or filtering by Page counts impressions per page, so totals by page can exceed site totals. CTR and Average position are not additive.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: SEARCH_CONSOLE_DATE_FILTERS,
            description: 'Day of the search, in Pacific Time.',
            aiHint: 'Without a date filter the query reads the last 28 days. The last two or three days are incomplete.',
        },
        dimension(
            'query',
            'Query',
            'What people searched for on Google.',
            'Google hides rare queries for privacy, so totals by query are lower than site totals.',
        ),
        dimension(
            'page',
            'Page',
            'URL of the page shown in the search result.',
            'Splitting or filtering by page counts impressions per page, so a result showing two of your pages counts twice.',
        ),
        dimension(
            'country',
            'Country',
            'Country of the searcher, as a three-letter code such as USA.',
        ),
        dimension(
            'device',
            'Device',
            'Device the search was made on: DESKTOP, MOBILE or TABLET.',
        ),
        {
            ...dimension(
                'search_appearance',
                'Search appearance',
                'Search result feature the site appeared with, such as product snippets or videos.',
                "Values are Google's codes, such as PRODUCT_SNIPPETS, VIDEO or AMP_BLUE_LINK. Usable only on its own, with no other selected dimension.",
            ),
            apiName: 'searchAppearance',
        },
        {
            name: 'search_type',
            apiName: 'search_type',
            label: 'Search type',
            description:
                'Which Google results the numbers come from: web, image, video or news.',
            aiHint: 'Filter it to one type; without a filter it reads web.',
            type: DimensionType.STRING,
            filterOperators: [FilterOperator.EQUALS],
        },
    ],
    metrics: [
        metric(
            'clicks',
            'Clicks',
            MetricType.SUM,
            { aggregation: 'additive' },
            'Number of clicks from Google Search results to the site.',
        ),
        metric(
            'impressions',
            'Impressions',
            MetricType.SUM,
            { aggregation: 'additive' },
            'Number of times a link to the site appeared in search results.',
        ),
        metric(
            'ctr',
            'Click-through rate',
            MetricType.NUMBER,
            {
                aggregation: 'ratio',
                numerator: 'clicks',
                denominator: 'impressions',
            },
            'Clicks as a share of impressions.',
            'A ratio: never sum or average rows.',
            '0.00%',
        ),
        metric(
            'position',
            'Average position',
            MetricType.AVERAGE,
            { aggregation: 'non_additive' },
            'Average top position of the site in search results, where 1 is the top.',
            'Weighted by impressions; never sum it.',
            '0.0',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 28 },
    incompatible: [
        {
            fields: ['search_appearance'],
            with: ['date', 'query', 'page', 'country', 'device'],
            reason: 'Search Console splits by search appearance only on its own, with no other dimension.',
            selectedOnly: true,
        },
    ],
};
