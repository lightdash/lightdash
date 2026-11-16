import { z } from 'zod';
import {
    type ApiSourceOf,
    type ExternalConnectionApiSource,
} from '../ee/externalConnections/types';
import { ApiConnectorType } from '../types/querySources';

/** How an admin connects a source, which decides the dialog it opens. */
export type LiveSourceSetupKind =
    | 'google'
    | 'posthog'
    | 'token'
    | 'linkedin_ads';

type LiveIntegrationCatalogFields<C extends ApiConnectorType> = {
    /** Stable id, sent with analytics events. */
    id: string;
    /** The name people see when adding and listing sources. */
    label: string;
    /** The name refusals and API errors use. */
    messageLabel: string;
    /** The name AI agents read and repeat. */
    agentLabel: string;
    description: string;
    setup: LiveSourceSetupKind;
    /** The settings a source stores; checked against the API type. */
    settings: z.ZodType<ApiSourceOf<C>>;
    /** What one source reads, shown wherever it is listed. */
    getTarget: (apiSource: ApiSourceOf<C>) => string;
    /** How an agent writes one request in the integration's own query language. */
    agentQueryGuide: string;
    /** Offered by the onboarding tools step. Most sources are added later. */
    inOnboarding?: true;
};

/**
 * Everything the backend, the app and AI agents share about each live
 * integration. One entry per connector; a missing one fails typecheck. The
 * agent guide is read in this order, so add new integrations at the end.
 */
export const LIVE_INTEGRATION_CATALOG: {
    [C in ApiConnectorType]: LiveIntegrationCatalogFields<C>;
} = {
    [ApiConnectorType.POSTHOG]: {
        id: 'posthog',
        label: 'PostHog',
        messageLabel: 'PostHog',
        agentLabel: 'PostHog',
        description: 'Product events, persons and sessions with HogQL',
        setup: 'posthog',
        settings: z.object({
            connector: z.literal(ApiConnectorType.POSTHOG),
            projectId: z.string(),
        }),
        getTarget: ({ projectId }) => `Project ${projectId}`,
        agentQueryGuide:
            'one HogQL SELECT, the ClickHouse SQL dialect, over tables such as events (event, timestamp, distinct_id, person_id, properties), persons (id, created_at, properties) and sessions. Read a property as properties.$browser or properties.plan. Alias every column with AS using letters, digits and underscores. PostHog stops a query after 10 seconds, so aggregate in HogQL rather than fetching raw events. List event names first when unsure which exist.',
        inOnboarding: true,
    },
    [ApiConnectorType.SEARCH_CONSOLE]: {
        id: 'google_search_console',
        label: 'Google Search Console',
        messageLabel: 'Search Console',
        agentLabel: 'Search Console',
        description: 'Search clicks, impressions, CTR and position',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.SEARCH_CONSOLE),
            siteUrl: z.string(),
        }),
        getTarget: ({ siteUrl }) => siteUrl,
        agentQueryGuide:
            'one Search Analytics request as a JSON object with startDate and endDate (YYYY-MM-DD, required), dimensions from date, query, page, country, device and searchAppearance, and optionally type (web, image, video, news, discover, googleNews), dimensionFilterGroups and aggregationType. Rows carry the dimensions plus clicks, impressions, ctr and position; ctr and position are averages, so never sum them. Data lags about two days.',
        inOnboarding: true,
    },
    [ApiConnectorType.GA4]: {
        id: 'google_analytics',
        label: 'Google Analytics 4',
        messageLabel: 'Google Analytics',
        agentLabel: 'Google Analytics 4',
        description: 'Users, sessions, events and revenue for a property',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.GA4),
            propertyId: z.string(),
        }),
        getTarget: ({ propertyId }) => `Property ${propertyId}`,
        agentQueryGuide:
            'one runReport request as a JSON object with dateRanges (startDate and endDate as YYYY-MM-DD, today, yesterday or NdaysAgo), metrics (1-10, e.g. activeUsers, sessions, screenPageViews, conversions, totalRevenue) and optionally dimensions (up to 9, e.g. date, country, deviceCategory, sessionSource, pagePath, eventName), dimensionFilter, metricFilter and orderBys in the GA4 Data API shape. Columns are the API names, with any character other than letters, digits and underscores replaced by an underscore; date comes back as YYYY-MM-DD. Rate and average metrics such as bounceRate or averageSessionDuration must not be summed. Each report spends hourly quota on the property, so prefer one aggregated report over many.',
        inOnboarding: true,
    },
    [ApiConnectorType.META_ADS]: {
        id: 'meta_ads',
        label: 'Meta Ads',
        messageLabel: 'Meta Ads',
        agentLabel: 'Meta Ads',
        description: 'Facebook and Instagram ad performance',
        setup: 'token',
        settings: z.object({
            connector: z.literal(ApiConnectorType.META_ADS),
            adAccountId: z.string(),
        }),
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
        agentQueryGuide:
            'one Insights request as a JSON object with level (account, campaign, adset or ad), time_range ({since, until} as YYYY-MM-DD), fields (campaign_id, campaign_name, objective, adset_id, adset_name, ad_id, ad_name, spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, cpc, cpm, and actions:<type>, action_values:<type> or purchase_roas:<type> such as actions:omni_purchase), and optionally time_increment (1, monthly or all_days), breakdowns (age, gender, country, region, publisher_platform, platform_position), filtering ([{field: campaign.name, campaign.id, adset.name, adset.id, ad.name or ad.id, operator: EQUAL, NOT_EQUAL, IN, NOT_IN, CONTAIN or NOT_CONTAIN, value}]) and sort (one entry such as spend_descending). Column names are the field names, plus date_start when time_increment is set; ctr comes back as a fraction. Reach and frequency are deduplicated per row and frequency depends on reach, so never sum them.',
    },
    [ApiConnectorType.GOOGLE_ADS]: {
        id: 'google_ads',
        label: 'Google Ads',
        messageLabel: 'Google Ads',
        agentLabel: 'Google Ads',
        description: 'Campaign spend, clicks and conversions',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.GOOGLE_ADS),
            customerId: z.string(),
            loginCustomerId: z.string().nullable(),
        }),
        getTarget: ({ customerId }) => `Account ${customerId}`,
        agentQueryGuide:
            "one GAQL query, SELECT fields FROM resource (customer for account totals, campaign, ad_group) WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'. GAQL returns one row per resource and segment and never groups, so only select attributes that identify that resource, and a segment in WHERE must also be in SELECT, except dates. Conditions combine only with AND. Columns are the GAQL field names; money metrics come back in the account currency, already converted from micros. Rates and impression shares must not be summed.",
    },
    [ApiConnectorType.YOUTUBE_ANALYTICS]: {
        id: 'youtube_analytics',
        label: 'YouTube Analytics',
        messageLabel: 'YouTube Analytics',
        agentLabel: 'YouTube Analytics',
        description: 'Channel views, watch time and subscribers',
        setup: 'google',
        settings: z.object({
            connector: z.literal(ApiConnectorType.YOUTUBE_ANALYTICS),
            channelId: z.string(),
        }),
        getTarget: ({ channelId }) => `Channel ${channelId}`,
        agentQueryGuide:
            'one channel report as a JSON object with startDate and endDate (YYYY-MM-DD, required), metrics as a comma-separated string (e.g. views,estimatedMinutesWatched,subscribersGained), and optionally dimensions (one of day, month, country, video, deviceType or insightTrafficSourceType; deviceType and insightTrafficSourceType may be paired with day), filters such as country==US or video==abc, sort such as -views, and maxResults. The channel comes from the source, so never set ids. A video report needs a descending sort on views, estimatedMinutesWatched, subscribersGained or subscribersLost and at most 200 rows. averageViewDuration and averageViewPercentage are averages, so never sum them.',
    },
    [ApiConnectorType.LINKEDIN_ADS]: {
        id: 'linkedin_ads',
        label: 'LinkedIn Ads',
        messageLabel: 'LinkedIn Ads',
        agentLabel: 'LinkedIn Ads',
        description: 'Campaign reach, clicks and leads',
        setup: 'linkedin_ads',
        settings: z.object({
            connector: z.literal(ApiConnectorType.LINKEDIN_ADS),
            adAccountId: z.string(),
        }),
        getTarget: ({ adAccountId }) => `Ad account ${adAccountId}`,
        agentQueryGuide:
            'one adAnalytics report as a JSON object with pivot (ACCOUNT, CAMPAIGN_GROUP or CAMPAIGN), timeGranularity (ALL, DAILY, MONTHLY or YEARLY), dateRange ({start, end} as YYYY-MM-DD), fields (1-18 metric names such as impressions, clicks, costInLocalCurrency, oneClickLeads, externalWebsiteConversions), and optionally dimensions (day, month, year, campaign.id, campaign.name, campaign.status, campaign.type, campaign.objectiveType, campaignGroup.id, campaignGroup.name), campaigns and campaignGroups (lists of numeric IDs). The ad account comes from the source, so never set it. This is sponsored Campaign Manager data, not organic Company Page analytics. approximateMemberReach is deduplicated, so never sum it, and works for at most 92 days. A report returns at most 14,999 rows with no pagination, so aggregate rather than asking for every day of every campaign.',
    },
};

/** One integration's catalog entry, for a source of any connector. */
export type LiveIntegrationCatalogEntry = Omit<
    LiveIntegrationCatalogFields<ApiConnectorType>,
    'getTarget' | 'settings'
> & {
    connector: ApiConnectorType;
    getTarget: (apiSource: ExternalConnectionApiSource) => string;
};

export const getLiveIntegrationCatalogEntry = (
    connector: ApiConnectorType,
): LiveIntegrationCatalogEntry => {
    const { settings, ...entry } = LIVE_INTEGRATION_CATALOG[connector];
    return {
        ...entry,
        connector,
        // Only ever called with a source of this connector
        getTarget: entry.getTarget as LiveIntegrationCatalogEntry['getTarget'],
    };
};

/** What a source reads: a PostHog project, a Search Console site, a GA4 property and so on. */
export const getLiveSourceTarget = (apiSource: ExternalConnectionApiSource) =>
    getLiveIntegrationCatalogEntry(apiSource.connector).getTarget(apiSource);

/** The agent tool's description of its query field, one sentence block per integration. */
export const getLiveSourceAgentQueryGuide = () =>
    Object.entries(LIVE_INTEGRATION_CATALOG)
        .map(
            ([connector, { agentQueryGuide }]) =>
                `For "${connector}": ${agentQueryGuide}`,
        )
        .join(' ');

/**
 * APIs that answer reports or their own query language, so they could be
 * queried live; users ask for them and we count the requests.
 */
export const REQUESTABLE_LIVE_INTEGRATIONS = [
    {
        id: 'shopify',
        label: 'Shopify',
        description: 'Orders, products and sales with ShopifyQL',
    },
    {
        id: 'stripe',
        label: 'Stripe',
        description: 'Payments, subscriptions and revenue',
    },
    {
        id: 'salesforce',
        label: 'Salesforce',
        description: 'Accounts, opportunities and pipeline with SOQL',
    },
    {
        id: 'mixpanel',
        label: 'Mixpanel',
        description: 'Product events, funnels and retention',
    },
    {
        id: 'jira',
        label: 'Jira',
        description: 'Issues, sprints and cycle time with JQL',
    },
] as const;
