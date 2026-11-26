import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import { z } from 'zod';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

export const GA4_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];
export const GA4_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended ranges, from the first day the Data API reports
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];
export const GA4_METRIC_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
];

const dimension = (
    name: string,
    apiName: string,
    label: string,
    description?: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type: DimensionType.STRING,
    filterOperators: GA4_STRING_FILTERS,
});

const metric = (
    name: string,
    apiName: string,
    label: string,
    type: MetricType,
    description?: string,
    format?: string,
    aggregation?: ApiSourceMetricAggregation,
    aiHint?: string,
): LiveMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators: GA4_METRIC_FILTERS,
    ...(format ? { format } : {}),
    ...(aggregation ? { aggregation } : {}),
});

// Additivity per the Data API schema
// (https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).
// User and session counts are distinct counts, estimated with HLL++
// (https://developers.google.com/analytics/blog/2022/hll), so they never sum;
// event, view, purchase and revenue counts do.
const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const ITEM_SCOPED_DIMENSIONS = ['item_name'];
const SESSION_AND_EVENT_METRICS = [
    'sessions',
    'engaged_sessions',
    'engagement_rate',
    'average_session_duration',
    'screen_page_views',
    'event_count',
    'key_events',
];

export const GA4_REPORT_EXPLORE: LiveExploreDefinition = {
    name: 'report',
    label: 'Report',
    description:
        'Users, sessions, page views, events, key events and revenue for one Google Analytics 4 property. Dates are in the property time zone and money is in the property currency.',
    aiHint: 'Without a Date filter the query reads the last 28 days. At most 9 dimensions and 10 metrics per query. Item name only works with item metrics (Item revenue, Items purchased, Items viewed), never with session or event metrics. User and session counts (Active users, Total users, New users, Sessions, Engaged sessions) are distinct counts: never sum them across rows or days; query a coarser date grain instead. Event-scoped dimensions such as Page path count a session or user once per value. Rare values of high-cardinality dimensions (City, Page path) can be grouped into "(other)". The property\'s custom dimensions, custom metrics and per-key-event counts are added from the GA4 Metadata API.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: GA4_DATE_FILTERS,
            // The date is its own day grain, grouped with the coarser ones
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description: 'Day of the activity, in the property time zone.',
            aiHint: 'Without a date filter the query reads the last 28 days.',
        },
        {
            name: 'date_week',
            apiName: 'isoYearIsoWeek',
            label: 'Date week',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.WEEK },
            description:
                'Week of the activity, shown as its Monday (ISO week) in the property time zone.',
            aiHint: 'Filter Date, not this field, to choose the weeks.',
        },
        {
            name: 'date_month',
            apiName: 'yearMonth',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
            description:
                'Month of the activity, shown as its first day in the property time zone.',
            aiHint: 'Filter Date, not this field, to choose the months.',
        },
        {
            name: 'date_year',
            apiName: 'year',
            label: 'Date year',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.YEAR },
            description:
                'Year of the activity, shown as its first day in the property time zone.',
            aiHint: 'Filter Date, not this field, to choose the years.',
        },
        dimension(
            'country',
            'country',
            'Country',
            'Country the user was in, based on their IP address.',
        ),
        dimension(
            'city',
            'city',
            'City',
            'City the user was in, based on their IP address.',
            'Rare values can be grouped into "(other)".',
        ),
        dimension(
            'device_category',
            'deviceCategory',
            'Device category',
            'Type of device: desktop, mobile or tablet.',
        ),
        dimension(
            'platform',
            'platform',
            'Platform',
            'Platform the site or app ran on: web, Android or iOS.',
        ),
        dimension(
            'session_source',
            'sessionSource',
            'Session source',
            'Where the session came from, such as google or (direct).',
        ),
        dimension(
            'session_medium',
            'sessionMedium',
            'Session medium',
            'How the session arrived, such as organic, cpc or referral.',
        ),
        dimension(
            'session_campaign',
            'sessionCampaignName',
            'Session campaign',
            'Campaign that brought the session, from utm_campaign or Google Ads.',
        ),
        dimension(
            'session_default_channel_group',
            'sessionDefaultChannelGroup',
            'Session default channel group',
            "Google's default channel for the session, such as Organic Search, Direct or Paid Social, based mainly on source and medium.",
        ),
        dimension(
            'first_user_source',
            'firstUserSource',
            'First user source',
            'Where the user first came from when they first visited.',
            'Differs from Session source for returning users.',
        ),
        dimension(
            'landing_page',
            'landingPage',
            'Landing page',
            'Page path of the first page viewed in the session.',
        ),
        dimension(
            'page_path',
            'pagePath',
            'Page path',
            'Path of a page viewed, the part of the URL between the domain and the query string.',
            'Event-scoped: splitting sessions or users by page counts a session or user once per page, so totals across pages exceed the true total. Rare values can be grouped into "(other)".',
        ),
        dimension(
            'event_name',
            'eventName',
            'Event name',
            'Name of the event, such as page_view, session_start, purchase or a custom event.',
        ),
        dimension(
            'new_vs_returning',
            'newVsReturning',
            'New or returning',
            'Whether the user was new (no earlier sessions) or returning.',
        ),
        dimension(
            'item_name',
            'itemName',
            'Item name',
            'Name of the ecommerce item.',
            'Item-scoped: only works with Item revenue, Items purchased and Items viewed, never with session or event metrics.',
        ),
    ],
    metrics: [
        metric(
            'active_users',
            'activeUsers',
            'Active users',
            MetricType.COUNT_DISTINCT,
            'Number of distinct users who engaged with the site or app.',
            undefined,
            NON_ADDITIVE,
            'Distinct count: never sum across rows or days; daily values do not add up to a weekly total.',
        ),
        metric(
            'total_users',
            'totalUsers',
            'Total users',
            MetricType.COUNT_DISTINCT,
            'Number of distinct users who logged at least one event, engaged or not.',
            undefined,
            NON_ADDITIVE,
            'Distinct count: never sum across rows or days.',
        ),
        metric(
            'new_users',
            'newUsers',
            'New users',
            MetricType.COUNT_DISTINCT,
            'Number of users who visited the site or opened the app for the first time.',
            undefined,
            NON_ADDITIVE,
            'Never sum across non-date dimensions that split users.',
        ),
        metric(
            'sessions',
            'sessions',
            'Sessions',
            MetricType.COUNT_DISTINCT,
            'Number of sessions that started.',
            undefined,
            NON_ADDITIVE,
            'Never sum across event- or page-scoped dimensions.',
        ),
        metric(
            'engaged_sessions',
            'engagedSessions',
            'Engaged sessions',
            MetricType.COUNT_DISTINCT,
            'Number of sessions that lasted over 10 seconds, had a key event, or had two or more page or screen views.',
            undefined,
            NON_ADDITIVE,
            'Never sum across event- or page-scoped dimensions.',
        ),
        metric(
            'engagement_rate',
            'engagementRate',
            'Engagement rate',
            MetricType.NUMBER,
            'Engaged sessions as a share of all sessions.',
            '0.0%',
            // Engaged sessions / sessions, but both are distinct counts, so
            // the rate can't be rebuilt from summed rows
            NON_ADDITIVE,
            'A ratio: never sum or average rows.',
        ),
        metric(
            'average_session_duration',
            'averageSessionDuration',
            'Average session duration (s)',
            MetricType.AVERAGE,
            'Average length of a session, in seconds.',
            undefined,
            NON_ADDITIVE,
            'An average: never sum rows.',
        ),
        metric(
            'screen_page_views',
            'screenPageViews',
            'Views',
            MetricType.SUM,
            'Number of web pages and app screens viewed, repeat views included.',
            undefined,
            ADDITIVE,
        ),
        metric(
            'event_count',
            'eventCount',
            'Event count',
            MetricType.SUM,
            'Number of events logged.',
            undefined,
            ADDITIVE,
        ),
        metric(
            'key_events',
            'keyEvents',
            'Key events',
            MetricType.SUM,
            'Number of events marked as key events (formerly called conversions).',
            undefined,
            ADDITIVE,
        ),
        metric(
            'total_revenue',
            'totalRevenue',
            'Total revenue',
            MetricType.SUM,
            'Revenue from purchases, subscriptions and ads, minus refunds, in the property currency.',
            undefined,
            ADDITIVE,
        ),
        metric(
            'ecommerce_purchases',
            'ecommercePurchases',
            'Ecommerce purchases',
            MetricType.SUM,
            'Number of completed purchases.',
            undefined,
            ADDITIVE,
        ),
        metric(
            'item_revenue',
            'itemRevenue',
            'Item revenue',
            MetricType.SUM,
            'Revenue from items sold, minus refunds and excluding tax and shipping, in the property currency.',
            undefined,
            ADDITIVE,
            'Item metric: works with Item name.',
        ),
        metric(
            'items_purchased',
            'itemsPurchased',
            'Items purchased',
            MetricType.SUM,
            'Number of item units purchased.',
            undefined,
            ADDITIVE,
            'Item metric: works with Item name.',
        ),
        metric(
            'items_viewed',
            'itemsViewed',
            'Items viewed',
            MetricType.SUM,
            'Number of item units viewed.',
            undefined,
            ADDITIVE,
            'Item metric: works with Item name.',
        ),
    ],
    maxDimensions: 9,
    maxMetrics: 10,
    dateRange: { dimension: 'date', defaultDays: 28 },
    incompatible: [
        {
            fields: ITEM_SCOPED_DIMENSIONS,
            with: SESSION_AND_EVENT_METRICS,
            reason: 'Google Analytics only reports item dimensions with item metrics.',
        },
    ],
};

const metadataSchema = z.object({
    dimensions: z
        .array(
            z.object({
                apiName: z.string(),
                uiName: z.string().optional(),
                description: z.string().optional(),
                customDefinition: z.boolean().optional(),
            }),
        )
        .optional(),
    metrics: z
        .array(
            z.object({
                apiName: z.string(),
                uiName: z.string().optional(),
                description: z.string().optional(),
                customDefinition: z.boolean().optional(),
            }),
        )
        .optional(),
});

const SCANNED_METRIC_PREFIX = /^keyEvents:/;

/** Stable, SQL-friendly field name for a property-specific API name like `customEvent:plan`. */
const toScannedFieldName = (apiName: string) =>
    apiName
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .toLowerCase();

/**
 * Adds the property's own fields from the GA4 Metadata API: custom dimensions
 * and metrics, and one key-event count per key event. Their rules are safe
 * defaults, since only the hand-written fields know more.
 */
export const withGa4MetadataFields = (
    definition: LiveExploreDefinition,
    metadata: unknown,
): LiveExploreDefinition => {
    const parsed = metadataSchema.safeParse(metadata);
    if (!parsed.success) {
        return definition;
    }
    const taken = new Set([
        ...definition.dimensions.map(({ name }) => name),
        ...definition.metrics.map(({ name }) => name),
    ]);
    const isNew = (name: string) => {
        if (taken.has(name)) {
            return false;
        }
        taken.add(name);
        return true;
    };
    const dimensions = (parsed.data.dimensions ?? [])
        .filter((field) => field.customDefinition)
        .map((field) =>
            dimension(
                toScannedFieldName(field.apiName),
                field.apiName,
                field.uiName ?? field.apiName,
                field.description,
                'Custom definitions get safe default rules; their scope (event, user or item) is not known to Lightdash.',
            ),
        )
        .filter(({ name }) => isNew(name));
    const metrics = (parsed.data.metrics ?? [])
        .filter(
            (field) =>
                field.customDefinition ||
                SCANNED_METRIC_PREFIX.test(field.apiName),
        )
        .map((field) =>
            metric(
                toScannedFieldName(field.apiName),
                field.apiName,
                field.uiName ?? field.apiName,
                MetricType.NUMBER,
                field.description,
                undefined,
                undefined,
                'Treated as non-additive: do not sum across rows.',
            ),
        )
        .filter(({ name }) => isNew(name));
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
        metrics: [...definition.metrics, ...metrics],
    };
};
