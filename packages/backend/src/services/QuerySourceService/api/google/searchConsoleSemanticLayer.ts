import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import type {
    ApiSourceDimensionDefinition,
    ApiSourceExploreDefinition,
    ApiSourceMetricDefinition,
} from '../apiSourceExplore';

export const SEARCH_CONSOLE_SEMANTIC_LAYER_VERSION = 1;

const STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    // Search Console never reports empty values, so this always holds
    FilterOperator.NOT_NULL,
];

const dimension = (
    name: string,
    label: string,
    description?: string,
): ApiSourceDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type: DimensionType.STRING,
    filterOperators: STRING_FILTERS,
});

// Search Analytics can't filter on metrics
const metric = (
    name: string,
    label: string,
    type: MetricType,
    description: string,
    format?: string,
): ApiSourceMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type,
    filterOperators: [],
    ...(format ? { format } : {}),
});

export const SEARCH_CONSOLE_PERFORMANCE_EXPLORE: ApiSourceExploreDefinition = {
    name: 'performance',
    label: 'Search performance',
    description:
        'Google Search clicks, impressions, click-through rate and position for one Search Console site. Dates are Pacific Time and the last two or three days are incomplete.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: [
                FilterOperator.IN_THE_PAST,
                FilterOperator.IN_BETWEEN,
                FilterOperator.EQUALS,
            ],
            description:
                'Day of the search, in Pacific Time. Queries without a date filter read the last 28 days.',
        },
        dimension(
            'query',
            'Query',
            'What people searched for. Google hides rare queries for privacy, so query totals are lower than site totals.',
        ),
        dimension(
            'page',
            'Page',
            'Splitting or filtering by page counts impressions per page, so a result showing two of your pages counts twice.',
        ),
        dimension('country', 'Country', 'Three-letter country code.'),
        dimension('device', 'Device', 'DESKTOP, MOBILE or TABLET.'),
        {
            ...dimension(
                'search_appearance',
                'Search appearance',
                'Rich result type.',
            ),
            apiName: 'searchAppearance',
        },
    ],
    metrics: [
        metric(
            'clicks',
            'Clicks',
            MetricType.SUM,
            'Clicks from Google Search.',
        ),
        metric(
            'impressions',
            'Impressions',
            MetricType.SUM,
            'Times a link to the site appeared in results.',
        ),
        metric(
            'ctr',
            'Click-through rate',
            MetricType.NUMBER,
            'Clicks divided by impressions.',
            '0.00%',
        ),
        metric(
            'position',
            'Average position',
            MetricType.AVERAGE,
            'Average top position in results, weighted by impressions.',
            '0.0',
        ),
    ],
    filterGroups: { or: false, nested: false },
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 28 },
    incompatible: [],
};
