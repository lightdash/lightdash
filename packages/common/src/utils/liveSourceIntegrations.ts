import { ApiConnectorType } from '../types/querySources';

/** What the shared query check and AI agents need to know about an integration. */
export type LiveSourceIntegrationProfile = {
    /** The name refusals use. */
    label: string;
    /** The name AI agents read and repeat. */
    agentLabel: string;
    /** How an agent writes one request in the integration's own query language. */
    agentQueryGuide: string;
};

/**
 * One entry per integration. The agent guide is read in this order, so add
 * new integrations at the end.
 */
export const LIVE_SOURCE_INTEGRATION_PROFILES: Record<
    ApiConnectorType,
    LiveSourceIntegrationProfile
> = {
    [ApiConnectorType.POSTHOG]: {
        label: 'PostHog',
        agentLabel: 'PostHog',
        agentQueryGuide:
            'one HogQL SELECT, the ClickHouse SQL dialect, over tables such as events (event, timestamp, distinct_id, person_id, properties), persons (id, created_at, properties) and sessions. Read a property as properties.$browser or properties.plan. Alias every column with AS using letters, digits and underscores. PostHog stops a query after 10 seconds, so aggregate in HogQL rather than fetching raw events. List event names first when unsure which exist.',
    },
    [ApiConnectorType.SEARCH_CONSOLE]: {
        label: 'Search Console',
        agentLabel: 'Search Console',
        agentQueryGuide:
            'one Search Analytics request as a JSON object with startDate and endDate (YYYY-MM-DD, required), dimensions from date, query, page, country, device and searchAppearance, and optionally type (web, image, video, news, discover, googleNews), dimensionFilterGroups and aggregationType. Rows carry the dimensions plus clicks, impressions, ctr and position; ctr and position are averages, so never sum them. Data lags about two days.',
    },
    [ApiConnectorType.GA4]: {
        label: 'Google Analytics',
        agentLabel: 'Google Analytics 4',
        agentQueryGuide:
            'one runReport request as a JSON object with dateRanges (startDate and endDate as YYYY-MM-DD, today, yesterday or NdaysAgo), metrics (1-10, e.g. activeUsers, sessions, screenPageViews, conversions, totalRevenue) and optionally dimensions (up to 9, e.g. date, country, deviceCategory, sessionSource, pagePath, eventName), dimensionFilter, metricFilter and orderBys in the GA4 Data API shape. Columns are the API names, with any character other than letters, digits and underscores replaced by an underscore; date comes back as YYYY-MM-DD. Rate and average metrics such as bounceRate or averageSessionDuration must not be summed. Each report spends hourly quota on the property, so prefer one aggregated report over many.',
    },
    [ApiConnectorType.META_ADS]: {
        label: 'Meta Ads',
        agentLabel: 'Meta Ads',
        agentQueryGuide:
            'one Insights request as a JSON object with level (account, campaign, adset or ad), time_range ({since, until} as YYYY-MM-DD), fields (campaign_id, campaign_name, objective, adset_id, adset_name, ad_id, ad_name, spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, cpc, cpm, and actions:<type>, action_values:<type> or purchase_roas:<type> such as actions:omni_purchase), and optionally time_increment (1, monthly or all_days), breakdowns (age, gender, country, region, publisher_platform, platform_position), filtering ([{field: campaign.name, campaign.id, adset.name, adset.id, ad.name or ad.id, operator: EQUAL, NOT_EQUAL, IN, NOT_IN, CONTAIN or NOT_CONTAIN, value}]) and sort (one entry such as spend_descending). Column names are the field names, plus date_start when time_increment is set; ctr comes back as a fraction. Reach and frequency are deduplicated per row and frequency depends on reach, so never sum them.',
    },
    [ApiConnectorType.GOOGLE_ADS]: {
        label: 'Google Ads',
        agentLabel: 'Google Ads',
        agentQueryGuide:
            "one GAQL query, SELECT fields FROM resource (customer for account totals, campaign, ad_group) WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'. GAQL returns one row per resource and segment and never groups, so only select attributes that identify that resource, and a segment in WHERE must also be in SELECT, except dates. Conditions combine only with AND. Columns are the GAQL field names; money metrics come back in the account currency, already converted from micros. Rates and impression shares must not be summed.",
    },
    [ApiConnectorType.YOUTUBE_ANALYTICS]: {
        label: 'YouTube Analytics',
        agentLabel: 'YouTube Analytics',
        agentQueryGuide:
            'one channel report as a JSON object with startDate and endDate (YYYY-MM-DD, required), metrics as a comma-separated string (e.g. views,estimatedMinutesWatched,subscribersGained), and optionally dimensions (one of day, month, country, video, deviceType or insightTrafficSourceType; deviceType and insightTrafficSourceType may be paired with day), filters such as country==US or video==abc, sort such as -views, and maxResults. The channel comes from the source, so never set ids. A video report needs a descending sort on views, estimatedMinutesWatched, subscribersGained or subscribersLost and at most 200 rows. averageViewDuration and averageViewPercentage are averages, so never sum them.',
    },
};

/** The agent tool's description of its query field, one sentence block per integration. */
export const getLiveSourceAgentQueryGuide = () =>
    Object.entries(LIVE_SOURCE_INTEGRATION_PROFILES)
        .map(
            ([connector, { agentQueryGuide }]) =>
                `For "${connector}": ${agentQueryGuide}`,
        )
        .join(' ');
