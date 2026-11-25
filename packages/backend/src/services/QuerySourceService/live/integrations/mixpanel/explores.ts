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

export const MIXPANEL_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
];

/** Property filters, written into Mixpanel's `where` expression. */
export const MIXPANEL_PROPERTY_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

/** An event name, or a saved funnel's id. */
export const MIXPANEL_EVENT_FILTERS = [FilterOperator.EQUALS];

export const MIXPANEL_NUMBER_FILTERS = [FilterOperator.EQUALS];

/**
 * Properties Mixpanel's SDKs set on every event, so every project has them.
 * Custom properties differ per project and are not offered yet.
 */
export const MIXPANEL_PROPERTIES = {
    country: [
        'mp_country_code',
        'Country',
        'Country code of the user, as Mixpanel resolves it from the IP address.',
    ],
    region: ['$region', 'Region', 'Region or state of the user.'],
    city: ['$city', 'City', 'City of the user.'],
    browser: ['$browser', 'Browser', 'Browser, such as Chrome or Safari.'],
    os: ['$os', 'OS', 'Operating system, such as Mac OS X, iOS or Android.'],
    device: ['$device', 'Device', 'Device, such as iPhone or Android.'],
    library: [
        'mp_lib',
        'Library',
        'Mixpanel library that sent the event, such as web, iphone or python.',
    ],
    referring_domain: [
        '$referring_domain',
        'Referring domain',
        'Domain of the page that linked to the current page.',
    ],
    utm_source: [
        'utm_source',
        'UTM source',
        'utm_source of the URL the user landed on.',
    ],
    utm_medium: [
        'utm_medium',
        'UTM medium',
        'utm_medium of the URL the user landed on.',
    ],
    utm_campaign: [
        'utm_campaign',
        'UTM campaign',
        'utm_campaign of the URL the user landed on.',
    ],
} as const satisfies Record<string, readonly [string, string, string]>;
export type MixpanelProperty = keyof typeof MIXPANEL_PROPERTIES;

export const isMixpanelProperty = (
    apiName: string,
): apiName is MixpanelProperty => Object.hasOwn(MIXPANEL_PROPERTIES, apiName);

/** The property's name in Mixpanel, as an expression reads it. */
export const getMixpanelPropertyName = (property: MixpanelProperty) =>
    MIXPANEL_PROPERTIES[property][0];

const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const properties = (): LiveDimensionDefinition[] =>
    (Object.keys(MIXPANEL_PROPERTIES) as MixpanelProperty[]).map(
        (property) => ({
            name: property,
            apiName: property,
            label: MIXPANEL_PROPERTIES[property][1],
            description: MIXPANEL_PROPERTIES[property][2],
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            groups: ['Event properties'],
        }),
    );

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

const dateFilter = (description: string): LiveDimensionDefinition => ({
    name: 'date',
    apiName: 'date',
    label: 'Date',
    type: DimensionType.DATE,
    filterOperators: MIXPANEL_DATE_FILTERS,
    description,
});

// Today's top events (/api/query/events/top), as Mixpanel ranks them.
export const MIXPANEL_TOP_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'top_events',
    label: 'Top events today',
    description:
        "Today's most common events in one Mixpanel project, with their count so far and the change from yesterday. It always reads today, in the project time zone.",
    dimensions: [
        {
            name: 'event',
            apiName: 'event',
            label: 'Event',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Name of the event, as tracked.',
        },
    ],
    metrics: [
        metric(
            'event_count',
            'Event count today',
            MetricType.SUM,
            ADDITIVE,
            'Times the event was triggered today so far.',
        ),
        metric(
            'percent_change',
            'Change from yesterday',
            MetricType.NUMBER,
            NON_ADDITIVE,
            "Mixpanel's normalized change from yesterday's count.",
            '0.00%',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

// Segmentation (/api/query/segmentation): one event per call, counted per day
// or month and split by one property. Totals add up across days and
// property values; uniques count each user once per row, so they don't.
export const MIXPANEL_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        'Event counts and unique users per event for one Mixpanel project, by day or month and one event property. Required: filter Event to the events, up to 3 event names.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: MIXPANEL_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
            description:
                'Day of the event, in the project time zone. Queries without a date filter read the last 30 days.',
        },
        {
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
            description:
                'First day of the month, in the project time zone. Filter the date to choose the months.',
        },
        {
            name: 'event',
            apiName: 'event',
            label: 'Event',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_EVENT_FILTERS,
            description:
                'Name of the event, as tracked. Required: filter it to the events to count, up to 3.',
        },
        ...properties(),
    ],
    metrics: [
        metric(
            'event_count',
            'Event count',
            MetricType.SUM,
            ADDITIVE,
            'Times the event was triggered (Mixpanel "general").',
        ),
        metric(
            'unique_users',
            'Unique users',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Users who triggered the event at least once in the period (Mixpanel "unique"). Never add rows together: choose a coarser date grain instead.',
        ),
        metric(
            'events_per_user',
            'Events per user',
            MetricType.NUMBER,
            NON_ADDITIVE,
            'Average times each user triggered the event in the period (Mixpanel "average").',
            '0.00',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

// Saved funnels (/api/query/funnels). Mixpanel computes each step's users and
// conversion over the date range; nothing is summed here.
export const MIXPANEL_FUNNEL_EXPLORE: LiveExploreDefinition = {
    name: 'funnel',
    label: 'Funnel',
    description:
        'A funnel saved in Mixpanel, computed over the date range: users who did each step in order, and how many converted. Required: filter Funnel ID to one saved funnel (the number in the funnel report URL). Group by Step number and Step event, not by date.',
    dimensions: [
        dateFilter(
            'Filter only: users who entered the funnel in this range. Without a filter, the last 30 days.',
        ),
        {
            name: 'funnel_id',
            apiName: 'funnel_id',
            label: 'Funnel ID',
            type: DimensionType.NUMBER,
            filterOperators: MIXPANEL_NUMBER_FILTERS,
            description:
                'Filter only: the saved funnel to read, by its id. Its steps and conversion window come from the funnel as saved in Mixpanel.',
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
            filterOperators: [],
            description: 'Event or custom event of the step, as labelled.',
        },
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

const RETENTION_GRAINS = [
    ['date', 'cohort', TimeFrames.DAY, 'Cohort', 'day'],
    ['week', 'cohort_week', TimeFrames.WEEK, 'Cohort week', 'week'],
    ['month', 'cohort_month', TimeFrames.MONTH, 'Cohort month', 'month'],
] as const;

// Retention (/api/query/retention). Mixpanel counts each cohort's returning
// users per period after it started; nothing is summed here.
export const MIXPANEL_RETENTION_EXPLORE: LiveExploreDefinition = {
    name: 'retention',
    label: 'Retention',
    description:
        'Retention Mixpanel computes: of the users in each cohort, how many did the return event in each later day, week or month. Required: add one cohort grain (Cohort, Cohort week or Cohort month) and the matching Days, Weeks or Months after start. Filter Start event to put users in a cohort the first time they did it; without it, a cohort is everyone who did the return event that period. Without Return event, any event counts as coming back.',
    dimensions: [
        ...RETENTION_GRAINS.map(
            ([apiName, name, grain, label, unit]): LiveDimensionDefinition => ({
                name,
                apiName,
                label,
                type: DimensionType.DATE,
                filterOperators:
                    apiName === 'date' ? MIXPANEL_DATE_FILTERS : [],
                timeInterval: { base: 'cohort', grain },
                description:
                    apiName === 'date'
                        ? 'Day the cohort started, in the project time zone. Filter it to choose the cohorts; without a filter, the last 30 days.'
                        : `First day of the cohort's ${unit}, as Mixpanel starts it.`,
            }),
        ),
        ...(['day', 'week', 'month'] as const).map(
            (unit): LiveDimensionDefinition => ({
                name: `${unit}s_after`,
                apiName: 'period',
                label: `${unit[0].toUpperCase()}${unit.slice(1)}s after start`,
                type: DimensionType.NUMBER,
                filterOperators: [],
                description: `${unit[0].toUpperCase()}${unit.slice(1)}s after the cohort started; 0 is the cohort's own ${unit}, where every user of the cohort counts. Pick the one matching the cohort grain. Mixpanel reads at most 90 days, 52 weeks or 24 months after start.`,
                groups: ['Retention period'],
            }),
        ),
        {
            name: 'start_event',
            apiName: 'start_event',
            label: 'Start event',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_EVENT_FILTERS,
            description:
                'Filter only: users join a cohort the first time they do this event. Without it, a cohort is everyone who did the return event in the period.',
        },
        {
            name: 'return_event',
            apiName: 'return_event',
            label: 'Return event',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_EVENT_FILTERS,
            description:
                'Filter only: the event that counts as coming back. Defaults to any event.',
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
            'Users in the cohort.',
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

export const MIXPANEL_EXPLORES = [
    MIXPANEL_TOP_EVENTS_EXPLORE,
    MIXPANEL_EVENTS_EXPLORE,
    MIXPANEL_FUNNEL_EXPLORE,
    MIXPANEL_RETENTION_EXPLORE,
] as const;
