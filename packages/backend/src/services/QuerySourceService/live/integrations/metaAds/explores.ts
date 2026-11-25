import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

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
    'publisher_platform',
    'platform_position',
] as const;

const DEMOGRAPHIC_FIELDS = ['age', 'gender'];
const GEO_FIELDS = ['country'];
const PLACEMENT_FIELDS = ['publisher_platform', 'platform_position'];

const DEFAULT_DAYS = 30;

const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const dimension = (
    name: string,
    label: string,
    description: string,
    filterOperators: FilterOperator[] = [],
): LiveDimensionDefinition => ({
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
): LiveMetricDefinition => ({
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

const RATIO_NOTE = 'A ratio: never sum or average rows.';

// Additivity follows Meta's Insights docs
// (https://developers.facebook.com/docs/marketing-api/insights): spend,
// impressions, clicks and actions are counts, reach deduplicates people across
// the rows of a report so it can't be rebuilt by summing them, and frequency
// divides by reach. CTR and CPC recompute from their parts; CPM carries a
// factor of 1,000 that a ratio can't express.
export const META_ADS_INSIGHTS_EXPLORE: LiveExploreDefinition = {
    name: 'insights',
    label: 'Insights',
    description:
        'Facebook and Instagram ad performance for one Meta ad account: spend, reach, impressions, clicks and conversions, by campaign, ad set, ad, date, audience and placement. Dates are in the ad account time zone and money is in the ad account currency.',
    aiHint: `Without a Date filter the query reads the last ${DEFAULT_DAYS} days. Meta reports Age and Gender only on their own, without Country, Platform or Placement; and Country only without Platform or Placement. Add Platform whenever you use Placement. Reach and Frequency count each person once per row: never sum or average rows; split or filter the query instead. With a breakdown, Meta only reports reach for the last 13 months. Conversion metrics use Meta's default attribution (7-day click, 1-day view). Spend, reach and frequency are Meta estimates.`,
    dimensions: [
        {
            name: 'date',
            apiName: 'date_start',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: META_ADS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description: 'Day of the activity, in the ad account time zone.',
            aiHint: `Without a date filter the query reads the last ${DEFAULT_DAYS} days.`,
        },
        {
            name: 'date_month',
            apiName: 'date_start',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
            description:
                'Month of the activity, shown as its first day, in the ad account time zone.',
            aiHint: 'Filter Date, not this field, to choose the months.',
        },
        dimension(
            'campaign_id',
            'Campaign ID',
            'Meta campaign ID.',
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
            'What the campaign is set up to achieve, such as sales, leads or traffic.',
        ),
        dimension(
            'adset_id',
            'Ad set ID',
            'Meta ad set ID.',
            META_ADS_ID_FILTERS,
        ),
        dimension(
            'adset_name',
            'Ad set name',
            'Name of the ad set.',
            META_ADS_NAME_FILTERS,
        ),
        dimension('ad_id', 'Ad ID', 'Meta ad ID.', META_ADS_ID_FILTERS),
        dimension(
            'ad_name',
            'Ad name',
            'Name of the ad.',
            META_ADS_NAME_FILTERS,
        ),
        {
            ...dimension(
                'age',
                'Age',
                'Age range of the people reached, such as 25-34.',
            ),
            aiHint: 'Reported only on its own: not with Country, Platform or Placement.',
        },
        {
            ...dimension('gender', 'Gender', 'Gender of the people reached.'),
            aiHint: 'Reported only on its own: not with Country, Platform or Placement.',
        },
        {
            ...dimension(
                'country',
                'Country',
                'Two-letter code of the country of the people reached.',
            ),
            aiHint: 'Reported without Platform or Placement, and without Age or Gender.',
        },
        dimension(
            'publisher_platform',
            'Platform',
            'Where the ad ran: facebook, instagram, messenger or audience_network.',
        ),
        {
            ...dimension(
                'platform_position',
                'Placement',
                'Position within the platform, such as feed or story.',
            ),
            aiHint: 'Add Platform too: Meta reports placements per platform.',
        },
    ],
    metrics: [
        metric(
            'spend',
            'spend',
            'Spend',
            MetricType.SUM,
            ADDITIVE,
            'Amount spent, in the ad account currency. Meta reports it as an estimate.',
            '#,##0.00',
        ),
        metric(
            'impressions',
            'impressions',
            'Impressions',
            MetricType.SUM,
            ADDITIVE,
            'Number of times the ads were on screen.',
        ),
        {
            ...metric(
                'reach',
                'reach',
                'Reach',
                MetricType.NUMBER,
                NON_ADDITIVE,
                'Estimated number of people who saw the ads at least once.',
            ),
            aiHint: 'Counts each person once per row: never sum rows. With a breakdown, only the last 13 months are reported.',
        },
        {
            ...metric(
                'frequency',
                'frequency',
                'Frequency',
                MetricType.NUMBER,
                NON_ADDITIVE,
                'Average number of times each person saw the ads, estimated by Meta.',
                '0.00',
            ),
            aiHint: 'Depends on reach: never sum or average rows.',
        },
        metric(
            'clicks',
            'clicks',
            'Clicks (all)',
            MetricType.SUM,
            ADDITIVE,
            'Number of all clicks on the ads, including link clicks, likes, comments and shares.',
        ),
        metric(
            'link_clicks',
            'inline_link_clicks',
            'Link clicks',
            MetricType.SUM,
            ADDITIVE,
            'Number of clicks on links in the ads to destinations on or off Meta.',
        ),
        {
            ...metric(
                'ctr',
                'ctr',
                'Click-through rate (all)',
                MetricType.NUMBER,
                {
                    aggregation: 'ratio',
                    numerator: 'clicks',
                    denominator: 'impressions',
                },
                'All clicks as a share of impressions.',
                '0.00%',
            ),
            aiHint: RATIO_NOTE,
        },
        {
            ...metric(
                'cpc',
                'cpc',
                'Cost per click (all)',
                MetricType.NUMBER,
                {
                    aggregation: 'ratio',
                    numerator: 'spend',
                    denominator: 'clicks',
                },
                'Average cost per click (all clicks), in the ad account currency.',
                '#,##0.00',
            ),
            aiHint: RATIO_NOTE,
        },
        {
            ...metric(
                'cpm',
                'cpm',
                'Cost per 1,000 impressions',
                MetricType.NUMBER,
                NON_ADDITIVE,
                'Average cost per 1,000 impressions, in the ad account currency.',
                '#,##0.00',
            ),
            aiHint: RATIO_NOTE,
        },
        {
            ...metric(
                'purchases',
                'actions:omni_purchase',
                'Purchases',
                MetricType.SUM,
                ADDITIVE,
                'Number of purchases on the website, in the app and on Meta, attributed to the ads.',
            ),
            aiHint: ATTRIBUTION_NOTE,
        },
        {
            ...metric(
                'purchase_value',
                'action_values:omni_purchase',
                'Purchase value',
                MetricType.SUM,
                ADDITIVE,
                'Value of those purchases, in the ad account currency.',
                '#,##0.00',
            ),
            aiHint: ATTRIBUTION_NOTE,
        },
        {
            ...metric(
                'purchase_roas',
                'purchase_roas:omni_purchase',
                'Purchase ROAS',
                MetricType.NUMBER,
                {
                    aggregation: 'ratio',
                    numerator: 'purchase_value',
                    denominator: 'spend',
                },
                'Purchase value divided by spend (return on ad spend).',
                '0.00',
            ),
            aiHint: `${ATTRIBUTION_NOTE} ${RATIO_NOTE}`,
        },
        {
            ...metric(
                'leads',
                'actions:lead',
                'Leads',
                MetricType.SUM,
                ADDITIVE,
                'Number of leads from websites and Meta lead forms, attributed to the ads.',
            ),
            aiHint: ATTRIBUTION_NOTE,
        },
        {
            ...metric(
                'landing_page_views',
                'actions:landing_page_view',
                'Landing page views',
                MetricType.SUM,
                ADDITIVE,
                'Number of times a landing page loaded after someone clicked a link in the ad.',
            ),
            aiHint: ATTRIBUTION_NOTE,
        },
        {
            ...metric(
                'adds_to_cart',
                'actions:omni_add_to_cart',
                'Adds to cart',
                MetricType.SUM,
                ADDITIVE,
                'Number of adds to cart on the website, in the app and on Meta, attributed to the ads.',
            ),
            aiHint: ATTRIBUTION_NOTE,
        },
        {
            ...metric(
                'checkouts_initiated',
                'actions:omni_initiated_checkout',
                'Checkouts initiated',
                MetricType.SUM,
                ADDITIVE,
                'Number of checkouts started on the website, in the app and on Meta, attributed to the ads.',
            ),
            aiHint: ATTRIBUTION_NOTE,
        },
        {
            ...metric(
                'registrations_completed',
                'actions:omni_complete_registration',
                'Registrations completed',
                MetricType.SUM,
                ADDITIVE,
                'Number of registrations completed on the website, in the app and on Meta, attributed to the ads.',
            ),
            aiHint: ATTRIBUTION_NOTE,
        },
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: DEFAULT_DAYS },
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
    ],
};
