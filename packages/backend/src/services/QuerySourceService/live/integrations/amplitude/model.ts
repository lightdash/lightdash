import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
} from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    ratio,
    type LiveExploreDefinition,
    type LiveModel,
} from '../../sdk';
import { AMPLITUDE_INTERVALS } from './api';

export const AMPLITUDE_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
];

/** Segment filters on a property: Amplitude's `is` and `is not`. */
export const AMPLITUDE_PROPERTY_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

/** An event name, or the ordered steps of a funnel. */
export const AMPLITUDE_EVENT_FILTERS = [FilterOperator.EQUALS];

export const AMPLITUDE_NUMBER_FILTERS = [FilterOperator.EQUALS];

// Event segmentation (/api/2/events/segmentation). Totals add up across days
// and property values; uniques count each user once per row, so they don't.
export const AMPLITUDE_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        'Event counts and unique users per event in one Amplitude project, by day, week or month.',
    aiHint: 'Without a Date filter the query reads the last 30 days. Filter Event (equals) to choose up to 10 events; without it every event is counted together in one row per period. Amplitude groups by one user property at a time: pick at most one of Country, Region, City, Platform, OS, Device type, Language, App version as a dimension. Unique users, Events per user and Share of active users are not additive: never sum rows across dates; query a coarser date grain instead.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: AMPLITUDE_DATE_FILTERS,
            description: 'Day of the events, in the project time zone.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_week',
            apiName: 'week',
            label: 'Date week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                "Week of the activity, shown as its first day in the project time zone. Weeks start on the day Amplitude's project settings use.",
            aiHint: `Filter Date, not this field, to choose the weeks. Amplitude groups the weeks itself (interval ${AMPLITUDE_INTERVALS.week}).`,
            timeInterval: { base: 'date', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month of the activity, shown as its first day in the project time zone.',
            aiHint: `Filter Date, not this field, to choose the months. Amplitude groups the months itself (interval ${AMPLITUDE_INTERVALS.month}).`,
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'event_type',
            label: 'Event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description: 'Name of the event, as tracked in Amplitude.',
            aiHint: 'Filter it (equals) to choose up to 10 events. Without a filter the row counts every event together, not per event.',
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description:
                'Country of the user, as Amplitude resolves it from location data.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'region',
            label: 'Region',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Region or state of the user.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'city',
            label: 'City',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'City of the user.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'platform',
            label: 'Platform',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description:
                'Platform the user was on, such as Web, iOS or Android.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'os',
            label: 'OS',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: "Operating system and version of the user's device.",
            groups: ['User properties'],
        }),
        dimension({
            name: 'device_type',
            label: 'Device type',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Device model, such as Apple iPhone.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'language',
            label: 'Language',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: "Language the user's device or browser is set to.",
            groups: ['User properties'],
        }),
        dimension({
            name: 'version',
            label: 'App version',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Version of the app the user was on.',
            groups: ['User properties'],
        }),
    ],
    metrics: [
        metric({
            name: 'event_count',
            label: 'Event count',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times the event was triggered (Amplitude\'s "totals").',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'unique_users',
            label: 'Unique users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Number of distinct users who triggered the event at least once in the period (Amplitude\'s "uniques").',
            aiHint: 'Not additive: never sum rows across dates or properties; choose a coarser date grain instead.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'events_per_user',
            label: 'Events per user',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average number of times each user triggered the event in the period (Amplitude\'s "average").',
            aiHint: 'Not additive; never sum or average rows.',
            format: '0.00',
            aggregation: ratio('event_count', 'unique_users'),
        }),
        metric({
            name: 'percent_of_active_users',
            label: 'Share of active users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Users who triggered the event as a share of all active users in the period (Amplitude\'s "% DAU").',
            aiHint: 'Not additive; never sum or average rows.',
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

// Active and new users (/api/2/users). A user is new once, so new users add
// up; active users are counted once per period and don't.
export const AMPLITUDE_USERS_EXPLORE: LiveExploreDefinition = {
    name: 'users',
    label: 'Active users',
    description:
        'Active and new users in one Amplitude project, by day, week or month.',
    aiHint: 'Without a Date filter the query reads the last 30 days. Amplitude groups by one user property at a time: pick at most one of Country, Region, City, Platform, OS, Device type, Language, App version as a dimension. Active users is not additive across dates: never sum days into a week or month; use the week or month dimension instead. New users is additive.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: AMPLITUDE_DATE_FILTERS,
            description: 'Day of the activity, in the project time zone.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_week',
            apiName: 'week',
            label: 'Date week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                "Week of the activity, shown as its first day in the project time zone. Weeks start on the day Amplitude's project settings use.",
            aiHint: `Filter Date, not this field, to choose the weeks. Amplitude groups the weeks itself (interval ${AMPLITUDE_INTERVALS.week}).`,
            timeInterval: { base: 'date', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month of the activity, shown as its first day in the project time zone.',
            aiHint: `Filter Date, not this field, to choose the months. Amplitude groups the months itself (interval ${AMPLITUDE_INTERVALS.month}).`,
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description:
                'Country of the user, as Amplitude resolves it from location data.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'region',
            label: 'Region',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Region or state of the user.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'city',
            label: 'City',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'City of the user.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'platform',
            label: 'Platform',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description:
                'Platform the user was on, such as Web, iOS or Android.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'os',
            label: 'OS',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: "Operating system and version of the user's device.",
            groups: ['User properties'],
        }),
        dimension({
            name: 'device_type',
            label: 'Device type',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Device model, such as Apple iPhone.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'language',
            label: 'Language',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: "Language the user's device or browser is set to.",
            groups: ['User properties'],
        }),
        dimension({
            name: 'version',
            label: 'App version',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Version of the app the user was on.',
            groups: ['User properties'],
        }),
    ],
    metrics: [
        metric({
            name: 'active_users',
            label: 'Active users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Number of distinct users who triggered at least one active event in the period.',
            aiHint: 'Not additive: never sum rows; choose a coarser date grain instead.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'new_users',
            label: 'New users',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of users whose first event in the project was in the period.',
            aggregation: ADDITIVE,
        }),
    ],
};

// Funnels (/api/2/funnels). Amplitude computes each step's users and
// conversion; nothing is summed here.
export const AMPLITUDE_FUNNEL_EXPLORE: LiveExploreDefinition = {
    name: 'funnel',
    label: 'Funnel',
    description:
        'A conversion funnel in one Amplitude project: how many users did each step, in order, and how many converted from one step to the next.',
    aiHint: "Required: filter Step event (equals) to 2-10 event names, in step order; the first value is the first step. Event names are listed by the Events explore's Event field. Group by Step number and Step event, not by date; Date and Conversion window (days) are filter-only. Date filters who entered the funnel (default last 30 days); the conversion window defaults to 30 days. User properties filter who enters the funnel. Amplitude groups by one user property at a time: pick at most one of Country, Region, City, Platform, OS, Device type, Language, App version as a dimension. Users and the rates are per step; never sum them across steps.",
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: AMPLITUDE_DATE_FILTERS,
            description:
                'Day a user entered the funnel, in the project time zone.',
            aiHint: 'Filter only, never select it. Without a filter, users who entered in the last 30 days.',
        }),
        dimension({
            name: 'step_number',
            label: 'Step number',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'Position of the step in the funnel, starting at 1.',
        }),
        dimension({
            name: 'step_event',
            label: 'Step event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description: 'Event that makes up the step.',
            aiHint: 'Required filter: list the funnel steps in order, 2 to 10 event names; the first value is step 1.',
        }),
        dimension({
            name: 'conversion_window_days',
            label: 'Conversion window (days)',
            type: DimensionType.NUMBER,
            filterOperators: AMPLITUDE_NUMBER_FILTERS,
            description:
                'Number of days a user has to complete the funnel after the first step. Defaults to 30.',
            aiHint: 'Filter only (equals); never select it.',
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description:
                'Country of the user, as Amplitude resolves it from location data.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'region',
            label: 'Region',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Region or state of the user.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'city',
            label: 'City',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'City of the user.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'platform',
            label: 'Platform',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description:
                'Platform the user was on, such as Web, iOS or Android.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'os',
            label: 'OS',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: "Operating system and version of the user's device.",
            groups: ['User properties'],
        }),
        dimension({
            name: 'device_type',
            label: 'Device type',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Device model, such as Apple iPhone.',
            groups: ['User properties'],
        }),
        dimension({
            name: 'language',
            label: 'Language',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: "Language the user's device or browser is set to.",
            groups: ['User properties'],
        }),
        dimension({
            name: 'version',
            label: 'App version',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_PROPERTY_FILTERS,
            description: 'Version of the app the user was on.',
            groups: ['User properties'],
        }),
    ],
    metrics: [
        metric({
            name: 'users',
            label: 'Users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Number of users who reached the step after doing every earlier step in order.',
            aiHint: 'Not additive across steps.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'conversion_rate',
            label: 'Conversion from first step',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Users at the step as a share of users at the first step.',
            aiHint: 'Not additive.',
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'step_conversion_rate',
            label: 'Conversion from previous step',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Users at the step as a share of users at the previous step.',
            aiHint: 'Not additive.',
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'average_time_to_convert_seconds',
            label: 'Average time to step (seconds)',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average time, in seconds, from the previous step to this one, for users who reached it.',
            aiHint: 'Not additive. Empty or 0 for step 1.',
            format: '#,##0',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

// Retention (/api/2/retention). Amplitude counts each cohort's returning
// users per period after it started; nothing is summed here.
export const AMPLITUDE_RETENTION_EXPLORE: LiveExploreDefinition = {
    name: 'retention',
    label: 'Retention',
    description:
        'Retention in one Amplitude project: of the users who started in each cohort, how many came back on each later day, week or month.',
    aiHint: 'Required: select exactly one of Days after start, Weeks after start or Months after start; it sets the retention grain. To split by cohort, add the cohort date at the same grain (Cohort with Days, Cohort week with Weeks, Cohort month with Months). Without a Cohort filter the query reads the last 30 days. Start event and Return event are filter-only, one event name each; by default the cohort is new users and any active event counts as a return. Rates and user counts are not additive across periods.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'cohort', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'cohort',
            apiName: 'date',
            label: 'Cohort',
            type: DimensionType.DATE,
            filterOperators: AMPLITUDE_DATE_FILTERS,
            description:
                'Day the users in the cohort did the start event, in the project time zone.',
            aiHint: 'Without a cohort filter the query reads the last 30 days. Use with Days after start.',
            timeInterval: { base: 'cohort', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'cohort_week',
            apiName: 'week',
            label: 'Cohort week',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Week the users in the cohort did the start event, shown as its first day in the project time zone.',
            aiHint: 'Filter Cohort, not this field, to choose the weeks. Use only with Weeks after start.',
            timeInterval: { base: 'cohort', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'cohort_month',
            apiName: 'month',
            label: 'Cohort month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month the users in the cohort did the start event, shown as its first day in the project time zone.',
            aiHint: 'Filter Cohort, not this field, to choose the months. Use only with Months after start.',
            timeInterval: { base: 'cohort', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'days_after',
            apiName: 'period',
            label: 'Days after start',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'Days since the start event; 0 is the day of the start event itself.',
            aiHint: 'Select exactly one of Days/Weeks/Months after start; the cohort grain must match.',
            groups: ['Retention period'],
        }),
        dimension({
            name: 'weeks_after',
            apiName: 'period',
            label: 'Weeks after start',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'Weeks since the start event; 0 is the week of the start event itself.',
            aiHint: 'Select exactly one of Days/Weeks/Months after start; the cohort grain must match.',
            groups: ['Retention period'],
        }),
        dimension({
            name: 'months_after',
            apiName: 'period',
            label: 'Months after start',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'Months since the start event; 0 is the month of the start event itself.',
            aiHint: 'Select exactly one of Days/Weeks/Months after start; the cohort grain must match.',
            groups: ['Retention period'],
        }),
        dimension({
            name: 'start_event',
            label: 'Start event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description:
                'Event that puts a user into a cohort. Defaults to new users.',
            aiHint: 'Filter only, one event name (equals); never select it.',
        }),
        dimension({
            name: 'return_event',
            label: 'Return event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description:
                'Event that counts as coming back. Defaults to any active event.',
            aiHint: 'Filter only, one event name (equals); never select it.',
        }),
    ],
    metrics: [
        metric({
            name: 'retained_users',
            label: 'Retained users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Number of users in the cohort who did the return event in the period.',
            aiHint: 'Not additive across periods.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'cohort_users',
            label: 'Cohort users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Number of users in the cohort who could have come back in the period.',
            aiHint: 'Not additive across periods.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'retention_rate',
            label: 'Retention rate',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Retained users as a share of cohort users.',
            aiHint: 'Not additive.',
            format: '0.00%',
            aggregation: ratio('retained_users', 'cohort_users'),
        }),
    ],
};

// Sessions (/api/2/sessions/average and /api/2/sessions/peruser), per day.
export const AMPLITUDE_SESSIONS_EXPLORE: LiveExploreDefinition = {
    name: 'sessions',
    label: 'Sessions',
    description:
        'Average session length and sessions per active user in one Amplitude project, per day.',
    aiHint: 'Daily grain only. Without a Date filter the query reads the last 30 days. Both metrics are daily averages: never sum them across days, and averaging days gives an unweighted average.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: AMPLITUDE_DATE_FILTERS,
            description: 'Day of the sessions, in the project time zone.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
    ],
    metrics: [
        metric({
            name: 'average_session_length_seconds',
            label: 'Average session length (seconds)',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: "Average length of the day's sessions, in seconds.",
            aiHint: 'Not additive across days.',
            format: '#,##0',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'sessions_per_user',
            label: 'Sessions per user',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average number of sessions per active user in the day.',
            aiHint: 'Not additive across days.',
            format: '0.00',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

export const AMPLITUDE_EXPLORES = [
    AMPLITUDE_EVENTS_EXPLORE,
    AMPLITUDE_USERS_EXPLORE,
    AMPLITUDE_FUNNEL_EXPLORE,
    AMPLITUDE_RETENTION_EXPLORE,
    AMPLITUDE_SESSIONS_EXPLORE,
] as const;

export const amplitudeModel: LiveModel<ApiConnectorType.AMPLITUDE> = {
    explores: AMPLITUDE_EXPLORES,
    plannedNames: [
        'lifecycle',
        'stickiness',
        'revenue',
        'composition',
        'cohorts',
    ],
};
