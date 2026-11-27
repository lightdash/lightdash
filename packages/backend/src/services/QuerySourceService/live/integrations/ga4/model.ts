import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
    type LiveModel,
    type LiveRuntime,
} from '../../sdk';
import { getGa4MetadataPath } from './api';

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

export const GA4_REPORT_EXPLORE: LiveExploreDefinition = {
    name: 'report',
    label: 'Report',
    description:
        'Users, sessions, page views, events, key events and revenue for one Google Analytics 4 property. Dates are in the property time zone and money is in the property currency.',
    aiHint: 'Without a Date filter the query reads the last 28 days. At most 9 dimensions and 10 metrics per query. Item name only works with item metrics (Item revenue, Items purchased, Items viewed), never with session or event metrics. User and session counts (Active users, Total users, New users, Sessions, Engaged sessions) are distinct counts: never sum them across rows or days; query a coarser date grain instead. Event-scoped dimensions such as Page path count a session or user once per value. Rare values of high-cardinality dimensions (City, Page path) can be grouped into "(other)". The property\'s custom dimensions, custom metrics and per-key-event counts are added from the GA4 Metadata API.',
    maxDimensions: 9,
    maxMetrics: 10,
    dateRange: { dimension: 'date', defaultDays: 28 },
    incompatible: [
        {
            fields: ['item_name'],
            with: [
                'sessions',
                'engaged_sessions',
                'engagement_rate',
                'average_session_duration',
                'screen_page_views',
                'event_count',
                'key_events',
            ],
            reason: 'Google Analytics only reports item dimensions with item metrics.',
        },
    ],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: GA4_DATE_FILTERS,
            description: 'Day of the activity, in the property time zone.',
            aiHint: 'Without a date filter the query reads the last 28 days.',
            // The date is its own day grain, grouped with the coarser ones
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_week',
            apiName: 'isoYearIsoWeek',
            label: 'Date week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week of the activity, shown as its Monday (ISO week) in the property time zone.',
            aiHint: 'Filter Date, not this field, to choose the weeks.',
            timeInterval: { base: 'date', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'date_month',
            apiName: 'yearMonth',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month of the activity, shown as its first day in the property time zone.',
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
                'Year of the activity, shown as its first day in the property time zone.',
            aiHint: 'Filter Date, not this field, to choose the years.',
            timeInterval: { base: 'date', grain: TimeFrames.YEAR },
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description: 'Country the user was in, based on their IP address.',
        }),
        dimension({
            name: 'city',
            label: 'City',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description: 'City the user was in, based on their IP address.',
            aiHint: 'Rare values can be grouped into "(other)".',
        }),
        dimension({
            name: 'device_category',
            apiName: 'deviceCategory',
            label: 'Device category',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description: 'Type of device: desktop, mobile or tablet.',
        }),
        dimension({
            name: 'platform',
            label: 'Platform',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'Platform the site or app ran on: web, Android or iOS.',
        }),
        dimension({
            name: 'session_source',
            apiName: 'sessionSource',
            label: 'Session source',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'Where the session came from, such as google or (direct).',
        }),
        dimension({
            name: 'session_medium',
            apiName: 'sessionMedium',
            label: 'Session medium',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'How the session arrived, such as organic, cpc or referral.',
        }),
        dimension({
            name: 'session_campaign',
            apiName: 'sessionCampaignName',
            label: 'Session campaign',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'Campaign that brought the session, from utm_campaign or Google Ads.',
        }),
        dimension({
            name: 'session_default_channel_group',
            apiName: 'sessionDefaultChannelGroup',
            label: 'Session default channel group',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                "Google's default channel for the session, such as Organic Search, Direct or Paid Social, based mainly on source and medium.",
        }),
        dimension({
            name: 'first_user_source',
            apiName: 'firstUserSource',
            label: 'First user source',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'Where the user first came from when they first visited.',
            aiHint: 'Differs from Session source for returning users.',
        }),
        dimension({
            name: 'landing_page',
            apiName: 'landingPage',
            label: 'Landing page',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description: 'Page path of the first page viewed in the session.',
        }),
        dimension({
            name: 'page_path',
            apiName: 'pagePath',
            label: 'Page path',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'Path of a page viewed, the part of the URL between the domain and the query string.',
            aiHint: 'Event-scoped: splitting sessions or users by page counts a session or user once per page, so totals across pages exceed the true total. Rare values can be grouped into "(other)".',
        }),
        dimension({
            name: 'event_name',
            apiName: 'eventName',
            label: 'Event name',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'Name of the event, such as page_view, session_start, purchase or a custom event.',
        }),
        dimension({
            name: 'new_vs_returning',
            apiName: 'newVsReturning',
            label: 'New or returning',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description:
                'Whether the user was new (no earlier sessions) or returning.',
        }),
        dimension({
            name: 'item_name',
            apiName: 'itemName',
            label: 'Item name',
            type: DimensionType.STRING,
            filterOperators: GA4_STRING_FILTERS,
            description: 'Name of the ecommerce item.',
            aiHint: 'Item-scoped: only works with Item revenue, Items purchased and Items viewed, never with session or event metrics.',
        }),
    ],
    // Additivity per the Data API schema
    // (https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema).
    // User and session counts are distinct counts, estimated with HLL++
    // (https://developers.google.com/analytics/blog/2022/hll), so they never sum;
    // event, view, purchase and revenue counts do.
    metrics: [
        metric({
            name: 'active_users',
            apiName: 'activeUsers',
            label: 'Active users',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Number of distinct users who engaged with the site or app.',
            aiHint: 'Distinct count: never sum across rows or days; daily values do not add up to a weekly total.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'total_users',
            apiName: 'totalUsers',
            label: 'Total users',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Number of distinct users who logged at least one event, engaged or not.',
            aiHint: 'Distinct count: never sum across rows or days.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'new_users',
            apiName: 'newUsers',
            label: 'New users',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Number of users who visited the site or opened the app for the first time.',
            aiHint: 'Never sum across non-date dimensions that split users.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'sessions',
            label: 'Sessions',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: GA4_METRIC_FILTERS,
            description: 'Number of sessions that started.',
            aiHint: 'Never sum across event- or page-scoped dimensions.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'engaged_sessions',
            apiName: 'engagedSessions',
            label: 'Engaged sessions',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Number of sessions that lasted over 10 seconds, had a key event, or had two or more page or screen views.',
            aiHint: 'Never sum across event- or page-scoped dimensions.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'engagement_rate',
            apiName: 'engagementRate',
            label: 'Engagement rate',
            type: MetricType.NUMBER,
            filterOperators: GA4_METRIC_FILTERS,
            description: 'Engaged sessions as a share of all sessions.',
            aiHint: 'A ratio: never sum or average rows.',
            format: '0.0%',
            // Engaged sessions / sessions, but both are distinct counts, so
            // the rate can't be rebuilt from summed rows
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'average_session_duration',
            apiName: 'averageSessionDuration',
            label: 'Average session duration (s)',
            type: MetricType.AVERAGE,
            filterOperators: GA4_METRIC_FILTERS,
            description: 'Average length of a session, in seconds.',
            aiHint: 'An average: never sum rows.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'screen_page_views',
            apiName: 'screenPageViews',
            label: 'Views',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Number of web pages and app screens viewed, repeat views included.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'event_count',
            apiName: 'eventCount',
            label: 'Event count',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description: 'Number of events logged.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'key_events',
            apiName: 'keyEvents',
            label: 'Key events',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Number of events marked as key events (formerly called conversions).',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'total_revenue',
            apiName: 'totalRevenue',
            label: 'Total revenue',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Revenue from purchases, subscriptions and ads, minus refunds, in the property currency.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'ecommerce_purchases',
            apiName: 'ecommercePurchases',
            label: 'Ecommerce purchases',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description: 'Number of completed purchases.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'item_revenue',
            apiName: 'itemRevenue',
            label: 'Item revenue',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description:
                'Revenue from items sold, minus refunds and excluding tax and shipping, in the property currency.',
            aiHint: 'Item metric: works with Item name.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'items_purchased',
            apiName: 'itemsPurchased',
            label: 'Items purchased',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description: 'Number of item units purchased.',
            aiHint: 'Item metric: works with Item name.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'items_viewed',
            apiName: 'itemsViewed',
            label: 'Items viewed',
            type: MetricType.SUM,
            filterOperators: GA4_METRIC_FILTERS,
            description: 'Number of item units viewed.',
            aiHint: 'Item metric: works with Item name.',
            aggregation: ADDITIVE,
        }),
    ],
};

export const GA4_EXPLORES = [GA4_REPORT_EXPLORE] as const;

const scannedDimension = (
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

const scannedMetric = (
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
            scannedDimension(
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
            scannedMetric(
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

/** The property's metadata, as GA4 returns it. */
export type Ga4Catalog = { ga4Metadata?: unknown };

/** Reads the property's dimensions and metrics, including its custom ones. */
export const scanGa4Metadata = async ({
    settings: { propertyId },
    runtime,
}: {
    settings: { propertyId: string };
    runtime: LiveRuntime;
}): Promise<Ga4Catalog> => {
    const response = await runtime.send({
        method: 'GET',
        path: getGa4MetadataPath(propertyId),
        body: null,
    });
    return { ga4Metadata: response.body };
};

export const ga4Model: LiveModel<ApiConnectorType.GA4, Ga4Catalog> = {
    explores: GA4_EXPLORES,
    plannedNames: ['ecommerce'],
    discovery: {
        discover: scanGa4Metadata,
        withFields: (definition, catalog: Ga4Catalog) =>
            withGa4MetadataFields(definition, catalog.ga4Metadata),
    },
};
