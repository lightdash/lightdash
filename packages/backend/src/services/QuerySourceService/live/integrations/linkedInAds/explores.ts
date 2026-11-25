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
const DEFAULT_DAYS = 28;

/**
 * adAnalytics reports IDs only. Names, statuses and types would need an
 * account-wide lookup on every query, so the explore has none.
 */
export const LINKEDIN_ADS_CAMPAIGN_COLUMNS = ['campaign.id'] as const;

export const LINKEDIN_ADS_CAMPAIGN_GROUP_COLUMNS = [
    'campaignGroup.id',
] as const;

export const LINKEDIN_ADS_DATE_COLUMNS = ['day', 'month', 'year'] as const;

const dateGrain = (
    name: string,
    apiName: (typeof LINKEDIN_ADS_DATE_COLUMNS)[number],
    label: string,
    grain: TimeFrames,
    description: string,
): LiveDimensionDefinition => ({
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
): LiveDimensionDefinition => ({
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
    overrides: Partial<LiveMetricDefinition> = {},
): LiveMetricDefinition => ({
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

const money = (description: string): Partial<LiveMetricDefinition> => ({
    description,
    format: '#,##0.00',
});

/**
 * LinkedIn Campaign Manager performance for one ad account. These are paid
 * ads only: organic Company Page analytics come from a different API,
 * permission and account (see the planned model names).
 */
export const LINKEDIN_ADS_PERFORMANCE_EXPLORE: LiveExploreDefinition = {
    name: 'performance',
    label: 'Performance',
    description:
        'Spend, impressions, clicks, leads and conversions for one LinkedIn Ads account, by day and by campaign or campaign group. Covers paid (sponsored) activity only, not organic Company Page analytics. Dates are in UTC and money is in the account currency.',
    aiHint: `Without a Date filter the query reads the last ${DEFAULT_DAYS} days. At most ${MAX_METRICS} metrics per query. LinkedIn reports campaigns without their campaign group: Campaign group ID and Campaign ID cannot both be selected; filter by Campaign group ID instead. Reach is deduplicated per row and only reported for date ranges of 92 days or less: never sum it. Grains are day, month and year only (no week).`,
    dimensions: [
        {
            name: 'date',
            apiName: 'day',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: LINKEDIN_ADS_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description: 'Day of the activity, in UTC.',
            aiHint: `Without a date filter the query reads the last ${DEFAULT_DAYS} days.`,
        },
        {
            ...dateGrain(
                'date_month',
                'month',
                'Date month',
                TimeFrames.MONTH,
                'Month of the activity, shown as its first day, in UTC.',
            ),
            aiHint: 'Filter Date, not this field, to choose the months.',
        },
        {
            ...dateGrain(
                'date_year',
                'year',
                'Date year',
                TimeFrames.YEAR,
                'Year of the activity, shown as its first day, in UTC.',
            ),
            aiHint: 'Filter Date, not this field, to choose the years.',
        },
        {
            ...dimension(
                'campaign_group_id',
                'campaignGroup.id',
                'Campaign group ID',
                'Campaign group',
                'LinkedIn campaign group ID.',
                LINKEDIN_ADS_ID_FILTERS,
            ),
            aiHint: 'Cannot be selected together with Campaign ID; filter by it instead.',
        },
        dimension(
            'campaign_id',
            'campaign.id',
            'Campaign ID',
            'Campaign',
            'LinkedIn campaign ID.',
            LINKEDIN_ADS_ID_FILTERS,
        ),
    ],
    metrics: [
        metric(
            'cost',
            'costInLocalCurrency',
            'Cost',
            'Delivery',
            '',
            money('Amount spent, in the ad account currency.'),
        ),
        metric(
            'impressions',
            'impressions',
            'Impressions',
            'Delivery',
            'Number of times members were shown the ads.',
        ),
        metric(
            'reach',
            'approximateMemberReach',
            'Reach',
            'Delivery',
            'Estimated number of distinct members who saw the ads at least once.',
            {
                type: MetricType.MAX,
                aggregation: NON_ADDITIVE,
                aiHint: 'Deduplicated per row: never sum it. LinkedIn only reports it for date ranges of 92 days or less.',
            },
        ),
        metric(
            'clicks',
            'clicks',
            'Clicks',
            'Engagement',
            'Number of chargeable clicks, such as clicks to the landing page or Company Page.',
            {
                aiHint: 'LinkedIn counts these even on CPM campaigns where clicks are not charged.',
            },
        ),
        metric(
            'landing_page_clicks',
            'landingPageClicks',
            'Landing page clicks',
            'Engagement',
            "Number of clicks that took a member to the ad's landing page.",
        ),
        metric(
            'total_engagements',
            'totalEngagements',
            'Total engagements',
            'Engagement',
            'Number of all member interactions with the ads.',
        ),
        metric(
            'likes',
            'likes',
            'Likes',
            'Engagement',
            'Number of likes. Sponsored Content only.',
        ),
        metric(
            'comments',
            'comments',
            'Comments',
            'Engagement',
            'Number of comments. Sponsored Content only.',
        ),
        metric(
            'shares',
            'shares',
            'Shares',
            'Engagement',
            'Number of shares. Sponsored Content only.',
        ),
        metric(
            'follows',
            'follows',
            'Follows',
            'Engagement',
            'Number of follows. Sponsored Content and Follower ads only.',
        ),
        metric(
            'video_views',
            'videoViews',
            'Video views',
            'Engagement',
            'Number of video views: at least 2 continuous seconds with half the video in view, or a click on the call to action.',
        ),
        metric(
            'video_completions',
            'videoCompletions',
            'Video completions',
            'Engagement',
            'Number of times a video ad played to 97-100% of its length.',
        ),
        metric(
            'leads',
            'oneClickLeads',
            'Leads',
            'Leads and conversions',
            'Number of leads from LinkedIn Lead Gen Forms.',
        ),
        metric(
            'lead_form_opens',
            'oneClickLeadFormOpens',
            'Lead form opens',
            'Leads and conversions',
            'Number of times members opened a Lead Gen Form.',
        ),
        metric(
            'conversions',
            'externalWebsiteConversions',
            'Conversions',
            'Leads and conversions',
            'Number of website conversions after a member clicked or saw an ad.',
            {
                aiHint: 'LinkedIn may use group-level attribution or estimation.',
            },
        ),
        metric(
            'post_click_conversions',
            'externalWebsitePostClickConversions',
            'Post-click conversions',
            'Leads and conversions',
            'Number of website conversions after a member clicked an ad.',
        ),
        metric(
            'post_view_conversions',
            'externalWebsitePostViewConversions',
            'Post-view conversions',
            'Leads and conversions',
            'Number of website conversions after a member saw an ad without clicking.',
        ),
        metric(
            'conversion_value',
            'conversionValueInLocalCurrency',
            'Conversion value',
            'Leads and conversions',
            '',
            money(
                'Value of conversions, as set by the advertiser, in the ad account currency.',
            ),
        ),
    ],
    maxDimensions: null,
    maxMetrics: MAX_METRICS,
    dateRange: { dimension: 'date', defaultDays: DEFAULT_DAYS },
    incompatible: [
        {
            fields: ['campaign_group_id'],
            with: ['campaign_id'],
            reason: 'LinkedIn reports campaigns without their campaign group. Remove Campaign group ID, or filter by it instead.',
            selectedOnly: true,
        },
    ],
};
