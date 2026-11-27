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
        `This is the slug of the Sentry project that the ${noun} belongs to. A project is an app or a service.`,
    );

const environment = (noun: string) =>
    text(
        'environment',
        'Environment',
        SENTRY_SCOPE_FILTERS,
        `This is the environment that the ${noun} came from. An example is production.`,
    );

const RELEASE_HINT =
    'The app sends this release name, and it is often the app version. Join it to the app version in other data.';

const DATE_HINT =
    'Without a Date filter, the query reads the last 30 full days.';

const LEVELS = 'The values are fatal, error, warning, info and debug.';

const TITLE = 'It is usually the error type and the message.';
const TITLE_HINT = 'A filter matches a part of the title.';

const PLATFORM =
    'This is the platform of the app that sent the events. Examples are cocoa, java and javascript.';

const distinctHint = (noun: string) =>
    `This is a distinct count. A sum of rows counts ${noun} one time for each row.`;

/**
 * Error events, grouped by Sentry. No field holds a user identifier: Users
 * affected is a count, and events are never listed one by one.
 */
export const SENTRY_ERRORS_EXPLORE: LiveExploreDefinition = {
    name: 'errors',
    label: 'Errors',
    description:
        'This explore counts the error and crash events of one Sentry organization by project, release, issue and day. Dates are in UTC.',
    aiHint: 'Sentry groups and counts the events live. A query reads at most 999 groups. Without a Date filter, the query reads the last 30 full days. Sentry keeps 90 days. Issues and Users affected are distinct counts, so do not sum them across rows. To count issues by release, select Release and Issues. To read one app, filter Project.',
    dimensions: [
        date(
            'date',
            'Date',
            'This is the day of the events, in UTC.',
            DATE_HINT,
        ),
        project('event'),
        text(
            'release',
            'Release',
            SENTRY_VALUE_FILTERS,
            'This is the release of the app that sent the events.',
            RELEASE_HINT,
        ),
        environment('event'),
        text(
            'level',
            'Level',
            SENTRY_VALUE_FILTERS,
            `This is the severity of the events. ${LEVELS}`,
        ),
        text(
            'issue',
            'Issue',
            SENTRY_VALUE_FILTERS,
            'This is the short ID of the issue that Sentry put the events in. An example is MOBILE-1A.',
        ),
        text(
            'title',
            'Title',
            SENTRY_TEXT_FILTERS,
            `This is the title of the events. ${TITLE}`,
            TITLE_HINT,
        ),
        text(
            'error_type',
            'Error type',
            SENTRY_VALUE_FILTERS,
            'This is the type of the error or exception. An example is EXC_BAD_ACCESS.',
        ),
        dimension(
            'unhandled',
            'Unhandled',
            DimensionType.BOOLEAN,
            SENTRY_BOOLEAN_FILTERS,
            'This says whether the app failed to handle the error. A crash is an unhandled error.',
        ),
        text('platform', 'Platform', SENTRY_VALUE_FILTERS, PLATFORM),
        text(
            'os_name',
            'Operating system',
            SENTRY_VALUE_FILTERS,
            'This is the name of the operating system. Examples are iOS and Android.',
        ),
        text(
            'device_family',
            'Device family',
            SENTRY_VALUE_FILTERS,
            'This is the family of the device. Examples are iOS and Pixel.',
        ),
    ],
    metrics: [
        metric(
            'events',
            'Events',
            MetricType.COUNT,
            { aggregation: 'additive' },
            'This is the number of error events.',
        ),
        metric(
            'issues',
            'Issues',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            'This is the number of distinct issues that the events belong to.',
            { aiHint: distinctHint('an issue') },
        ),
        metric(
            'users_affected',
            'Users affected',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            'This is the number of distinct users who had one or more of the events.',
            { aiHint: distinctHint('a user') },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

const FILTER_ONLY_HINT = (noun: string) =>
    `Use this field as a filter only. The filter keeps the issues with events in the ${noun}. The column is empty when selected.`;

/**
 * One row per issue. The assignee and the people who saw or commented on
 * an issue are left out. So is the culprit, which an app can set to any
 * text, such as a path with an account in it.
 */
export const SENTRY_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'This explore lists the issues of one Sentry organization that had events in the last 90 days, one row for each issue. An issue is a group of errors or crashes. Dates are in UTC.',
    aiHint: 'Sentry issue search answers live, one row for each issue. A query reads at most 999 issues. This explore has no metrics. To count issues by release, project or day, use the Errors explore. Events and Users are totals for the last 90 days. To list the issues with events in a release, filter Release. To list new issues, filter First seen. A Title filter takes one value.',
    dimensions: [
        text(
            'short_id',
            'Issue',
            [],
            'This is the short ID of the issue. An example is MOBILE-1A.',
        ),
        text(
            'title',
            'Title',
            SENTRY_TEXT_FILTERS,
            `This is the title of the issue. ${TITLE}`,
            TITLE_HINT,
        ),
        text(
            'level',
            'Level',
            SENTRY_VALUE_FILTERS,
            `This is the severity of the issue. ${LEVELS}`,
        ),
        text(
            'status',
            'Status',
            SENTRY_VALUE_FILTERS,
            'This is the status of the issue. The values are unresolved, resolved and ignored.',
            'Sentry shows an ignored issue as archived. Filter by unresolved, resolved or ignored.',
        ),
        text(
            'substatus',
            'Substatus',
            [],
            'This says why the issue has its status. Examples are new, ongoing, escalating and regressed.',
        ),
        text(
            'priority',
            'Priority',
            SENTRY_VALUE_FILTERS,
            'This is the priority that Sentry gave the issue. The values are high, medium and low.',
        ),
        project('issue'),
        text(
            'environment',
            'Environment',
            SENTRY_SCOPE_FILTERS,
            'These are the environments that the issue had events in. An example is production.',
            FILTER_ONLY_HINT('environment'),
        ),
        text(
            'release',
            'Release',
            SENTRY_VALUE_FILTERS,
            'These are the releases that the issue had events in.',
            FILTER_ONLY_HINT('release'),
        ),
        text('platform', 'Platform', [], PLATFORM),
        text(
            'category',
            'Category',
            SENTRY_VALUE_FILTERS,
            'This is the kind of issue. Examples are error, performance and feedback.',
        ),
        dimension(
            'unhandled',
            'Unhandled',
            DimensionType.BOOLEAN,
            SENTRY_BOOLEAN_FILTERS,
            'This says whether the issue has an error that the app failed to handle. A crash is an unhandled error.',
        ),
        date(
            'first_seen',
            'First seen',
            'This is the day of the first event of the issue, in UTC.',
        ),
        date(
            'last_seen',
            'Last seen',
            'This is the day of the latest event of the issue, in UTC.',
        ),
        dimension(
            'events',
            'Events',
            DimensionType.NUMBER,
            [],
            'This is the number of events of the issue in the last 90 days.',
        ),
        dimension(
            'users',
            'Users',
            DimensionType.NUMBER,
            [],
            'This is the number of distinct users that the issue affected in the last 90 days.',
        ),
        text('url', 'URL', [], 'This is the link to the issue in Sentry.'),
    ],
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

const RATE_FORMAT = '0.00%';
const RATE_HINT =
    'This is a rate, and it is not additive. Do not sum or average it across rows. Select it at the grain you need.';

const SESSION_STATUS = 'session_status';
const SESSION_RATES = ['crash_free_sessions', 'crash_free_users'];

/** Release health: sessions and crash-free rates, as Sentry totals them. */
export const SENTRY_SESSIONS_EXPLORE: LiveExploreDefinition = {
    name: 'sessions',
    label: 'Sessions',
    description:
        'This explore reads release health from one Sentry organization. It gives sessions, users and crash-free rates by project, release, environment and day. Dates are in UTC.',
    aiHint: 'Sentry release health answers live. Without a Date filter, the query reads the last 30 full days. Sentry keeps 90 days. Crash-free rates and Users are not additive, so select them at the grain you need, for example by Release. A day or a group with no sessions returns no row. Only a project whose app reports sessions has data. To read one app, filter Project.',
    dimensions: [
        date(
            'date',
            'Date',
            'This is the day of the sessions, in UTC.',
            DATE_HINT,
        ),
        project('session'),
        text(
            'release',
            'Release',
            SENTRY_VALUE_FILTERS,
            'This is the release of the app that the sessions ran on.',
            RELEASE_HINT,
        ),
        environment('session'),
        text(
            SESSION_STATUS,
            'Session status',
            [],
            'This says how the sessions ended. The values are healthy, errored, crashed and abnormal.',
            'Select it alone or with Date. A crash-free rate already compares the statuses, so do not select a rate with it. Filter Release, Project or Environment, and do not select them with it.',
        ),
    ],
    metrics: [
        metric(
            'sessions',
            'Sessions',
            MetricType.SUM,
            { aggregation: 'additive' },
            'This is the number of sessions.',
        ),
        metric(
            'users',
            'Users',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            'This is the number of distinct users with one or more sessions.',
            { aiHint: distinctHint('a user') },
        ),
        metric(
            'crash_free_sessions',
            'Crash-free sessions',
            MetricType.NUMBER,
            { aggregation: 'non_additive' },
            'This is the share of sessions that did not end in a crash.',
            { format: RATE_FORMAT, aiHint: RATE_HINT },
        ),
        metric(
            'crash_free_users',
            'Crash-free users',
            MetricType.NUMBER,
            { aggregation: 'non_additive' },
            'This is the share of users who had no crash.',
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
            reason: 'Sentry works out a crash-free rate from every session status, so it has no rate for one status. To count each status, select Sessions.',
            selectedOnly: true,
        },
        {
            fields: [SESSION_STATUS],
            with: ['release', 'project', 'environment'],
            reason: 'Sentry does not say when it cuts short a list of sessions by status and by another field, so the result could be incomplete. Filter Release, Project or Environment instead.',
            selectedOnly: true,
        },
    ],
};
