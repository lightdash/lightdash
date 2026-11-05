import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import { z } from 'zod';
import type {
    ApiSourceDimensionDefinition,
    ApiSourceExploreDefinition,
    ApiSourceMetricDefinition,
} from '../apiSourceExplore';

export const GA4_SEMANTIC_LAYER_VERSION = 1;

const STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];
const DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
];
const METRIC_FILTERS = [
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
): ApiSourceDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    type: DimensionType.STRING,
    filterOperators: STRING_FILTERS,
});

const metric = (
    name: string,
    apiName: string,
    label: string,
    type: MetricType,
    description?: string,
    format?: string,
): ApiSourceMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    type,
    filterOperators: METRIC_FILTERS,
    ...(format ? { format } : {}),
});

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

export const GA4_REPORT_EXPLORE: ApiSourceExploreDefinition = {
    name: 'report',
    label: 'Report',
    description:
        'Users, sessions, events, key events and revenue for one Google Analytics property, in the property time zone.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: DATE_FILTERS,
            description:
                'Day of the activity, in the property time zone. Queries without a date filter read the last 28 days.',
        },
        dimension(
            'year_month',
            'yearMonth',
            'Year and month',
            'YYYYMM, e.g. 202610.',
        ),
        dimension(
            'country',
            'country',
            'Country',
            'Country the user was in, from their IP address.',
        ),
        dimension(
            'city',
            'city',
            'City',
            'Rare values can be grouped into "(other)".',
        ),
        dimension(
            'device_category',
            'deviceCategory',
            'Device category',
            'desktop, mobile or tablet.',
        ),
        dimension('platform', 'platform', 'Platform', 'web, Android or iOS.'),
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
            "Google's channel for the session, such as Organic Search, Direct or Paid Social.",
        ),
        dimension(
            'first_user_source',
            'firstUserSource',
            'First user source',
            'Where the user first came from; differs from the session source for returning users.',
        ),
        dimension(
            'landing_page',
            'landingPage',
            'Landing page',
            'Path of the first page in the session.',
        ),
        dimension(
            'page_path',
            'pagePath',
            'Page path',
            'Event-scoped: splitting sessions or users by page counts a session once per page.',
        ),
        dimension(
            'event_name',
            'eventName',
            'Event name',
            'page_view, session_start, purchase or a custom event.',
        ),
        dimension(
            'new_vs_returning',
            'newVsReturning',
            'New or returning',
            'new for a first visit, returning otherwise.',
        ),
        dimension(
            'item_name',
            'itemName',
            'Item name',
            'Item-scoped: only works with item metrics (item revenue, items purchased, items viewed).',
        ),
    ],
    metrics: [
        metric(
            'active_users',
            'activeUsers',
            'Active users',
            MetricType.COUNT_DISTINCT,
            'Distinct engaged users; daily values do not add up to a weekly total.',
        ),
        metric(
            'total_users',
            'totalUsers',
            'Total users',
            MetricType.COUNT_DISTINCT,
            'Distinct users who logged any event, engaged or not.',
        ),
        metric(
            'new_users',
            'newUsers',
            'New users',
            MetricType.SUM,
            'Users who visited for the first time.',
        ),
        metric(
            'sessions',
            'sessions',
            'Sessions',
            MetricType.SUM,
            'Sessions started.',
        ),
        metric(
            'engaged_sessions',
            'engagedSessions',
            'Engaged sessions',
            MetricType.SUM,
            'Sessions over 10 seconds, with a key event, or with 2 or more views.',
        ),
        metric(
            'engagement_rate',
            'engagementRate',
            'Engagement rate',
            MetricType.NUMBER,
            'Engaged sessions divided by sessions.',
            '0.0%',
        ),
        metric(
            'average_session_duration',
            'averageSessionDuration',
            'Average session duration (s)',
            MetricType.AVERAGE,
            'Average session length, in seconds.',
        ),
        metric(
            'screen_page_views',
            'screenPageViews',
            'Views',
            MetricType.SUM,
            'Web pages and app screens viewed, repeats included.',
        ),
        metric(
            'event_count',
            'eventCount',
            'Event count',
            MetricType.SUM,
            'Events logged.',
        ),
        metric(
            'key_events',
            'keyEvents',
            'Key events',
            MetricType.SUM,
            'Events marked as key events (formerly conversions).',
        ),
        metric(
            'total_revenue',
            'totalRevenue',
            'Total revenue',
            MetricType.SUM,
            'In the property currency.',
        ),
        metric(
            'ecommerce_purchases',
            'ecommercePurchases',
            'Ecommerce purchases',
            MetricType.SUM,
            'Purchases completed.',
        ),
        metric(
            'item_revenue',
            'itemRevenue',
            'Item revenue',
            MetricType.SUM,
            'Revenue from items sold, in the property currency, excluding tax and shipping.',
        ),
        metric(
            'items_purchased',
            'itemsPurchased',
            'Items purchased',
            MetricType.SUM,
            'Units of items purchased.',
        ),
        metric(
            'items_viewed',
            'itemsViewed',
            'Items viewed',
            MetricType.SUM,
            'Times items were viewed.',
        ),
    ],
    filterGroups: { or: true, nested: true },
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
    definition: ApiSourceExploreDefinition,
    metadata: unknown,
): ApiSourceExploreDefinition => {
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
            ),
        )
        .filter(({ name }) => isNew(name));
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
        metrics: [...definition.metrics, ...metrics],
    };
};
