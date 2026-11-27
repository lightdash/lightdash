import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    ratio,
} from '../../explores/declare';
import type { LiveExploreDefinition } from '../../explores/definition';
import {
    SEARCH_CONSOLE_DATE_FILTERS,
    SEARCH_CONSOLE_STRING_FILTERS,
} from './filters';

export const SEARCH_CONSOLE_PERFORMANCE_EXPLORE: LiveExploreDefinition = {
    name: 'performance',
    label: 'Search performance',
    description:
        'Google Search clicks, impressions, click-through rate and average position for one Search Console site. Dates are in Pacific Time.',
    aiHint: 'Without a Date filter the query reads the last 28 days; the last two or three days are incomplete. Search type defaults to web; filter it to exactly one of web, image, video or news. Search appearance can only be used on its own, with no other dimension (filtering by other dimensions is fine). Google hides rare queries for privacy, so totals by Query are lower than site totals. Splitting or filtering by Page counts impressions per page, so totals by page can exceed site totals. CTR and Average position are not additive.',
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
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: SEARCH_CONSOLE_DATE_FILTERS,
            description: 'Day of the search, in Pacific Time.',
            aiHint: 'Without a date filter the query reads the last 28 days. The last two or three days are incomplete.',
        }),
        dimension({
            name: 'query',
            label: 'Query',
            type: DimensionType.STRING,
            filterOperators: SEARCH_CONSOLE_STRING_FILTERS,
            description: 'What people searched for on Google.',
            aiHint: 'Google hides rare queries for privacy, so totals by query are lower than site totals.',
        }),
        dimension({
            name: 'page',
            label: 'Page',
            type: DimensionType.STRING,
            filterOperators: SEARCH_CONSOLE_STRING_FILTERS,
            description: 'URL of the page shown in the search result.',
            aiHint: 'Splitting or filtering by page counts impressions per page, so a result showing two of your pages counts twice.',
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: SEARCH_CONSOLE_STRING_FILTERS,
            description:
                'Country of the searcher, as a three-letter code such as USA.',
        }),
        dimension({
            name: 'device',
            label: 'Device',
            type: DimensionType.STRING,
            filterOperators: SEARCH_CONSOLE_STRING_FILTERS,
            description:
                'Device the search was made on: DESKTOP, MOBILE or TABLET.',
        }),
        dimension({
            name: 'search_appearance',
            apiName: 'searchAppearance',
            label: 'Search appearance',
            type: DimensionType.STRING,
            filterOperators: SEARCH_CONSOLE_STRING_FILTERS,
            description:
                'Search result feature the site appeared with, such as product snippets or videos.',
            aiHint: "Values are Google's codes, such as PRODUCT_SNIPPETS, VIDEO or AMP_BLUE_LINK. Usable only on its own, with no other selected dimension.",
        }),
        dimension({
            name: 'search_type',
            label: 'Search type',
            type: DimensionType.STRING,
            filterOperators: [FilterOperator.EQUALS],
            description:
                'Which Google results the numbers come from: web, image, video or news.',
            aiHint: 'Filter it to one type; without a filter it reads web.',
        }),
    ],
    // Additivity per the Search Analytics docs
    // (https://developers.google.com/webmaster-tools/v1/searchanalytics/query,
    // https://support.google.com/webmasters/answer/7042828): clicks and
    // impressions are counts, CTR is clicks / impressions and position is an
    // impression-weighted average, which summed rows can't rebuild. Search
    // Analytics can't filter on metrics.
    metrics: [
        metric({
            name: 'clicks',
            label: 'Clicks',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of clicks from Google Search results to the site.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'impressions',
            label: 'Impressions',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times a link to the site appeared in search results.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'ctr',
            label: 'Click-through rate',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Clicks as a share of impressions.',
            aiHint: 'A ratio: never sum or average rows.',
            format: '0.00%',
            aggregation: ratio('clicks', 'impressions'),
        }),
        metric({
            name: 'position',
            label: 'Average position',
            type: MetricType.AVERAGE,
            filterOperators: [],
            description:
                'Average top position of the site in search results, where 1 is the top.',
            aiHint: 'Weighted by impressions; never sum it.',
            format: '0.0',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

export const SEARCH_CONSOLE_EXPLORES = [
    SEARCH_CONSOLE_PERFORMANCE_EXPLORE,
] as const;
