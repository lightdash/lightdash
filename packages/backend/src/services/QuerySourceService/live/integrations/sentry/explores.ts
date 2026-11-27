import {
    DimensionType,
    FilterOperator,
    MetricType,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

/** Search takes a list of values per key, so "is" and "is not" take several. */
export const SENTRY_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

/** Projects and environments are request parameters, which only include. */
export const SENTRY_SCOPE_FILTERS = [FilterOperator.EQUALS];

// Search matches part of a text with wildcards
export const SENTRY_TEXT_FILTERS = [
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

export const SENTRY_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

export const SENTRY_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended: the missing side is today or the first day Sentry keeps
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

/** Sentry keeps events and sessions for 90 days. */
export const SENTRY_RETENTION_DAYS = 90;

const dimension = (
    name: string,
    label: string,
    type: DimensionType,
    filterOperators: FilterOperator[],
    description: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators,
});

const text = (
    name: string,
    label: string,
    filterOperators: FilterOperator[],
    description: string,
    aiHint?: string,
) =>
    dimension(
        name,
        label,
        DimensionType.STRING,
        filterOperators,
        description,
        aiHint,
    );

const date = (
    name: string,
    label: string,
    description: string,
    aiHint?: string,
) =>
    dimension(
        name,
        label,
        DimensionType.DATE,
        SENTRY_DATE_FILTERS,
        description,
        aiHint,
    );

// Sentry's totals can't be filtered on
const metric = (
    name: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    options: { aiHint?: string; format?: string } = {},
): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...options,
    type,
    filterOperators: [],
    aggregation,
});

const project = (noun: string) =>
    text(
        'project',
        'Project',
        SENTRY_SCOPE_FILTERS,
        `Slug of the Sentry project the ${noun} belongs to, such as an app or a service.`,
    );

const environment = (noun: string) =>
    text(
        'environment',
        'Environment',
        SENTRY_SCOPE_FILTERS,
        `Environment the ${noun} came from, such as production.`,
    );

const RELEASE_HINT =
    'The release name the app sends, often its version. Join it to the app version in other data.';

/**
 * Error events, grouped by Sentry. No field holds a user identifier: Users
 * affected is a count, and events are never listed one by one.
 */
export const SENTRY_ERRORS_EXPLORE: LiveExploreDefinition = {
    name: 'errors',
    label: 'Errors',
    description:
        'Error and crash events in one Sentry organization, counted by project, release, issue and day. Dates are in UTC.',
    aiHint: 'Read live from Sentry, which groups and counts the events; a query reads at most 999 groups. Without a Date filter the query reads the last 30 full days, and Sentry keeps 90 days. Issues and Users affected are distinct counts: do not sum them across rows. To count issues by release, select Release and Issues. Filter Project to read one app.',
    dimensions: [
        date(
            'date',
            'Date',
            'Day of the events, in UTC.',
            'Without a date filter the query reads the last 30 full days.',
        ),
        project('event'),
        text(
            'release',
            'Release',
            SENTRY_VALUE_FILTERS,
            'Release of the app that sent the events.',
            RELEASE_HINT,
        ),
        environment('event'),
        text(
            'level',
            'Level',
            SENTRY_VALUE_FILTERS,
            'Severity of the events: fatal, error, warning, info or debug.',
        ),
        text(
            'issue',
            'Issue',
            SENTRY_VALUE_FILTERS,
            'Short ID of the issue Sentry grouped the events into, such as MOBILE-1A.',
        ),
        text(
            'title',
            'Title',
            SENTRY_TEXT_FILTERS,
            'Title of the events, usually the error type and message.',
            'Filters match part of the title.',
        ),
        text(
            'error_type',
            'Error type',
            SENTRY_VALUE_FILTERS,
            'Type of the error or exception, such as EXC_BAD_ACCESS.',
        ),
        dimension(
            'unhandled',
            'Unhandled',
            DimensionType.BOOLEAN,
            SENTRY_BOOLEAN_FILTERS,
            'Whether the error was not handled by the app, as a crash is.',
        ),
        text(
            'platform',
            'Platform',
            SENTRY_VALUE_FILTERS,
            'Platform of the SDK that sent the events, such as cocoa, java or javascript.',
        ),
        text(
            'os_name',
            'Operating system',
            SENTRY_VALUE_FILTERS,
            'Name of the operating system, such as iOS or Android.',
        ),
        text(
            'device_family',
            'Device family',
            SENTRY_VALUE_FILTERS,
            'Family of the device, such as iOS or Pixel.',
        ),
    ],
    metrics: [
        metric(
            'events',
            'Events',
            MetricType.COUNT,
            { aggregation: 'additive' },
            'Number of error events.',
        ),
        metric(
            'issues',
            'Issues',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            'Number of distinct issues the events belong to.',
            {
                aiHint: 'Distinct count: summing rows counts an issue once per row.',
            },
        ),
        metric(
            'users_affected',
            'Users affected',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            'Number of distinct users who had at least one of the events.',
            {
                aiHint: 'Distinct count: summing rows counts a user once per row.',
            },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

/**
 * One row per issue. The assignee and the people who saw or commented on
 * an issue are left out.
 */
export const SENTRY_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'Issues (grouped errors and crashes) in one Sentry organization that had events in the last 90 days, one row per issue. Dates are in UTC.',
    aiHint: 'Read live from Sentry issue search, one row per issue; a query reads at most 999 issues. There are no metrics: to count issues by release, project or day, use the Errors explore. Events and Users are totals for the last 90 days. Filter Release to list the issues with events in a release, and First seen to list new issues.',
    dimensions: [
        text(
            'short_id',
            'Issue',
            [],
            'Short ID of the issue, such as MOBILE-1A.',
        ),
        text(
            'title',
            'Title',
            SENTRY_TEXT_FILTERS,
            'Title of the issue, usually the error type and message.',
            'Filters match part of the title.',
        ),
        text(
            'culprit',
            'Culprit',
            [],
            'Function or transaction the error came from.',
        ),
        text(
            'level',
            'Level',
            SENTRY_VALUE_FILTERS,
            'Severity of the issue: fatal, error, warning, info or debug.',
        ),
        text(
            'status',
            'Status',
            SENTRY_VALUE_FILTERS,
            'Whether the issue is unresolved, resolved or archived.',
            'Sentry names an archived issue "ignored" in its data: filter by unresolved, resolved or ignored.',
        ),
        text(
            'substatus',
            'Substatus',
            [],
            'Why the issue has its status: new, ongoing, escalating, regressed or archived.',
        ),
        text(
            'priority',
            'Priority',
            SENTRY_VALUE_FILTERS,
            'Priority Sentry gave the issue: high, medium or low.',
        ),
        project('issue'),
        text(
            'environment',
            'Environment',
            SENTRY_SCOPE_FILTERS,
            'Environments the issue had events in, such as production.',
            'Filter only: keeps issues with events in the environment. Empty when selected.',
        ),
        text(
            'release',
            'Release',
            SENTRY_VALUE_FILTERS,
            'Releases the issue had events in.',
            'Filter only: keeps issues with events in the release. Empty when selected.',
        ),
        text(
            'platform',
            'Platform',
            [],
            'Platform of the SDK that sent the events, such as cocoa, java or javascript.',
        ),
        text(
            'category',
            'Category',
            SENTRY_VALUE_FILTERS,
            'Kind of issue, such as error, performance or feedback.',
        ),
        dimension(
            'unhandled',
            'Unhandled',
            DimensionType.BOOLEAN,
            SENTRY_BOOLEAN_FILTERS,
            'Whether the issue has an error the app did not handle, as a crash is.',
        ),
        date(
            'first_seen',
            'First seen',
            'Day of the first event of the issue, in UTC.',
        ),
        date(
            'last_seen',
            'Last seen',
            'Day of the latest event of the issue, in UTC.',
        ),
        dimension(
            'events',
            'Events',
            DimensionType.NUMBER,
            [],
            'Number of events of the issue in the last 90 days.',
        ),
        dimension(
            'users',
            'Users',
            DimensionType.NUMBER,
            [],
            'Number of distinct users the issue affected in the last 90 days.',
        ),
        text('url', 'URL', [], 'Link to the issue in Sentry.'),
    ],
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

const RATE_FORMAT = '0.00%';
const RATE_HINT =
    'A rate, not additive: never sum or average it across rows. Select it at the grain you need.';

const SESSION_STATUS = 'session_status';
const SESSION_RATES = ['crash_free_sessions', 'crash_free_users'];

/** Release health: sessions and crash-free rates, as Sentry totals them. */
export const SENTRY_SESSIONS_EXPLORE: LiveExploreDefinition = {
    name: 'sessions',
    label: 'Sessions',
    description:
        'Release health in one Sentry organization: sessions, users and crash-free rates by project, release, environment and day. Dates are in UTC.',
    aiHint: 'Read live from Sentry release health. Without a Date filter the query reads the last 30 full days, and Sentry keeps 90 days. Crash-free rates and Users are not additive: select them at the grain you need, such as by Release. Days and groups with no sessions return no row. Only projects whose SDK reports sessions have data. Filter Project to read one app.',
    dimensions: [
        date(
            'date',
            'Date',
            'Day of the sessions, in UTC.',
            'Without a date filter the query reads the last 30 full days.',
        ),
        project('session'),
        text(
            'release',
            'Release',
            SENTRY_VALUE_FILTERS,
            'Release of the app the sessions ran on.',
            RELEASE_HINT,
        ),
        environment('session'),
        text(
            SESSION_STATUS,
            'Session status',
            [],
            'How the sessions ended: healthy, errored, crashed or abnormal.',
            "Can't be selected with a crash-free rate, which already compares the statuses.",
        ),
    ],
    metrics: [
        metric(
            'sessions',
            'Sessions',
            MetricType.SUM,
            { aggregation: 'additive' },
            'Number of sessions.',
        ),
        metric(
            'users',
            'Users',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            'Number of distinct users with at least one session.',
            {
                aiHint: 'Distinct count: summing rows counts a user once per row.',
            },
        ),
        metric(
            'crash_free_sessions',
            'Crash-free sessions',
            MetricType.NUMBER,
            { aggregation: 'non_additive' },
            'Share of sessions that did not end in a crash.',
            { format: RATE_FORMAT, aiHint: RATE_HINT },
        ),
        metric(
            'crash_free_users',
            'Crash-free users',
            MetricType.NUMBER,
            { aggregation: 'non_additive' },
            'Share of users who had no crash.',
            { format: RATE_FORMAT, aiHint: RATE_HINT },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [
        {
            fields: SESSION_RATES,
            with: [SESSION_STATUS],
            reason: 'Sentry works out a crash-free rate from every session status, so it has no rate for one status. Select Sessions to count each status.',
            selectedOnly: true,
        },
    ],
};
