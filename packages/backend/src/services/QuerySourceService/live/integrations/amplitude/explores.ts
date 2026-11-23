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
    country: ['Country', 'Country of the user, as Amplitude resolves it.'],
    region: ['Region', 'Region or state of the user.'],
    city: ['City', 'City of the user.'],
    platform: ['Platform', 'Platform, such as Web, iOS or Android.'],
    os: ['OS', 'Operating system and version.'],
    device_type: ['Device type', 'Device type, such as Apple iPhone.'],
    language: ['Language', 'Language the device or browser is set to.'],
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
                description: `Day of the ${what}, in the project time zone. Queries without a date filter read the last 30 days.`,
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
            description: `First day of the ${grain}, as Amplitude starts it, in the project time zone. Filter the date to choose the ${grain}s.`,
        };
    });

const metric = (
    name: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    format?: string,
): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type,
    filterOperators: [],
    aggregation,
    ...(format ? { format } : {}),
});

// Event segmentation (/api/2/events/segmentation). Totals add up across days
// and property values; uniques count each user once per row, so they don't.
export const AMPLITUDE_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        'Event counts and unique users per event for one Amplitude project, by day, week or month and one built-in user property. Filter Event to choose the events; without it, every event counts.',
    dimensions: [
        ...dateDimensions('events', ['date', 'week', 'month']),
        {
            name: 'event_type',
            apiName: 'event_type',
            label: 'Event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description:
                'Name of the event, as tracked. Filter it to choose up to 10 events; without a filter, the row counts every event.',
        },
        ...userProperties(AMPLITUDE_PROPERTY_FILTERS),
    ],
    metrics: [
        metric(
            'event_count',
            'Event count',
            MetricType.SUM,
            ADDITIVE,
            'Times the event was triggered (Amplitude "totals").',
        ),
        metric(
            'unique_users',
            'Unique users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users who triggered the event at least once in the period (Amplitude "uniques"). Never add rows together: choose a coarser date grain instead.',
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
            'Average times each user triggered the event in the period (Amplitude "average").',
            '0.00',
        ),
        metric(
            'percent_of_active_users',
            'Share of active users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Unique users of the event divided by all active users in the period (Amplitude "% DAU").',
            '0.00%',
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
        'Active and new users for one Amplitude project, by day, week or month and one built-in user property.',
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
            'Users who triggered at least one active event in the period. Never add rows together: choose a coarser date grain instead.',
        ),
        metric(
            'new_users',
            'New users',
            MetricType.SUM,
            ADDITIVE,
            'Users whose first event was in the period.',
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
        'A funnel Amplitude computes over the date range: users who did each step in order, and how many converted. Filter Step event to the steps in order, from 2 to 10 events. User properties filter who enters the funnel.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: AMPLITUDE_DATE_FILTERS,
            description:
                'Filter only: users who entered the funnel in this range. Without a filter, the last 30 days.',
        },
        {
            name: 'step_number',
            apiName: 'step_number',
            label: 'Step number',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'Position of the step in the funnel, from 1.',
        },
        {
            name: 'step_event',
            apiName: 'step_event',
            label: 'Step event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description:
                'Event of the step. Filter it to the funnel steps, in order: the first value is the first step.',
        },
        {
            name: 'conversion_window_days',
            apiName: 'conversion_window_days',
            label: 'Conversion window (days)',
            type: DimensionType.NUMBER,
            filterOperators: AMPLITUDE_NUMBER_FILTERS,
            description:
                'Filter only: days a user has to finish the funnel after its first step. Defaults to 30.',
        },
        ...userProperties(AMPLITUDE_PROPERTY_FILTERS),
    ],
    metrics: [
        metric(
            'users',
            'Users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users who reached the step, having done every step before it in order.',
        ),
        metric(
            'conversion_rate',
            'Conversion from first step',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users at the step divided by users at the first step.',
            '0.00%',
        ),
        metric(
            'step_conversion_rate',
            'Conversion from previous step',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users at the step divided by users at the step before.',
            '0.00%',
        ),
        metric(
            'average_time_to_convert_seconds',
            'Average time to step (seconds)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average seconds from the previous step to this one, for users who reached it.',
            '#,##0',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

// Retention (/api/2/retention). Amplitude counts each cohort's returning
// users per period after it started; nothing is summed here.
export const AMPLITUDE_RETENTION_EXPLORE: LiveExploreDefinition = {
    name: 'retention',
    label: 'Retention',
    description:
        'Retention Amplitude computes: of the users who did the start event in each cohort, how many did the return event in each later day, week or month. Without filters, new users who came back with any active event.',
    dimensions: [
        ...dateDimensions('cohort start', ['date', 'week', 'month']).map(
            (dimension) => ({
                ...dimension,
                label: dimension.label.replace('Date', 'Cohort'),
                name: dimension.name.replace('date', 'cohort'),
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
                description: `${unit[0].toUpperCase()}${unit.slice(1)}s after the start event; 0 is the ${unit} of the start event itself. Pick one: it sets the retention grain, and a cohort grain must match it.`,
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
                'Filter only: the event that puts a user in a cohort. Defaults to new users.',
        },
        {
            name: 'return_event',
            apiName: 'return_event',
            label: 'Return event',
            type: DimensionType.STRING,
            filterOperators: AMPLITUDE_EVENT_FILTERS,
            description:
                'Filter only: the event that counts as coming back. Defaults to any active event.',
        },
    ],
    metrics: [
        metric(
            'retained_users',
            'Retained users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users of the cohort who did the return event in the period.',
        ),
        metric(
            'cohort_users',
            'Cohort users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users in the cohort who could have come back in the period.',
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
            'Retained users divided by cohort users.',
            '0.00%',
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
        'Average session length and sessions per active user, per day, for one Amplitude project.',
    dimensions: dateDimensions('sessions', ['date']),
    metrics: [
        metric(
            'average_session_length_seconds',
            'Average session length (seconds)',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average length of the day’s sessions, in seconds.',
            '#,##0',
        ),
        metric(
            'sessions_per_user',
            'Sessions per user',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average sessions per active user in the day.',
            '0.00',
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
