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

export const GOOGLE_ADS_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
];

// Ids and enums only compare whole values in GAQL
const GOOGLE_ADS_EXACT_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const GOOGLE_ADS_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
];

export const GOOGLE_ADS_METRIC_FILTERS = [
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
];

/** Money fields GAQL reports in millionths of the account currency. */
export const GOOGLE_ADS_MICROS_FIELDS: ReadonlySet<string> = new Set([
    'metrics.cost_micros',
    'metrics.average_cpc',
    'metrics.average_cpm',
    'metrics.cost_per_conversion',
]);

const dateGrain = (
    name: string,
    apiName: string,
    label: string,
    grain: TimeFrames,
    description: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    type: DimensionType.DATE,
    filterOperators: [],
    timeInterval: { base: 'date', grain },
    description,
    ...(aiHint ? { aiHint } : {}),
});

const exactDimension = (
    name: string,
    apiName: string,
    label: string,
    group: string | undefined,
    description: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type: DimensionType.STRING,
    filterOperators: GOOGLE_ADS_EXACT_FILTERS,
    ...(group ? { groups: [group] } : {}),
});

const textDimension = (
    name: string,
    apiName: string,
    label: string,
    group: string,
    description: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    ...exactDimension(name, apiName, label, group, description, aiHint),
    filterOperators: GOOGLE_ADS_STRING_FILTERS,
});

const metric = (
    name: string,
    apiName: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    format?: string,
    aiHint?: string,
): LiveMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators: GOOGLE_ADS_METRIC_FILTERS,
    aggregation,
    ...(format ? { format } : {}),
});

const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};
const ratio = (
    numerator: string,
    denominator: string,
): ApiSourceMetricAggregation => ({
    aggregation: 'ratio',
    numerator,
    denominator,
});

const CURRENCY_FORMAT = '#,##0.00';
const COUNT_FORMAT = '#,##0.##';
const PERCENT_FORMAT = '0.00%';

const IMPRESSION_SHARE_HINT =
    'Search campaigns only. Google reports values under 10% as 0.0999 and over 90% as 0.9001. A share: never sum or average rows.';

// Additivity per the metric definitions in
// https://developers.google.com/google-ads/api/fields/v26/metrics: counts and
// money add up; rates are the quotient of two counts; CPM carries a factor of
// 1,000 and impression shares have eligible impressions as a denominator the
// API doesn't report, so neither can be rebuilt from summed rows.

/**
 * Names are frozen once customers save charts on them. A GAQL report returns
 * one row per resource and segment, so `googleAdsCompiler` picks the resource
 * from the fields selected: see its comment for what it has to refuse.
 */
export const GOOGLE_ADS_PERFORMANCE_EXPLORE: LiveExploreDefinition = {
    name: 'performance',
    label: 'Ad performance',
    description:
        'Cost, clicks, impressions and conversions for one Google Ads account, by day and by campaign or ad group. Dates are in the account time zone and money is in the account currency.',
    aiHint: 'Without a Date filter the query reads the last 30 days; day and week breakdowns only reach back 37 months. Text filters are case-sensitive. The most recent hours can still change, and conversions keep changing for as long as the conversion window lasts. To filter by Day of week, Device or Network, also add it to the results. Campaign status, type and bidding strategy need Campaign name or Campaign ID in the results; Ad group name needs the campaign too; Ad group status and type need Ad group ID. Rates, averages and impression shares are not additive.',
    dimensions: [
        {
            name: 'date',
            apiName: 'segments.date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: GOOGLE_ADS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description: 'Day of the activity, in the account time zone.',
            aiHint: 'Without a date filter the query reads the last 30 days. Day and week breakdowns only reach back 37 months.',
        },
        dateGrain(
            'date_week',
            'segments.week',
            'Date week',
            TimeFrames.WEEK,
            'Week of the activity, shown as its Monday.',
            'Filter Date, not this field, to choose the weeks.',
        ),
        dateGrain(
            'date_month',
            'segments.month',
            'Date month',
            TimeFrames.MONTH,
            'Month of the activity, shown as its first day.',
            'Filter Date, not this field, to choose the months.',
        ),
        dateGrain(
            'date_quarter',
            'segments.quarter',
            'Date quarter',
            TimeFrames.QUARTER,
            'Quarter of the activity, shown as its first day.',
            'Filter Date, not this field, to choose the quarters.',
        ),
        dateGrain(
            'date_year',
            'segments.year',
            'Date year',
            TimeFrames.YEAR,
            'Year of the activity, shown as its first day.',
            'Filter Date, not this field, to choose the years.',
        ),
        exactDimension(
            'day_of_week',
            'segments.day_of_week',
            'Day of week',
            undefined,
            'Day of the week, MONDAY to SUNDAY.',
            'To filter by it, also add it to the results.',
        ),
        exactDimension(
            'device',
            'segments.device',
            'Device',
            undefined,
            'Device the ad was shown on: MOBILE, TABLET, DESKTOP, CONNECTED_TV or OTHER.',
            'To filter by it, also add it to the results.',
        ),
        exactDimension(
            'network',
            'segments.ad_network_type',
            'Network',
            undefined,
            'Network the ad ran on: SEARCH, SEARCH_PARTNERS, CONTENT (Display), YOUTUBE, GOOGLE_TV or MIXED.',
            'To filter by it, also add it to the results.',
        ),
        exactDimension(
            'account_id',
            'customer.id',
            'Account ID',
            'Account',
            'Google Ads customer ID, digits only.',
        ),
        textDimension(
            'account_name',
            'customer.descriptive_name',
            'Account name',
            'Account',
            'Name of the Google Ads account.',
        ),
        textDimension(
            'account_currency',
            'customer.currency_code',
            'Account currency',
            'Account',
            'Currency of all money metrics, as an ISO 4217 code such as USD.',
        ),
        exactDimension(
            'campaign_id',
            'campaign.id',
            'Campaign ID',
            'Campaign',
            'Google Ads campaign ID.',
        ),
        textDimension(
            'campaign_name',
            'campaign.name',
            'Campaign name',
            'Campaign',
            'Name of the campaign.',
            'A removed campaign can share its name with a live one; add Campaign ID to tell them apart.',
        ),
        exactDimension(
            'campaign_status',
            'campaign.status',
            'Campaign status',
            'Campaign',
            'Campaign status: ENABLED, PAUSED or REMOVED.',
            'Needs Campaign name or Campaign ID in the results.',
        ),
        exactDimension(
            'campaign_type',
            'campaign.advertising_channel_type',
            'Campaign type',
            'Campaign',
            'Campaign type, such as SEARCH, DISPLAY, SHOPPING, VIDEO, PERFORMANCE_MAX or DEMAND_GEN.',
            'Needs Campaign name or Campaign ID in the results.',
        ),
        exactDimension(
            'campaign_bidding_strategy_type',
            'campaign.bidding_strategy_type',
            'Campaign bidding strategy type',
            'Campaign',
            'How the campaign bids, such as TARGET_CPA, MAXIMIZE_CONVERSIONS or MANUAL_CPC.',
            'Needs Campaign name or Campaign ID in the results.',
        ),
        exactDimension(
            'ad_group_id',
            'ad_group.id',
            'Ad group ID',
            'Ad group',
            'Google Ads ad group ID.',
        ),
        textDimension(
            'ad_group_name',
            'ad_group.name',
            'Ad group name',
            'Ad group',
            'Name of the ad group.',
            'Unique only within a campaign: needs Campaign name or Campaign ID in the results.',
        ),
        exactDimension(
            'ad_group_status',
            'ad_group.status',
            'Ad group status',
            'Ad group',
            'Ad group status: ENABLED, PAUSED or REMOVED.',
            'Needs Ad group ID in the results.',
        ),
        exactDimension(
            'ad_group_type',
            'ad_group.type',
            'Ad group type',
            'Ad group',
            'Ad group type, such as SEARCH_STANDARD or DISPLAY_STANDARD.',
            'Needs Ad group ID in the results.',
        ),
    ],
    metrics: [
        metric(
            'cost',
            'metrics.cost_micros',
            'Cost',
            MetricType.SUM,
            ADDITIVE,
            'Amount spent, in the account currency.',
            CURRENCY_FORMAT,
        ),
        metric(
            'clicks',
            'metrics.clicks',
            'Clicks',
            MetricType.SUM,
            ADDITIVE,
            'Number of clicks on the ads.',
            COUNT_FORMAT,
        ),
        metric(
            'impressions',
            'metrics.impressions',
            'Impressions',
            MetricType.SUM,
            ADDITIVE,
            'Number of times the ads were shown.',
            COUNT_FORMAT,
        ),
        metric(
            'ctr',
            'metrics.ctr',
            'Click-through rate',
            MetricType.NUMBER,
            ratio('clicks', 'impressions'),
            'Clicks as a share of impressions.',
            PERCENT_FORMAT,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'average_cpc',
            'metrics.average_cpc',
            'Average CPC',
            MetricType.NUMBER,
            ratio('cost', 'clicks'),
            'Average cost per click, in the account currency.',
            CURRENCY_FORMAT,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'average_cpm',
            'metrics.average_cpm',
            'Average CPM',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average cost per 1,000 impressions, in the account currency.',
            CURRENCY_FORMAT,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'interactions',
            'metrics.interactions',
            'Interactions',
            MetricType.SUM,
            ADDITIVE,
            'Number of main interactions with the ads, such as clicks on text ads or video views, depending on ad format.',
            COUNT_FORMAT,
        ),
        metric(
            'interaction_rate',
            'metrics.interaction_rate',
            'Interaction rate',
            MetricType.NUMBER,
            ratio('interactions', 'impressions'),
            'Interactions as a share of impressions.',
            PERCENT_FORMAT,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'conversions',
            'metrics.conversions',
            'Conversions',
            MetricType.SUM,
            ADDITIVE,
            "Conversions counted toward the account's bidding goals. Attribution can make them fractional.",
            COUNT_FORMAT,
            'Keep changing for as long as the conversion window lasts.',
        ),
        metric(
            'conversions_value',
            'metrics.conversions_value',
            'Conversion value',
            MetricType.SUM,
            ADDITIVE,
            'Value of those conversions, in the account currency.',
            CURRENCY_FORMAT,
        ),
        metric(
            'conversion_rate',
            'metrics.conversions_from_interactions_rate',
            'Conversion rate',
            MetricType.NUMBER,
            ratio('conversions', 'interactions'),
            'Conversions as a share of interactions.',
            PERCENT_FORMAT,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'cost_per_conversion',
            'metrics.cost_per_conversion',
            'Cost per conversion',
            MetricType.NUMBER,
            ratio('cost', 'conversions'),
            'Average cost per conversion, in the account currency.',
            CURRENCY_FORMAT,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'value_per_conversion',
            'metrics.value_per_conversion',
            'Value per conversion',
            MetricType.NUMBER,
            ratio('conversions_value', 'conversions'),
            'Average conversion value per conversion, in the account currency.',
            CURRENCY_FORMAT,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'all_conversions',
            'metrics.all_conversions',
            'All conversions',
            MetricType.SUM,
            ADDITIVE,
            'All conversions, including those not used for bidding.',
            COUNT_FORMAT,
        ),
        metric(
            'all_conversions_value',
            'metrics.all_conversions_value',
            'All conversions value',
            MetricType.SUM,
            ADDITIVE,
            'Value of all conversions, in the account currency.',
            CURRENCY_FORMAT,
        ),
        metric(
            'view_through_conversions',
            'metrics.view_through_conversions',
            'View-through conversions',
            MetricType.SUM,
            ADDITIVE,
            'Conversions after someone saw an ad but did not interact with it.',
            COUNT_FORMAT,
        ),
        metric(
            'search_impression_share',
            'metrics.search_impression_share',
            'Search impression share',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Impressions the ads received as a share of the impressions they were eligible for.',
            PERCENT_FORMAT,
            IMPRESSION_SHARE_HINT,
        ),
        metric(
            'search_top_impression_share',
            'metrics.search_top_impression_share',
            'Search top impression share',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Share of eligible impressions shown above the organic search results.',
            PERCENT_FORMAT,
            IMPRESSION_SHARE_HINT,
        ),
        metric(
            'search_absolute_top_impression_share',
            'metrics.search_absolute_top_impression_share',
            'Search absolute top impression share',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Share of eligible impressions shown as the very first ad above the organic search results.',
            PERCENT_FORMAT,
            IMPRESSION_SHARE_HINT,
        ),
        metric(
            'search_budget_lost_impression_share',
            'metrics.search_budget_lost_impression_share',
            'Search lost impression share (budget)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Share of eligible impressions missed because the budget was too low.',
            PERCENT_FORMAT,
            IMPRESSION_SHARE_HINT,
        ),
        metric(
            'search_rank_lost_impression_share',
            'metrics.search_rank_lost_impression_share',
            'Search lost impression share (rank)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Share of eligible impressions missed because of low ad rank.',
            PERCENT_FORMAT,
            IMPRESSION_SHARE_HINT,
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};
