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

export const GOOGLE_ADS_SEMANTIC_LAYER_VERSION = 1;

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
): ApiSourceDimensionDefinition => ({
    name,
    apiName,
    label,
    type: DimensionType.DATE,
    filterOperators: [],
    timeInterval: { base: 'date', grain },
    description,
});

const exactDimension = (
    name: string,
    apiName: string,
    label: string,
    group: string | undefined,
    description: string,
): ApiSourceDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
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
): ApiSourceDimensionDefinition => ({
    ...exactDimension(name, apiName, label, group, description),
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
): ApiSourceMetricDefinition => ({
    name,
    apiName,
    label,
    description,
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

const IMPRESSION_SHARE_NOTE =
    'Search campaigns only. Google rounds values under 10% to 9.99% and over 90% to 90.01%, and shares can never be summed.';

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
export const GOOGLE_ADS_PERFORMANCE_EXPLORE: ApiSourceExploreDefinition = {
    name: 'performance',
    label: 'Ad performance',
    description:
        'Cost, clicks, impressions and conversions for one Google Ads account, by day and by campaign or ad group. Dates are in the account time zone, money is in the account currency, text filters are case-sensitive, and the most recent hours can still change.',
    dimensions: [
        {
            name: 'date',
            apiName: 'segments.date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: GOOGLE_ADS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description:
                'Day of the activity, in the account time zone. Queries without a date filter read the last 30 days. Day and week breakdowns only reach back 37 months.',
        },
        dateGrain(
            'date_week',
            'segments.week',
            'Date week',
            TimeFrames.WEEK,
            'Monday of the week. Filter the date to choose the weeks.',
        ),
        dateGrain(
            'date_month',
            'segments.month',
            'Date month',
            TimeFrames.MONTH,
            'First day of the month. Filter the date to choose the months.',
        ),
        dateGrain(
            'date_quarter',
            'segments.quarter',
            'Date quarter',
            TimeFrames.QUARTER,
            'First day of the quarter. Filter the date to choose the quarters.',
        ),
        dateGrain(
            'date_year',
            'segments.year',
            'Date year',
            TimeFrames.YEAR,
            'First day of the year. Filter the date to choose the years.',
        ),
        exactDimension(
            'day_of_week',
            'segments.day_of_week',
            'Day of week',
            undefined,
            'MONDAY to SUNDAY. To filter by it, also add it to the results.',
        ),
        exactDimension(
            'device',
            'segments.device',
            'Device',
            undefined,
            'MOBILE, TABLET, DESKTOP, CONNECTED_TV or OTHER. To filter by it, also add it to the results.',
        ),
        exactDimension(
            'network',
            'segments.ad_network_type',
            'Network',
            undefined,
            'SEARCH, SEARCH_PARTNERS, CONTENT (Display), YOUTUBE, GOOGLE_TV or MIXED. To filter by it, also add it to the results.',
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
            'Currency of every money metric, as an ISO 4217 code.',
        ),
        exactDimension(
            'campaign_id',
            'campaign.id',
            'Campaign ID',
            'Campaign',
            'Numeric campaign ID.',
        ),
        textDimension(
            'campaign_name',
            'campaign.name',
            'Campaign name',
            'Campaign',
            'A removed campaign can share its name with a live one; add the campaign ID to tell them apart.',
        ),
        exactDimension(
            'campaign_status',
            'campaign.status',
            'Campaign status',
            'Campaign',
            'ENABLED, PAUSED or REMOVED. Needs the campaign name or ID in the results.',
        ),
        exactDimension(
            'campaign_type',
            'campaign.advertising_channel_type',
            'Campaign type',
            'Campaign',
            'SEARCH, DISPLAY, SHOPPING, VIDEO, PERFORMANCE_MAX, DEMAND_GEN and others. Needs the campaign name or ID in the results.',
        ),
        exactDimension(
            'campaign_bidding_strategy_type',
            'campaign.bidding_strategy_type',
            'Campaign bidding strategy type',
            'Campaign',
            'For example TARGET_CPA, MAXIMIZE_CONVERSIONS or MANUAL_CPC. Needs the campaign name or ID in the results.',
        ),
        exactDimension(
            'ad_group_id',
            'ad_group.id',
            'Ad group ID',
            'Ad group',
            'Numeric ad group ID.',
        ),
        textDimension(
            'ad_group_name',
            'ad_group.name',
            'Ad group name',
            'Ad group',
            'Unique only within a campaign, so it needs the campaign name or ID in the results.',
        ),
        exactDimension(
            'ad_group_status',
            'ad_group.status',
            'Ad group status',
            'Ad group',
            'ENABLED, PAUSED or REMOVED. Needs the ad group ID in the results.',
        ),
        exactDimension(
            'ad_group_type',
            'ad_group.type',
            'Ad group type',
            'Ad group',
            'For example SEARCH_STANDARD or DISPLAY_STANDARD. Needs the ad group ID in the results.',
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
            'Clicks on the ads.',
            COUNT_FORMAT,
        ),
        metric(
            'impressions',
            'metrics.impressions',
            'Impressions',
            MetricType.SUM,
            ADDITIVE,
            'Times the ads were shown.',
            COUNT_FORMAT,
        ),
        metric(
            'ctr',
            'metrics.ctr',
            'Click-through rate',
            MetricType.NUMBER,
            ratio('clicks', 'impressions'),
            'Clicks divided by impressions.',
            PERCENT_FORMAT,
        ),
        metric(
            'average_cpc',
            'metrics.average_cpc',
            'Average CPC',
            MetricType.NUMBER,
            ratio('cost', 'clicks'),
            'Cost divided by clicks, in the account currency.',
            CURRENCY_FORMAT,
        ),
        metric(
            'average_cpm',
            'metrics.average_cpm',
            'Average CPM',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Cost per thousand impressions, in the account currency.',
            CURRENCY_FORMAT,
        ),
        metric(
            'interactions',
            'metrics.interactions',
            'Interactions',
            MetricType.SUM,
            ADDITIVE,
            'Clicks, video views and other main interactions, by ad format.',
            COUNT_FORMAT,
        ),
        metric(
            'interaction_rate',
            'metrics.interaction_rate',
            'Interaction rate',
            MetricType.NUMBER,
            ratio('interactions', 'impressions'),
            'Interactions divided by impressions.',
            PERCENT_FORMAT,
        ),
        metric(
            'engagements',
            'metrics.engagements',
            'Engagements',
            MetricType.SUM,
            ADDITIVE,
            'Engagements such as Lightbox expansions.',
            COUNT_FORMAT,
        ),
        metric(
            'conversions',
            'metrics.conversions',
            'Conversions',
            MetricType.SUM,
            ADDITIVE,
            'Conversions counted by the account’s bidding goals. Attribution can make them fractional, and they keep changing for as long as the conversion window lasts.',
            COUNT_FORMAT,
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
            'Conversions divided by interactions.',
            PERCENT_FORMAT,
        ),
        metric(
            'cost_per_conversion',
            'metrics.cost_per_conversion',
            'Cost per conversion',
            MetricType.NUMBER,
            ratio('cost', 'conversions'),
            'Cost divided by conversions, in the account currency.',
            CURRENCY_FORMAT,
        ),
        metric(
            'value_per_conversion',
            'metrics.value_per_conversion',
            'Value per conversion',
            MetricType.NUMBER,
            ratio('conversions_value', 'conversions'),
            'Conversion value divided by conversions, in the account currency.',
            CURRENCY_FORMAT,
        ),
        metric(
            'all_conversions',
            'metrics.all_conversions',
            'All conversions',
            MetricType.SUM,
            ADDITIVE,
            'Every conversion, including those not used for bidding.',
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
            'Conversions after an impression with no interaction.',
            COUNT_FORMAT,
        ),
        metric(
            'search_impression_share',
            'metrics.search_impression_share',
            'Search impression share',
            MetricType.NUMBER,
            NON_ADDITIVE,
            `Impressions received divided by those the ads were eligible for. ${IMPRESSION_SHARE_NOTE}`,
            PERCENT_FORMAT,
        ),
        metric(
            'search_top_impression_share',
            'metrics.search_top_impression_share',
            'Search top impression share',
            MetricType.NUMBER,
            NON_ADDITIVE,
            `Share of eligible impressions above the organic results. ${IMPRESSION_SHARE_NOTE}`,
            PERCENT_FORMAT,
        ),
        metric(
            'search_absolute_top_impression_share',
            'metrics.search_absolute_top_impression_share',
            'Search absolute top impression share',
            MetricType.NUMBER,
            NON_ADDITIVE,
            `Share of eligible impressions in the very first position. ${IMPRESSION_SHARE_NOTE}`,
            PERCENT_FORMAT,
        ),
        metric(
            'search_budget_lost_impression_share',
            'metrics.search_budget_lost_impression_share',
            'Search lost impression share (budget)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            `Share of eligible impressions missed because of budget. ${IMPRESSION_SHARE_NOTE}`,
            PERCENT_FORMAT,
        ),
        metric(
            'search_rank_lost_impression_share',
            'metrics.search_rank_lost_impression_share',
            'Search lost impression share (rank)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            `Share of eligible impressions missed because of ad rank. ${IMPRESSION_SHARE_NOTE}`,
            PERCENT_FORMAT,
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};
