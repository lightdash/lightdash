import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

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

/**
 * Amplitude's built-in user properties, which every project has. Custom
 * properties (`gp:` names) differ per project and are not offered yet.
 */
export const AMPLITUDE_USER_PROPERTIES = [
    'country',
    'region',
    'city',
    'platform',
    'os',
    'device_type',
    'language',
    'version',
] as const;
export type AmplitudeUserProperty = (typeof AMPLITUDE_USER_PROPERTIES)[number];

const PROPERTY_DESCRIPTIONS: Record<AmplitudeUserProperty, [string, string]> = {
    country: [
        'Country',
        'Country of the user, as Amplitude resolves it from location data.',
    ],
    region: ['Region', 'Region or state of the user.'],
    city: ['City', 'City of the user.'],
    platform: [
        'Platform',
        'Platform the user was on, such as Web, iOS or Android.',
    ],
    os: ['OS', "Operating system and version of the user's device."],
    device_type: ['Device type', 'Device model, such as Apple iPhone.'],
    language: ['Language', "Language the user's device or browser is set to."],
    version: ['App version', 'Version of the app the user was on.'],
};

/** Dimensions that group by one user property; Amplitude groups by one at a time. */
export const isAmplitudeUserProperty = (
    apiName: string,
): apiName is AmplitudeUserProperty =>
    (AMPLITUDE_USER_PROPERTIES as readonly string[]).includes(apiName);

/** Day, week and month as Amplitude's `i` interval. */
export const AMPLITUDE_INTERVALS = { date: 1, week: 7, month: 30 } as const;

const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const userProperties = (
    filterOperators: FilterOperator[],
): LiveDimensionDefinition[] =>
    AMPLITUDE_USER_PROPERTIES.map((property) => ({
        name: property,
        apiName: property,
        label: PROPERTY_DESCRIPTIONS[property][0],
        description: PROPERTY_DESCRIPTIONS[property][1],
        type: DimensionType.STRING,
        filterOperators,
        groups: ['User properties'],
    }));

const dateDimensions = (
    what: string,
    grains: ('date' | 'week' | 'month')[],
): LiveDimensionDefinition[] =>
    grains.map((grain) => {
        if (grain === 'date') {
            return {
                name: 'date',
                apiName: 'date',
                label: 'Date',
                type: DimensionType.DATE,
                filterOperators: AMPLITUDE_DATE_FILTERS,
                timeInterval: { base: 'date', grain: TimeFrames.DAY },
                description: `Day of the ${what}, in the project time zone.`,
                aiHint: 'Without a date filter the query reads the last 30 days.',
            };
        }
        return {
            name: `date_${grain}`,
            apiName: grain,
            label: `Date ${grain}`,
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: {
                base: 'date',
                grain: grain === 'week' ? TimeFrames.WEEK : TimeFrames.MONTH,
            },
            description:
                grain === 'week'
                    ? "Week of the activity, shown as its first day in the project time zone. Weeks start on the day Amplitude's project settings use."
                    : 'Month of the activity, shown as its first day in the project time zone.',
            aiHint: `Filter Date, not this field, to choose the ${grain}s. Amplitude groups the ${grain}s itself (interval ${AMPLITUDE_INTERVALS[grain]}).`,
        };
    });

const metric = (
    name: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    { format, aiHint }: { format?: string; aiHint?: string } = {},
): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type,
    filterOperators: [],
    aggregation,
    ...(format ? { format } : {}),
    ...(aiHint ? { aiHint } : {}),
});

// Event segmentation (/api/2/events/segmentation). Totals add up across days
// and property values; uniques count each user once per row, so they don't.
export const AMPLITUDE_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        'Event counts and unique users per event in one Amplitude project, by day, week or month.',
    aiHint: 'Without a Date filter the query reads the last 30 days. Filter Event (equals) to choose up to 10 events; without it every event is counted together in one row per period. Amplitude groups by one user property at a time: pick at most one of Country, Region, City, Platform, OS, Device type, Language, App version as a dimension. Unique users, Events per user and Share of active users are not additive: never sum rows across dates; query a coarser date grain instead.',
    dimensions: [
        ...dateDimensions('events', ['date', 'week', 'month']),
        {
            name: 'event_type',
            apiName: 'event_type',
            label: 'Event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description: 'Name of the event, as tracked in Amplitude.',
            aiHint: 'Filter it (equals) to choose up to 10 events. Without a filter the row counts every event together, not per event.',
        },
        ...userProperties(AMPLITUDE_PROPERTY_FILTERS),
    ],
    metrics: [
        metric(
            'event_count',
            'Event count',
            MetricType.SUM,
            ADDITIVE,
            'Number of times the event was triggered (Amplitude\'s "totals").',
        ),
        metric(
            'unique_users',
            'Unique users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Number of distinct users who triggered the event at least once in the period (Amplitude\'s "uniques").',
            {
                aiHint: 'Not additive: never sum rows across dates or properties; choose a coarser date grain instead.',
            },
        ),
        metric(
            'events_per_user',
            'Events per user',
            MetricType.NUMBER,
            {
                aggregation: 'ratio',
                numerator: 'event_count',
                denominator: 'unique_users',
            },
            'Average number of times each user triggered the event in the period (Amplitude\'s "average").',
            {
                format: '0.00',
                aiHint: 'Not additive; never sum or average rows.',
            },
        ),
        metric(
            'percent_of_active_users',
            'Share of active users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users who triggered the event as a share of all active users in the period (Amplitude\'s "% DAU").',
            {
                format: '0.00%',
                aiHint: 'Not additive; never sum or average rows.',
            },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

// Active and new users (/api/2/users). A user is new once, so new users add
// up; active users are counted once per period and don't.
export const AMPLITUDE_USERS_EXPLORE: LiveExploreDefinition = {
    name: 'users',
    label: 'Active users',
    description:
        'Active and new users in one Amplitude project, by day, week or month.',
    aiHint: 'Without a Date filter the query reads the last 30 days. Amplitude groups by one user property at a time: pick at most one of Country, Region, City, Platform, OS, Device type, Language, App version as a dimension. Active users is not additive across dates: never sum days into a week or month; use the week or month dimension instead. New users is additive.',
    dimensions: [
        ...dateDimensions('activity', ['date', 'week', 'month']),
        ...userProperties(AMPLITUDE_PROPERTY_FILTERS),
    ],
    metrics: [
        metric(
            'active_users',
            'Active users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Number of distinct users who triggered at least one active event in the period.',
            {
                aiHint: 'Not additive: never sum rows; choose a coarser date grain instead.',
            },
        ),
        metric(
            'new_users',
            'New users',
            MetricType.SUM,
            ADDITIVE,
            'Number of users whose first event in the project was in the period.',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

// Funnels (/api/2/funnels). Amplitude computes each step's users and
// conversion; nothing is summed here.
export const AMPLITUDE_FUNNEL_EXPLORE: LiveExploreDefinition = {
    name: 'funnel',
    label: 'Funnel',
    description:
        'A conversion funnel in one Amplitude project: how many users did each step, in order, and how many converted from one step to the next.',
    aiHint: "Required: filter Step event (equals) to 2-10 event names, in step order; the first value is the first step. Event names are listed by the Events explore's Event field. Group by Step number and Step event, not by date; Date and Conversion window (days) are filter-only. Date filters who entered the funnel (default last 30 days); the conversion window defaults to 30 days. User properties filter who enters the funnel. Amplitude groups by one user property at a time: pick at most one of Country, Region, City, Platform, OS, Device type, Language, App version as a dimension. Users and the rates are per step; never sum them across steps.",
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: AMPLITUDE_DATE_FILTERS,
            description:
                'Day a user entered the funnel, in the project time zone.',
            aiHint: 'Filter only, never select it. Without a filter, users who entered in the last 30 days.',
        },
        {
            name: 'step_number',
            apiName: 'step_number',
            label: 'Step number',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'Position of the step in the funnel, starting at 1.',
        },
        {
            name: 'step_event',
            apiName: 'step_event',
            label: 'Step event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description: 'Event that makes up the step.',
            aiHint: 'Required filter: list the funnel steps in order, 2 to 10 event names; the first value is step 1.',
        },
        {
            name: 'conversion_window_days',
            apiName: 'conversion_window_days',
            label: 'Conversion window (days)',
            type: DimensionType.NUMBER,
            filterOperators: AMPLITUDE_NUMBER_FILTERS,
            description:
                'Number of days a user has to complete the funnel after the first step. Defaults to 30.',
            aiHint: 'Filter only (equals); never select it.',
        },
        ...userProperties(AMPLITUDE_PROPERTY_FILTERS),
    ],
    metrics: [
        metric(
            'users',
            'Users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Number of users who reached the step after doing every earlier step in order.',
            { aiHint: 'Not additive across steps.' },
        ),
        metric(
            'conversion_rate',
            'Conversion from first step',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users at the step as a share of users at the first step.',
            { format: '0.00%', aiHint: 'Not additive.' },
        ),
        metric(
            'step_conversion_rate',
            'Conversion from previous step',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users at the step as a share of users at the previous step.',
            { format: '0.00%', aiHint: 'Not additive.' },
        ),
        metric(
            'average_time_to_convert_seconds',
            'Average time to step (seconds)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average time, in seconds, from the previous step to this one, for users who reached it.',
            { format: '#,##0', aiHint: 'Not additive. Empty or 0 for step 1.' },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

const COHORT_TEXTS: Record<
    string,
    Pick<LiveDimensionDefinition, 'description' | 'aiHint'>
> = {
    date: {
        description:
            'Day the users in the cohort did the start event, in the project time zone.',
        aiHint: 'Without a cohort filter the query reads the last 30 days. Use with Days after start.',
    },
    date_week: {
        description:
            'Week the users in the cohort did the start event, shown as its first day in the project time zone.',
        aiHint: 'Filter Cohort, not this field, to choose the weeks. Use only with Weeks after start.',
    },
    date_month: {
        description:
            'Month the users in the cohort did the start event, shown as its first day in the project time zone.',
        aiHint: 'Filter Cohort, not this field, to choose the months. Use only with Months after start.',
    },
};

// Retention (/api/2/retention). Amplitude counts each cohort's returning
// users per period after it started; nothing is summed here.
export const AMPLITUDE_RETENTION_EXPLORE: LiveExploreDefinition = {
    name: 'retention',
    label: 'Retention',
    description:
        'Retention in one Amplitude project: of the users who started in each cohort, how many came back on each later day, week or month.',
    aiHint: 'Required: select exactly one of Days after start, Weeks after start or Months after start; it sets the retention grain. To split by cohort, add the cohort date at the same grain (Cohort with Days, Cohort week with Weeks, Cohort month with Months). Without a Cohort filter the query reads the last 30 days. Start event and Return event are filter-only, one event name each; by default the cohort is new users and any active event counts as a return. Rates and user counts are not additive across periods.',
    dimensions: [
        ...dateDimensions('cohort start', ['date', 'week', 'month']).map(
            (dimension) => ({
                ...dimension,
                label: dimension.label.replace('Date', 'Cohort'),
                name: dimension.name.replace('date', 'cohort'),
                ...COHORT_TEXTS[dimension.name],
                ...(dimension.timeInterval
                    ? {
                          timeInterval: {
                              ...dimension.timeInterval,
                              base: 'cohort',
                          },
                      }
                    : {}),
            }),
        ),
        ...(['day', 'week', 'month'] as const).map(
            (unit): LiveDimensionDefinition => ({
                name: `${unit}s_after`,
                apiName: 'period',
                label: `${unit[0].toUpperCase()}${unit.slice(1)}s after start`,
                type: DimensionType.NUMBER,
                filterOperators: [],
                description: `${unit[0].toUpperCase()}${unit.slice(1)}s since the start event; 0 is the ${unit} of the start event itself.`,
                aiHint: 'Select exactly one of Days/Weeks/Months after start; the cohort grain must match.',
                groups: ['Retention period'],
            }),
        ),
        {
            name: 'start_event',
            apiName: 'start_event',
            label: 'Start event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description:
                'Event that puts a user into a cohort. Defaults to new users.',
            aiHint: 'Filter only, one event name (equals); never select it.',
        },
        {
            name: 'return_event',
            apiName: 'return_event',
            label: 'Return event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description:
                'Event that counts as coming back. Defaults to any active event.',
            aiHint: 'Filter only, one event name (equals); never select it.',
        },
    ],
    metrics: [
        metric(
            'retained_users',
            'Retained users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Number of users in the cohort who did the return event in the period.',
            { aiHint: 'Not additive across periods.' },
        ),
        metric(
            'cohort_users',
            'Cohort users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Number of users in the cohort who could have come back in the period.',
            { aiHint: 'Not additive across periods.' },
        ),
        metric(
            'retention_rate',
            'Retention rate',
            MetricType.NUMBER,
            {
                aggregation: 'ratio',
                numerator: 'retained_users',
                denominator: 'cohort_users',
            },
            'Retained users as a share of cohort users.',
            { format: '0.00%', aiHint: 'Not additive.' },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'cohort', defaultDays: 30 },
    incompatible: [],
};

// Sessions (/api/2/sessions/average and /api/2/sessions/peruser), per day.
export const AMPLITUDE_SESSIONS_EXPLORE: LiveExploreDefinition = {
    name: 'sessions',
    label: 'Sessions',
    description:
        'Average session length and sessions per active user in one Amplitude project, per day.',
    aiHint: 'Daily grain only. Without a Date filter the query reads the last 30 days. Both metrics are daily averages: never sum them across days, and averaging days gives an unweighted average.',
    dimensions: dateDimensions('sessions', ['date']),
    metrics: [
        metric(
            'average_session_length_seconds',
            'Average session length (seconds)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            "Average length of the day's sessions, in seconds.",
            { format: '#,##0', aiHint: 'Not additive across days.' },
        ),
        metric(
            'sessions_per_user',
            'Sessions per user',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average number of sessions per active user in the day.',
            { format: '0.00', aiHint: 'Not additive across days.' },
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

export const AMPLITUDE_EXPLORES = [
    AMPLITUDE_EVENTS_EXPLORE,
    AMPLITUDE_USERS_EXPLORE,
    AMPLITUDE_FUNNEL_EXPLORE,
    AMPLITUDE_RETENTION_EXPLORE,
    AMPLITUDE_SESSIONS_EXPLORE,
] as const;
