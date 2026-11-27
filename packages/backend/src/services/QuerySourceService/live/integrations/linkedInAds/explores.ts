import { DimensionType, MetricType, TimeFrames } from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    type LiveExploreDefinition,
} from '../../sdk';
import { LINKEDIN_ADS_DEFAULT_DAYS, LINKEDIN_ADS_MAX_METRICS } from './api';
import { LINKEDIN_ADS_DATE_FILTERS, LINKEDIN_ADS_ID_FILTERS } from './filters';

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
    aiHint: `Without a Date filter the query reads the last ${LINKEDIN_ADS_DEFAULT_DAYS} days. At most ${LINKEDIN_ADS_MAX_METRICS} metrics per query. LinkedIn reports campaigns without their campaign group: Campaign group ID and Campaign ID cannot both be selected; filter by Campaign group ID instead. Reach is deduplicated per row and only reported for date ranges of 92 days or less: never sum it. Grains are day, month and year only (no week).`,
    maxDimensions: null,
    maxMetrics: LINKEDIN_ADS_MAX_METRICS,
    dateRange: { dimension: 'date', defaultDays: LINKEDIN_ADS_DEFAULT_DAYS },
    incompatible: [
        {
            fields: ['campaign_group_id'],
            with: ['campaign_id'],
            reason: 'LinkedIn reports campaigns without their campaign group. Remove Campaign group ID, or filter by it instead.',
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'day',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: LINKEDIN_ADS_DATE_FILTERS,
            description: 'Day of the activity, in UTC.',
            aiHint: `Without a date filter the query reads the last ${LINKEDIN_ADS_DEFAULT_DAYS} days.`,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month of the activity, shown as its first day, in UTC.',
            aiHint: 'Filter Date, not this field, to choose the months.',
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'date_year',
            apiName: 'year',
            label: 'Date year',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Year of the activity, shown as its first day, in UTC.',
            aiHint: 'Filter Date, not this field, to choose the years.',
            timeInterval: { base: 'date', grain: TimeFrames.YEAR },
        }),
        dimension({
            name: 'campaign_group_id',
            apiName: 'campaignGroup.id',
            label: 'Campaign group ID',
            type: DimensionType.STRING,
            filterOperators: LINKEDIN_ADS_ID_FILTERS,
            description: 'LinkedIn campaign group ID.',
            aiHint: 'Cannot be selected together with Campaign ID; filter by it instead.',
            groups: ['Campaign group'],
        }),
        dimension({
            name: 'campaign_id',
            apiName: 'campaign.id',
            label: 'Campaign ID',
            type: DimensionType.STRING,
            filterOperators: LINKEDIN_ADS_ID_FILTERS,
            description: 'LinkedIn campaign ID.',
            groups: ['Campaign'],
        }),
    ],
    // Counts and money are totals per row, so they sum across rows; reach is
    // deduplicated within each row and doesn't.
    metrics: [
        metric({
            name: 'cost',
            apiName: 'costInLocalCurrency',
            label: 'Cost',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Amount spent, in the ad account currency.',
            groups: ['Delivery'],
            format: '#,##0.00',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'impressions',
            label: 'Impressions',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of times members were shown the ads.',
            groups: ['Delivery'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'reach',
            apiName: 'approximateMemberReach',
            label: 'Reach',
            type: MetricType.MAX,
            filterOperators: [],
            description:
                'Estimated number of distinct members who saw the ads at least once.',
            aiHint: 'Deduplicated per row: never sum it. LinkedIn only reports it for date ranges of 92 days or less.',
            groups: ['Delivery'],
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'clicks',
            label: 'Clicks',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of chargeable clicks, such as clicks to the landing page or Company Page.',
            aiHint: 'LinkedIn counts these even on CPM campaigns where clicks are not charged.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'landing_page_clicks',
            apiName: 'landingPageClicks',
            label: 'Landing page clicks',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                "Number of clicks that took a member to the ad's landing page.",
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'total_engagements',
            apiName: 'totalEngagements',
            label: 'Total engagements',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of all member interactions with the ads.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'likes',
            label: 'Likes',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of likes. Sponsored Content only.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'comments',
            label: 'Comments',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of comments. Sponsored Content only.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'shares',
            label: 'Shares',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of shares. Sponsored Content only.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'follows',
            label: 'Follows',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of follows. Sponsored Content and Follower ads only.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'video_views',
            apiName: 'videoViews',
            label: 'Video views',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of video views: at least 2 continuous seconds with half the video in view, or a click on the call to action.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'video_completions',
            apiName: 'videoCompletions',
            label: 'Video completions',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times a video ad played to 97-100% of its length.',
            groups: ['Engagement'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'leads',
            apiName: 'oneClickLeads',
            label: 'Leads',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of leads from LinkedIn Lead Gen Forms.',
            groups: ['Leads and conversions'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'lead_form_opens',
            apiName: 'oneClickLeadFormOpens',
            label: 'Lead form opens',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of times members opened a Lead Gen Form.',
            groups: ['Leads and conversions'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'conversions',
            apiName: 'externalWebsiteConversions',
            label: 'Conversions',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of website conversions after a member clicked or saw an ad.',
            aiHint: 'LinkedIn may use group-level attribution or estimation.',
            groups: ['Leads and conversions'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'post_click_conversions',
            apiName: 'externalWebsitePostClickConversions',
            label: 'Post-click conversions',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of website conversions after a member clicked an ad.',
            groups: ['Leads and conversions'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'post_view_conversions',
            apiName: 'externalWebsitePostViewConversions',
            label: 'Post-view conversions',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of website conversions after a member saw an ad without clicking.',
            groups: ['Leads and conversions'],
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'conversion_value',
            apiName: 'conversionValueInLocalCurrency',
            label: 'Conversion value',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Value of conversions, as set by the advertiser, in the ad account currency.',
            groups: ['Leads and conversions'],
            format: '#,##0.00',
            aggregation: ADDITIVE,
        }),
    ],
};

export const LINKEDIN_ADS_EXPLORES = [
    LINKEDIN_ADS_PERFORMANCE_EXPLORE,
] as const;
