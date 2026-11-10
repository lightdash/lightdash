import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    ApiSourceDimensionDefinition,
    ApiSourceExploreDefinition,
    ApiSourceMetricDefinition,
} from '../apiSourceExplore';

export const META_ADS_SEMANTIC_LAYER_VERSION = 1;

export const META_ADS_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
];

export const META_ADS_ID_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const META_ADS_NAME_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

export type MetaAdsLevel = 'account' | 'campaign' | 'adset' | 'ad';

/** Coarsest first; a query reads at the finest level it groups by. */
export const META_ADS_LEVELS: readonly MetaAdsLevel[] = [
    'account',
    'campaign',
    'adset',
    'ad',
];

/** Which reporting level each ad object field needs. */
export const META_ADS_FIELD_LEVELS: Record<string, MetaAdsLevel> = {
    campaign_id: 'campaign',
    campaign_name: 'campaign',
    objective: 'campaign',
    adset_id: 'adset',
    adset_name: 'adset',
    ad_id: 'ad',
    ad_name: 'ad',
};

/** The Insights `filtering` field of each filterable ad object field. */
export const META_ADS_FILTER_FIELDS: Record<string, string> = {
    campaign_id: 'campaign.id',
    campaign_name: 'campaign.name',
    adset_id: 'adset.id',
    adset_name: 'adset.name',
    ad_id: 'ad.id',
    ad_name: 'ad.name',
};

/**
 * Values Meta reports per breakdown; the ones not listed in its combining
 * table (https://developers.facebook.com/docs/marketing-api/insights/breakdowns),
 * or that need an ad account opt-in such as `impression_device`, are left out.
 */
export const META_ADS_BREAKDOWNS = [
    'age',
    'gender',
    'country',
    'region',
    'publisher_platform',
    'platform_position',
] as const;

const DEMOGRAPHIC_FIELDS = ['age', 'gender'];
const GEO_FIELDS = ['country', 'region'];
const PLACEMENT_FIELDS = ['publisher_platform', 'platform_position'];

const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const dimension = (
    name: string,
    label: string,
    description: string,
    filterOperators: FilterOperator[] = [],
): ApiSourceDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type: DimensionType.STRING,
    filterOperators,
});

// Meta's Insights fields can't be filtered at the row level the way
// dimensions can, so metrics take no filter operators.
const metric = (
    name: string,
    apiName: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    format?: string,
): ApiSourceMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    type,
    filterOperators: [],
    aggregation,
    ...(format ? { format } : {}),
});

const ATTRIBUTION_NOTE =
    "Uses Meta's default attribution (7-day click and 1-day view), which can differ from an ad set's own setting. Empty when Meta reports no value.";

// Additivity follows Meta's Insights docs
// (https://developers.facebook.com/docs/marketing-api/insights): spend,
// impressions, clicks and actions are counts, reach deduplicates people across
// the rows of a report so it can't be rebuilt by summing them, and frequency
// divides by reach. CTR and CPC recompute from their parts; CPM carries a
// factor of 1,000 that a ratio can't express.
export const META_ADS_INSIGHTS_EXPLORE: ApiSourceExploreDefinition = {
    name: 'insights',
    label: 'Insights',
    description:
        'Facebook and Instagram ad performance for one Meta ad account: spend, impressions, reach, clicks and conversions by campaign, ad set, ad, date, demographic and placement. Dates and spend use the ad account time zone and currency.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date_start',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: META_ADS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description:
                'Day of the activity, in the ad account time zone. Queries without a date filter read the last 30 days.',
        },
        {
            name: 'date_month',
            apiName: 'date_start',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
            description:
                'First day of the month, in the ad account time zone. Filter the date to choose the months.',
        },
        dimension(
            'campaign_id',
            'Campaign ID',
            'ID of the campaign.',
            META_ADS_ID_FILTERS,
        ),
        dimension(
            'campaign_name',
            'Campaign name',
            'Name of the campaign.',
            META_ADS_NAME_FILTERS,
        ),
        dimension(
            'objective',
            'Campaign objective',
            'What the campaign was set up to achieve.',
        ),
        dimension(
            'adset_id',
            'Ad set ID',
            'ID of the ad set.',
            META_ADS_ID_FILTERS,
        ),
        dimension(
            'adset_name',
            'Ad set name',
            'Name of the ad set.',
            META_ADS_NAME_FILTERS,
        ),
        dimension('ad_id', 'Ad ID', 'ID of the ad.', META_ADS_ID_FILTERS),
        dimension(
            'ad_name',
            'Ad name',
            'Name of the ad.',
            META_ADS_NAME_FILTERS,
        ),
        dimension('age', 'Age', 'Age range of the audience, such as 25-34.'),
        dimension('gender', 'Gender', 'Gender of the audience.'),
        dimension('country', 'Country', 'Two-letter country code.'),
        dimension('region', 'Region', 'Region or state of the audience.'),
        dimension(
            'publisher_platform',
            'Platform',
            'Where the ad ran: facebook, instagram, messenger or audience_network.',
        ),
        dimension(
            'platform_position',
            'Placement',
            'Position within the platform, such as feed or story. Add Platform too: Meta reports placements per platform.',
        ),
    ],
    metrics: [
        metric(
            'spend',
            'spend',
            'Spend',
            MetricType.SUM,
            ADDITIVE,
            'Amount spent, in the ad account currency. Meta marks this as an estimate.',
            '#,##0.00',
        ),
        metric(
            'impressions',
            'impressions',
            'Impressions',
            MetricType.SUM,
            ADDITIVE,
            'Times the ads were on screen.',
        ),
        metric(
            'reach',
            'reach',
            'Reach',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'People who saw the ads at least once, estimated by Meta. Reach counts each person once per row, so never add rows together: split or filter the query instead. With a breakdown, Meta only reports reach for the last 13 months.',
        ),
        metric(
            'frequency',
            'frequency',
            'Frequency',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average times each person saw the ads, estimated by Meta. Depends on reach, so never add or average rows together.',
            '0.00',
        ),
        metric(
            'clicks',
            'clicks',
            'Clicks (all)',
            MetricType.SUM,
            ADDITIVE,
            'All clicks on the ads, including likes, comments and shares.',
        ),
        metric(
            'link_clicks',
            'inline_link_clicks',
            'Link clicks',
            MetricType.SUM,
            ADDITIVE,
            'Clicks on links that lead away from Meta or to a Meta destination.',
        ),
        metric(
            'ctr',
            'ctr',
            'Click-through rate (all)',
            MetricType.NUMBER,
            {
                aggregation: 'ratio',
                numerator: 'clicks',
                denominator: 'impressions',
            },
            'All clicks divided by impressions.',
            '0.00%',
        ),
        metric(
            'cpc',
            'cpc',
            'Cost per click (all)',
            MetricType.NUMBER,
            { aggregation: 'ratio', numerator: 'spend', denominator: 'clicks' },
            'Spend divided by all clicks.',
            '#,##0.00',
        ),
        metric(
            'cpm',
            'cpm',
            'Cost per 1,000 impressions',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Spend for every 1,000 impressions.',
            '#,##0.00',
        ),
        metric(
            'purchases',
            'actions:omni_purchase',
            'Purchases',
            MetricType.SUM,
            ADDITIVE,
            `Purchases across the website, app and Meta. ${ATTRIBUTION_NOTE}`,
        ),
        metric(
            'purchase_value',
            'action_values:omni_purchase',
            'Purchase value',
            MetricType.SUM,
            ADDITIVE,
            `Value of those purchases, in the ad account currency. ${ATTRIBUTION_NOTE}`,
            '#,##0.00',
        ),
        metric(
            'purchase_roas',
            'purchase_roas:omni_purchase',
            'Purchase ROAS',
            MetricType.NUMBER,
            {
                aggregation: 'ratio',
                numerator: 'purchase_value',
                denominator: 'spend',
            },
            `Purchase value divided by spend. ${ATTRIBUTION_NOTE}`,
            '0.00',
        ),
        metric(
            'leads',
            'actions:lead',
            'Leads',
            MetricType.SUM,
            ADDITIVE,
            `Leads from websites and Meta forms. ${ATTRIBUTION_NOTE}`,
        ),
        metric(
            'landing_page_views',
            'actions:landing_page_view',
            'Landing page views',
            MetricType.SUM,
            ADDITIVE,
            `Times a landing page loaded after a link click. ${ATTRIBUTION_NOTE}`,
        ),
        metric(
            'adds_to_cart',
            'actions:omni_add_to_cart',
            'Adds to cart',
            MetricType.SUM,
            ADDITIVE,
            `Adds to cart across the website, app and Meta. ${ATTRIBUTION_NOTE}`,
        ),
        metric(
            'checkouts_initiated',
            'actions:omni_initiated_checkout',
            'Checkouts initiated',
            MetricType.SUM,
            ADDITIVE,
            `Checkouts started across the website, app and Meta. ${ATTRIBUTION_NOTE}`,
        ),
        metric(
            'registrations_completed',
            'actions:omni_complete_registration',
            'Registrations completed',
            MetricType.SUM,
            ADDITIVE,
            `Registrations across the website, app and Meta. ${ATTRIBUTION_NOTE}`,
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [
        {
            fields: DEMOGRAPHIC_FIELDS,
            with: [...GEO_FIELDS, ...PLACEMENT_FIELDS],
            reason: 'Meta reports age and gender on their own, without location or placement.',
        },
        {
            fields: GEO_FIELDS,
            with: PLACEMENT_FIELDS,
            reason: 'Meta reports location on its own, without placement.',
        },
        {
            fields: ['country'],
            with: ['region'],
            reason: 'Meta reports one location breakdown per query.',
        },
    ],
};
