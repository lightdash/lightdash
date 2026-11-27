import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    MetricType,
} from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    type LiveModel,
    type NamedLiveExploreDefinition,
} from '../../sdk';

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

/**
 * Error events, grouped by Sentry. No field holds a user identifier: Users
 * affected is a count, and events are never listed one by one. Sentry's
 * totals can't be filtered on.
 */
export const SENTRY_ERRORS_EXPLORE: NamedLiveExploreDefinition = {
    name: 'errors',
    label: 'Errors',
    description:
        'This explore counts the error and crash events of one Sentry organization by project, release, issue and day. Dates are in UTC.',
    aiHint: 'Sentry groups and counts the events live. A query reads at most 999 groups. Without a Date filter, the query reads the last 30 full days. Sentry keeps 90 days. Issues and Users affected are distinct counts, so do not sum them across rows. To count issues by release, select Release and Issues. To read one app, filter Project.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: SENTRY_DATE_FILTERS,
            description: 'This is the day of the events, in UTC.',
            aiHint: 'Without a Date filter, the query reads the last 30 full days.',
        }),
        dimension({
            name: 'project',
            label: 'Project',
            type: DimensionType.STRING,
            filterOperators: SENTRY_SCOPE_FILTERS,
            description:
                'This is the slug of the Sentry project that the event belongs to. A project is an app or a service.',
        }),
        dimension({
            name: 'release',
            label: 'Release',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description: 'This is the release of the app that sent the events.',
            aiHint: 'The app sends this release name, and it is often the app version. Join it to the app version in other data.',
        }),
        dimension({
            name: 'environment',
            label: 'Environment',
            type: DimensionType.STRING,
            filterOperators: SENTRY_SCOPE_FILTERS,
            description:
                'This is the environment that the event came from. An example is production.',
        }),
        dimension({
            name: 'level',
            label: 'Level',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the severity of the events. The values are fatal, error, warning, info and debug.',
        }),
        dimension({
            name: 'issue',
            label: 'Issue',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the short ID of the issue that Sentry put the events in. An example is MOBILE-1A.',
        }),
        dimension({
            name: 'title',
            label: 'Title',
            type: DimensionType.STRING,
            filterOperators: SENTRY_TEXT_FILTERS,
            description:
                'This is the title of the events. It is usually the error type and the message.',
            aiHint: 'A filter matches a part of the title.',
        }),
        dimension({
            name: 'error_type',
            label: 'Error type',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the type of the error or exception. An example is EXC_BAD_ACCESS.',
        }),
        dimension({
            name: 'unhandled',
            label: 'Unhandled',
            type: DimensionType.BOOLEAN,
            filterOperators: SENTRY_BOOLEAN_FILTERS,
            description:
                'This says whether the app failed to handle the error. A crash is an unhandled error.',
        }),
        dimension({
            name: 'platform',
            label: 'Platform',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the platform of the app that sent the events. Examples are cocoa, java and javascript.',
        }),
        dimension({
            name: 'os_name',
            label: 'Operating system',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the name of the operating system. Examples are iOS and Android.',
        }),
        dimension({
            name: 'device_family',
            label: 'Device family',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the family of the device. Examples are iOS and Pixel.',
        }),
    ],
    metrics: [
        // count(): each event is counted in one group, so groups add up
        // (docs.sentry.io/product/explore/discover-queries/query-builder/#aggregate-functions)
        metric({
            name: 'events',
            label: 'Events',
            type: MetricType.COUNT,
            filterOperators: [],
            description: 'This is the number of error events.',
            aggregation: ADDITIVE,
        }),
        // count_unique(issue): an issue with events in two groups is counted
        // in each, so groups don't add up
        metric({
            name: 'issues',
            label: 'Issues',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: [],
            description:
                'This is the number of distinct issues that the events belong to.',
            aiHint: 'This is a distinct count. A sum of rows counts an issue one time for each row.',
            aggregation: NON_ADDITIVE,
        }),
        // count_unique(user): a distinct count, so groups don't add up
        metric({
            name: 'users_affected',
            label: 'Users affected',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: [],
            description:
                'This is the number of distinct users who had one or more of the events.',
            aiHint: 'This is a distinct count. A sum of rows counts a user one time for each row.',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

/**
 * One row per issue. The assignee and the people who saw or commented on
 * an issue are left out. So is the culprit, which an app can set to any
 * text, such as a path with an account in it.
 */
export const SENTRY_ISSUES_EXPLORE: NamedLiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'This explore lists the issues of one Sentry organization that had events in the last 90 days, one row for each issue. An issue is a group of errors or crashes. Dates are in UTC.',
    aiHint: 'Sentry issue search answers live, one row for each issue. A query reads at most 999 issues. This explore has no metrics. To count issues by release, project or day, use the Errors explore. Events and Users are totals for the last 90 days. To list the issues with events in a release, filter Release. To list new issues, filter First seen. A Title filter takes one value.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'short_id',
            label: 'Issue',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'This is the short ID of the issue. An example is MOBILE-1A.',
        }),
        dimension({
            name: 'title',
            label: 'Title',
            type: DimensionType.STRING,
            filterOperators: SENTRY_TEXT_FILTERS,
            description:
                'This is the title of the issue. It is usually the error type and the message.',
            aiHint: 'A filter matches a part of the title.',
        }),
        dimension({
            name: 'level',
            label: 'Level',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the severity of the issue. The values are fatal, error, warning, info and debug.',
        }),
        dimension({
            name: 'status',
            label: 'Status',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the status of the issue. The values are unresolved, resolved and ignored.',
            aiHint: 'Sentry shows an ignored issue as archived. Filter by unresolved, resolved or ignored.',
        }),
        dimension({
            name: 'substatus',
            label: 'Substatus',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'This says why the issue has its status. Examples are new, ongoing, escalating and regressed.',
        }),
        dimension({
            name: 'priority',
            label: 'Priority',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the priority that Sentry gave the issue. The values are high, medium and low.',
        }),
        dimension({
            name: 'project',
            label: 'Project',
            type: DimensionType.STRING,
            filterOperators: SENTRY_SCOPE_FILTERS,
            description:
                'This is the slug of the Sentry project that the issue belongs to. A project is an app or a service.',
        }),
        dimension({
            name: 'environment',
            label: 'Environment',
            type: DimensionType.STRING,
            filterOperators: SENTRY_SCOPE_FILTERS,
            description:
                'These are the environments that the issue had events in. An example is production.',
            aiHint: 'Use this field as a filter only. The filter keeps the issues with events in the environment. The column is empty when selected.',
        }),
        dimension({
            name: 'release',
            label: 'Release',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description: 'These are the releases that the issue had events in.',
            aiHint: 'Use this field as a filter only. The filter keeps the issues with events in the release. The column is empty when selected.',
        }),
        dimension({
            name: 'platform',
            label: 'Platform',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'This is the platform of the app that sent the events. Examples are cocoa, java and javascript.',
        }),
        dimension({
            name: 'category',
            label: 'Category',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the kind of issue. Examples are error, performance and feedback.',
        }),
        dimension({
            name: 'unhandled',
            label: 'Unhandled',
            type: DimensionType.BOOLEAN,
            filterOperators: SENTRY_BOOLEAN_FILTERS,
            description:
                'This says whether the issue has an error that the app failed to handle. A crash is an unhandled error.',
        }),
        dimension({
            name: 'first_seen',
            label: 'First seen',
            type: DimensionType.DATE,
            filterOperators: SENTRY_DATE_FILTERS,
            description:
                'This is the day of the first event of the issue, in UTC.',
        }),
        dimension({
            name: 'last_seen',
            label: 'Last seen',
            type: DimensionType.DATE,
            filterOperators: SENTRY_DATE_FILTERS,
            description:
                'This is the day of the latest event of the issue, in UTC.',
        }),
        dimension({
            name: 'events',
            label: 'Events',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'This is the number of events of the issue in the last 90 days.',
        }),
        dimension({
            name: 'users',
            label: 'Users',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'This is the number of distinct users that the issue affected in the last 90 days.',
        }),
        dimension({
            name: 'url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'This is the link to the issue in Sentry.',
        }),
    ],
    metrics: [],
};

/** Release health: sessions and crash-free rates, as Sentry totals them. */
export const SENTRY_SESSIONS_EXPLORE: NamedLiveExploreDefinition = {
    name: 'sessions',
    label: 'Sessions',
    description:
        'This explore reads release health from one Sentry organization. It gives sessions, users and crash-free rates by project, release, environment and day. Dates are in UTC.',
    aiHint: 'Sentry release health answers live. Without a Date filter, the query reads the last 30 full days. Sentry keeps 90 days. Crash-free rates and Users are not additive, so select them at the grain you need, for example by Release. A day or a group with no sessions returns no row. Only a project whose app reports sessions has data. To read one app, filter Project.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [
        {
            fields: ['crash_free_sessions', 'crash_free_users'],
            with: ['session_status'],
            reason: 'Sentry works out a crash-free rate from every session status, so it has no rate for one status. To count each status, select Sessions.',
            selectedOnly: true,
        },
        {
            fields: ['session_status'],
            with: ['release', 'project', 'environment'],
            reason: 'Sentry does not say when it cuts short a list of sessions by status and by another field, so the result could be incomplete. Filter Release, Project or Environment instead.',
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: SENTRY_DATE_FILTERS,
            description: 'This is the day of the sessions, in UTC.',
            aiHint: 'Without a Date filter, the query reads the last 30 full days.',
        }),
        dimension({
            name: 'project',
            label: 'Project',
            type: DimensionType.STRING,
            filterOperators: SENTRY_SCOPE_FILTERS,
            description:
                'This is the slug of the Sentry project that the session belongs to. A project is an app or a service.',
        }),
        dimension({
            name: 'release',
            label: 'Release',
            type: DimensionType.STRING,
            filterOperators: SENTRY_VALUE_FILTERS,
            description:
                'This is the release of the app that the sessions ran on.',
            aiHint: 'The app sends this release name, and it is often the app version. Join it to the app version in other data.',
        }),
        dimension({
            name: 'environment',
            label: 'Environment',
            type: DimensionType.STRING,
            filterOperators: SENTRY_SCOPE_FILTERS,
            description:
                'This is the environment that the session came from. An example is production.',
        }),
        dimension({
            name: 'session_status',
            label: 'Session status',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                'This says how the sessions ended. The values are healthy, errored, crashed and abnormal.',
            aiHint: 'Select it alone or with Date. A crash-free rate already compares the statuses, so do not select a rate with it. Filter Release, Project or Environment, and do not select them with it.',
        }),
    ],
    metrics: [
        // sum(session): each session is counted in one group, so groups add
        // up (docs.sentry.io/api/releases/retrieve-release-health-session-statistics/)
        metric({
            name: 'sessions',
            label: 'Sessions',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'This is the number of sessions.',
            aggregation: ADDITIVE,
        }),
        // count_unique(user): a user with sessions in two groups is counted
        // in each, so groups don't add up
        metric({
            name: 'users',
            label: 'Users',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: [],
            description:
                'This is the number of distinct users with one or more sessions.',
            aiHint: 'This is a distinct count. A sum of rows counts a user one time for each row.',
            aggregation: NON_ADDITIVE,
        }),
        // crash_free_rate(session): a rate Sentry works out over the group's
        // sessions; its parts are not read, so it can't be re-derived
        metric({
            name: 'crash_free_sessions',
            label: 'Crash-free sessions',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'This is the share of sessions that did not end in a crash.',
            aiHint: 'This is a rate, and it is not additive. Do not sum or average it across rows. Select it at the grain you need.',
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
        // crash_free_rate(user): a rate over distinct users, which don't add
        // up across groups
        metric({
            name: 'crash_free_users',
            label: 'Crash-free users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'This is the share of users who had no crash.',
            aiHint: 'This is a rate, and it is not additive. Do not sum or average it across rows. Select it at the grain you need.',
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

export const SENTRY_EXPLORES = [
    SENTRY_ERRORS_EXPLORE,
    SENTRY_ISSUES_EXPLORE,
    SENTRY_SESSIONS_EXPLORE,
] as const;

export const sentryModel: LiveModel<ApiConnectorType.SENTRY> = {
    explores: SENTRY_EXPLORES,
    plannedNames: ['releases', 'transactions', 'logs', 'monitors'],
};
