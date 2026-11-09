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

export const LINKEDIN_ADS_SEMANTIC_LAYER_VERSION = 1;

export const LINKEDIN_ADS_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
];

// adAnalytics facets match whole IDs
export const LINKEDIN_ADS_ID_FILTERS = [FilterOperator.EQUALS];

// adAnalytics takes 20 fields, and every query spends two on dateRange and
// pivotValues (https://learn.microsoft.com/linkedin/marketing/integrations/ads-reporting/ads-reporting)
const MAX_METRICS = 18;

export const LINKEDIN_ADS_CAMPAIGN_COLUMNS = [
    'campaign.id',
    'campaign.name',
    'campaign.status',
    'campaign.type',
    'campaign.objectiveType',
] as const;

export const LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS = [
    'campaignGroup.id',
    'campaignGroup.name',
] as const;

export const LINKEDIN_ADS_DATE_COLUMNS = ['day', 'month', 'year'] as const;

const dateGrain = (
    name: string,
    apiName: (typeof LINKEDIN_ADS_DATE_COLUMNS)[number],
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

const dimension = (
    name: string,
    apiName: string,
    label: string,
    group: string,
    description: string,
    filterOperators: FilterOperator[] = [],
): ApiSourceDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    type: DimensionType.STRING,
    filterOperators,
    groups: [group],
});

// Counts and money are totals per row, so they sum across rows; reach is
// deduplicated within each row and doesn't.
const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const metric = (
    name: string,
    apiName: string,
    label: string,
    group: string,
    description: string,
    overrides: Partial<ApiSourceMetricDefinition> = {},
): ApiSourceMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    type: MetricType.SUM,
    filterOperators: [],
    aggregation: ADDITIVE,
    groups: [group],
    ...overrides,
});

const money = (description: string): Partial<ApiSourceMetricDefinition> => ({
    description,
    format: '#,##0.00',
});

/**
 * LinkedIn Campaign Manager performance for one ad account. These are paid
 * ads only: organic Company Page analytics come from a different API,
 * permission and account (see the planned model names).
 */
export const LINKEDIN_ADS_PERFORMANCE_EXPLORE: ApiSourceExploreDefinition = {
    name: 'performance',
    label: 'Performance',
    description:
        'Spend, impressions, clicks, leads and conversions for one LinkedIn Ads account (Campaign Manager). Sponsored activity only: this does not include organic Company Page analytics.',
    dimensions: [
        {
            name: 'date',
            apiName: 'day',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: LINKEDIN_ADS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description:
                'Day of the activity, in UTC. Queries without a date filter read the last 28 days.',
        },
        dateGrain(
            'date_month',
            'month',
            'Date month',
            TimeFrames.MONTH,
            'First day of the month, in UTC.',
        ),
        dateGrain(
            'date_year',
            'year',
            'Date year',
            TimeFrames.YEAR,
            'First day of the year, in UTC.',
        ),
        dimension(
            'campaign_group_id',
            'campaignGroup.id',
            'Campaign group ID',
            'Campaign group',
            'Numeric campaign group ID.',
            LINKEDIN_ADS_ID_FILTERS,
        ),
        dimension(
            'campaign_group_name',
            'campaignGroup.name',
            'Campaign group name',
            'Campaign group',
            'Current name of the campaign group.',
        ),
        dimension(
            'campaign_id',
            'campaign.id',
            'Campaign ID',
            'Campaign',
            'Numeric campaign ID.',
            LINKEDIN_ADS_ID_FILTERS,
        ),
        dimension(
            'campaign_name',
            'campaign.name',
            'Campaign name',
            'Campaign',
            'Current name of the campaign.',
        ),
        dimension(
            'campaign_status',
            'campaign.status',
            'Campaign status',
            'Campaign',
            'Current status, such as ACTIVE, PAUSED, ARCHIVED or COMPLETED.',
        ),
        dimension(
            'campaign_type',
            'campaign.type',
            'Campaign type',
            'Campaign',
            'TEXT_AD, SPONSORED_UPDATES, SPONSORED_INMAILS or DYNAMIC.',
        ),
        dimension(
            'campaign_objective',
            'campaign.objectiveType',
            'Campaign objective',
            'Campaign',
            'Objective, such as BRAND_AWARENESS, LEAD_GENERATION or WEBSITE_VISIT.',
        ),
    ],
    metrics: [
        metric(
            'cost',
            'costInLocalCurrency',
            'Cost',
            'Delivery',
            '',
            money("Spend in the ad account's currency."),
        ),
        metric(
            'impressions',
            'impressions',
            'Impressions',
            'Delivery',
            'Times members were shown the ads.',
        ),
        metric(
            'reach',
            'approximateMemberReach',
            'Reach',
            'Delivery',
            'Estimated members with at least one impression. Deduplicated per row, so never sum it. LinkedIn reports it for date ranges of 92 days or less.',
            { type: MetricType.MAX, aggregation: NON_ADDITIVE },
        ),
        metric(
            'clicks',
            'clicks',
            'Clicks',
            'Engagement',
            "LinkedIn's chargeable clicks.",
        ),
        metric(
            'landing_page_clicks',
            'landingPageClicks',
            'Landing page clicks',
            'Engagement',
            'Clicks that took a member to the landing page.',
        ),
        metric(
            'total_engagements',
            'totalEngagements',
            'Total engagements',
            'Engagement',
            'All member interactions with the ad.',
        ),
        metric(
            'likes',
            'likes',
            'Likes',
            'Engagement',
            'Sponsored Content only.',
        ),
        metric(
            'comments',
            'comments',
            'Comments',
            'Engagement',
            'Sponsored Content only.',
        ),
        metric(
            'shares',
            'shares',
            'Shares',
            'Engagement',
            'Sponsored Content only.',
        ),
        metric(
            'follows',
            'follows',
            'Follows',
            'Engagement',
            'Sponsored Content and Follower ads only.',
        ),
        metric(
            'video_views',
            'videoViews',
            'Video views',
            'Engagement',
            'Video ad plays of at least two continuous seconds, 50% in view.',
        ),
        metric(
            'video_completions',
            'videoCompletions',
            'Video completions',
            'Engagement',
            'Video ads played to 97 to 100%.',
        ),
        metric(
            'leads',
            'oneClickLeads',
            'Leads',
            'Leads and conversions',
            'Leads from LinkedIn lead gen forms.',
        ),
        metric(
            'lead_form_opens',
            'oneClickLeadFormOpens',
            'Lead form opens',
            'Leads and conversions',
            'Times members opened a lead gen form.',
        ),
        metric(
            'conversions',
            'externalWebsiteConversions',
            'Conversions',
            'Leads and conversions',
            'Website conversions after a click or view.',
        ),
        metric(
            'post_click_conversions',
            'externalWebsitePostClickConversions',
            'Post-click conversions',
            'Leads and conversions',
            'Website conversions after a click on the ad.',
        ),
        metric(
            'post_view_conversions',
            'externalWebsitePostViewConversions',
            'Post-view conversions',
            'Leads and conversions',
            'Website conversions after seeing the ad.',
        ),
        metric(
            'conversion_value',
            'conversionValueInLocalCurrency',
            'Conversion value',
            'Leads and conversions',
            '',
            money("Value of conversions in the ad account's currency."),
        ),
    ],
    maxDimensions: null,
    maxMetrics: MAX_METRICS,
    dateRange: { dimension: 'date', defaultDays: 28 },
    incompatible: [],
};
