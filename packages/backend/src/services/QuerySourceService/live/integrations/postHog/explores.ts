import { DimensionType, MetricType } from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    explore,
    metric,
    NON_ADDITIVE,
} from '../../explores/declare';
import {
    POSTHOG_DATE_FILTERS,
    POSTHOG_METRIC_FILTERS,
    POSTHOG_STRING_FILTERS,
} from './filters';

export const POSTHOG_EVENTS_EXPLORE = explore({
    name: 'events',
    label: 'Events',
    description:
        'Product events captured by PostHog, such as pageviews, autocaptured clicks and custom events, with their event and person properties. Dates are in the PostHog project time zone.',
    aiHint: 'Without a Date filter the query reads the last 30 days. Unique users and Unique sessions are distinct counts: never sum rows. Events without a session ID are not in Unique sessions. Every event and person property PostHog knows is added as a dimension (Person properties are prefixed "Person").',
    dateRange: { dimension: 'date', defaultDays: 30 },
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'timestamp',
            label: 'Event date',
            type: DimensionType.DATE,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Day the event happened, in the project time zone.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            sql: 'toDate(${TABLE}.timestamp)',
        }),
        dimension({
            name: 'week',
            apiName: 'timestamp',
            label: 'Event week',
            type: DimensionType.DATE,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Week the event happened, shown as its Monday.',
            sql: 'toStartOfWeek(${TABLE}.timestamp, 1)',
        }),
        dimension({
            name: 'month',
            apiName: 'timestamp',
            label: 'Event month',
            type: DimensionType.DATE,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Month the event happened, shown as its first day.',
            sql: 'toStartOfMonth(${TABLE}.timestamp)',
        }),
        dimension({
            name: 'timestamp',
            label: 'Event time',
            type: DimensionType.TIMESTAMP,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Exact time the event happened.',
            sql: '${TABLE}.timestamp',
        }),
        dimension({
            name: 'event',
            label: 'Event name',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'Name of the event, such as $pageview, $autocapture, $identify or a custom event.',
            sql: '${TABLE}.event',
        }),
        dimension({
            name: 'distinct_id',
            label: 'Distinct ID',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                "ID the event was sent with: an anonymous ID until the user is identified, then the user's ID.",
            sql: '${TABLE}.distinct_id',
        }),
        dimension({
            name: 'person_id',
            label: 'Person ID',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'The person the event belongs to, after identifying and merging IDs.',
            sql: 'toString(${TABLE}.person_id)',
        }),
        dimension({
            name: 'current_url',
            apiName: 'properties.$current_url',
            label: 'Current URL',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Full URL of the page the event happened on.',
            sql: '${TABLE}.properties.$current_url',
        }),
        dimension({
            name: 'pathname',
            apiName: 'properties.$pathname',
            label: 'Path',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'Path of the page, without the domain or query string.',
            sql: '${TABLE}.properties.$pathname',
        }),
        dimension({
            name: 'referring_domain',
            apiName: 'properties.$referring_domain',
            label: 'Referring domain',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Domain the visitor came from, or $direct.',
            sql: '${TABLE}.properties.$referring_domain',
        }),
        dimension({
            name: 'utm_source',
            apiName: 'properties.utm_source',
            label: 'UTM source',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'utm_source value in the page URL, such as google or newsletter.',
            sql: '${TABLE}.properties.utm_source',
        }),
        dimension({
            name: 'browser',
            apiName: 'properties.$browser',
            label: 'Browser',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Browser name, such as Chrome or Safari.',
            sql: '${TABLE}.properties.$browser',
        }),
        dimension({
            name: 'os',
            apiName: 'properties.$os',
            label: 'Operating system',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Operating system, such as Mac OS X or Android.',
            sql: '${TABLE}.properties.$os',
        }),
        dimension({
            name: 'device_type',
            apiName: 'properties.$device_type',
            label: 'Device type',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Type of device: Desktop, Mobile or Tablet.',
            sql: '${TABLE}.properties.$device_type',
        }),
        dimension({
            name: 'country',
            apiName: 'properties.$geoip_country_code',
            label: 'Country code',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Two-letter country code, based on the IP address.',
            sql: '${TABLE}.properties.$geoip_country_code',
        }),
    ],
    metrics: [
        metric({
            name: 'event_count',
            label: 'Events',
            type: MetricType.COUNT,
            filterOperators: POSTHOG_METRIC_FILTERS,
            description: 'Number of events captured.',
            sql: '${TABLE}.uuid',
            // A count of event rows (https://posthog.com/docs/sql)
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'unique_users',
            label: 'Unique users',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: POSTHOG_METRIC_FILTERS,
            description:
                'Number of distinct people, after identifying and merging IDs.',
            aiHint: 'Distinct count: never sum rows.',
            sql: '${TABLE}.person_id',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'unique_sessions',
            label: 'Unique sessions',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: POSTHOG_METRIC_FILTERS,
            description: 'Number of distinct sessions.',
            aiHint: 'Distinct count: never sum rows. Events without a session ID are not counted.',
            // Events without a session have an empty session ID
            sql: "nullIf(${TABLE}.$session_id, '')",
            // Sessions can span days, so daily counts overlap
            aggregation: NON_ADDITIVE,
        }),
    ],
});

export const POSTHOG_EXPLORES = [POSTHOG_EVENTS_EXPLORE] as const;
