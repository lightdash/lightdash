import { DimensionType, MetricType, TimeFrames } from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    ratio,
} from '../../explores/declare';
import type { LiveExploreDefinition } from '../../explores/definition';
import { MIXPANEL_MAX_RETENTION_PERIODS } from './api';
import {
    MIXPANEL_DATE_FILTERS,
    MIXPANEL_EVENT_FILTERS,
    MIXPANEL_NUMBER_FILTERS,
    MIXPANEL_PROPERTY_FILTERS,
} from './filters';

// Today's top events (/api/query/events/top), as Mixpanel ranks them.
export const MIXPANEL_TOP_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'top_events',
    label: 'Top events today',
    description:
        "Today's most common events in one Mixpanel project, with their count so far and the change from yesterday.",
    aiHint: 'Always reads today in the project time zone and takes no filters; for other days use the Events explore.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'event',
            label: 'Event',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Name of the event, as tracked in Mixpanel.',
        }),
    ],
    metrics: [
        metric({
            name: 'event_count',
            label: 'Event count today',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times the event was triggered today so far.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'percent_change',
            label: 'Change from yesterday',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                "Change from yesterday's count, as Mixpanel normalizes it.",
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

// Segmentation (/api/query/segmentation): one event per call, counted per day
// or month and split by one property. Totals add up across days and
// property values; uniques count each user once per row, so they don't.
export const MIXPANEL_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        'Event counts and unique users per event in one Mixpanel project, by day or month and one event property.',
    aiHint: 'Required: filter Event (equals) to 1 to 3 event names; Mixpanel reads one event per call. Event names are case-sensitive and must match Mixpanel exactly, often Title Case with spaces ("Signed Up", not signed_up or sign_up). Field value search cannot list them: query Top events today for the exact names of events fired today, and otherwise ask the user rather than guessing. Mixpanel returns zeros, not an error, for a name that does not exist, so if every date is 0 check the name before saying there is no data. Without a Date filter the query reads the last 30 days. Group by at most one event property (Country, Region, City, Browser, OS, Device, Library, Referring domain, UTM source, UTM medium, UTM campaign); split by a property, values with no events on a date are left out. Unique users and Events per user are not additive: never sum rows across dates or properties; query a coarser date grain or no date instead.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: MIXPANEL_DATE_FILTERS,
            description: 'Day of the event, in the project time zone.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_month',
            apiName: 'month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description:
                'Month of the event, shown as its first day in the project time zone.',
            aiHint: 'Filter Date, not this field, to choose the months. Mixpanel groups the months itself.',
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'event',
            label: 'Event',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_EVENT_FILTERS,
            description: 'Name of the event, as tracked in Mixpanel.',
            aiHint: 'Required: filter it (equals) to the events to count, 1 to 3 names. Event names are case-sensitive and must match Mixpanel exactly, often Title Case with spaces ("Signed Up", not signed_up or sign_up). Field value search cannot list them: query Top events today for the exact names of events fired today, and otherwise ask the user rather than guessing. Mixpanel returns zeros, not an error, for a name that does not exist, so if every date is 0 check the name before saying there is no data.',
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description:
                'Country code of the user, as Mixpanel resolves it from the IP address.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'region',
            label: 'Region',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'Region or state of the user.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'city',
            label: 'City',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'City of the user.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'browser',
            label: 'Browser',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'Browser, such as Chrome or Safari.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'os',
            label: 'OS',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'Operating system, such as Mac OS X, iOS or Android.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'device',
            label: 'Device',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'Device, such as iPhone or Android.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'library',
            label: 'Library',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description:
                'Mixpanel library that sent the event, such as web, iphone or python.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'referring_domain',
            label: 'Referring domain',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'Domain of the page that linked to the current page.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'utm_source',
            label: 'UTM source',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'utm_source of the URL the user landed on.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'utm_medium',
            label: 'UTM medium',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'utm_medium of the URL the user landed on.',
            groups: ['Event properties'],
        }),
        dimension({
            name: 'utm_campaign',
            label: 'UTM campaign',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_PROPERTY_FILTERS,
            description: 'utm_campaign of the URL the user landed on.',
            groups: ['Event properties'],
        }),
    ],
    metrics: [
        metric({
            name: 'event_count',
            label: 'Event count',
            type: MetricType.SUM,
            filterOperators: [],
            description:
                'Number of times the event was triggered (Mixpanel\'s "general").',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'unique_users',
            label: 'Unique users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Number of distinct users who triggered the event at least once in the period (Mixpanel\'s "unique").',
            aiHint: 'Not additive: never sum rows across dates or property values; choose a coarser date grain instead.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'events_per_user',
            label: 'Events per user',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average number of times each user triggered the event in the period (Mixpanel\'s "average").',
            aiHint: 'Not additive: never sum rows across dates or property values; choose a coarser date grain instead.',
            format: '0.00',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

// Saved funnels (/api/query/funnels). Mixpanel computes each step's users and
// conversion over the date range; nothing is summed here.
export const MIXPANEL_FUNNEL_EXPLORE: LiveExploreDefinition = {
    name: 'funnel',
    label: 'Funnel',
    description:
        'A funnel saved in Mixpanel: users who did each step in order over the date range, and how many converted.',
    aiHint: 'Required: filter Funnel ID (equals) to one saved funnel, the number in the funnel report URL. Group by Step number and Step event, not by date; Date is a filter only, and without it the query reads the last 30 days. Property filters are not supported.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: MIXPANEL_DATE_FILTERS,
            description: 'Day users entered the funnel.',
            aiHint: 'Filter only, never a dimension. Without a filter the query reads the last 30 days.',
        }),
        dimension({
            name: 'funnel_id',
            label: 'Funnel ID',
            type: DimensionType.NUMBER,
            filterOperators: MIXPANEL_NUMBER_FILTERS,
            description:
                'ID of the saved funnel. Its steps and conversion window come from the funnel as saved in Mixpanel.',
            aiHint: 'Filter only (equals, one ID), never a dimension.',
        }),
        dimension({
            name: 'step_number',
            label: 'Step number',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'Position of the step in the funnel, from 1.',
        }),
        dimension({
            name: 'step_event',
            label: 'Step event',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Event or custom event of the step, as labelled.',
        }),
    ],
    metrics: [
        metric({
            name: 'users',
            label: 'Users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Users who reached the step, having done every step before it in order.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'conversion_rate',
            label: 'Conversion from first step',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Users at the step divided by users at the first step.',
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'step_conversion_rate',
            label: 'Conversion from previous step',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Users at the step divided by users at the step before.',
            format: '0.00%',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'average_time_to_convert_seconds',
            label: 'Average time to step (seconds)',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Average seconds from the previous step to this one, for users who reached it.',
            format: '#,##0',
            aggregation: NON_ADDITIVE,
        }),
    ],
};

// Retention (/api/query/retention). Mixpanel counts each cohort's returning
// users per period after it started; nothing is summed here.
export const MIXPANEL_RETENTION_EXPLORE: LiveExploreDefinition = {
    name: 'retention',
    label: 'Retention',
    description:
        'Of the users in each cohort, how many came back in each later day, week or month, as Mixpanel computes it.',
    aiHint: `Required: add one cohort grain (Cohort, Cohort week or Cohort month) and the matching Days, Weeks or Months after start. Filter Start event (equals) to put users in a cohort the first time they did it; without it a cohort is everyone who did the return event that period. Without Return event any event counts as coming back. Without a Cohort filter the query reads the last 30 days. Mixpanel reads at most ${MIXPANEL_MAX_RETENTION_PERIODS.day} days, 52 weeks or 24 months after start.`,
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
            filterOperators: MIXPANEL_DATE_FILTERS,
            description: 'Day the cohort started, in the project time zone.',
            aiHint: 'Filter it to choose the cohorts; without a filter the query reads the last 30 days.',
            timeInterval: { base: 'cohort', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'cohort_week',
            apiName: 'week',
            label: 'Cohort week',
            type: DimensionType.DATE,
            filterOperators: [],
            description: 'Week the cohort started, shown as its first day.',
            aiHint: 'Filter Cohort, not this field, to choose the cohorts. Mixpanel starts each week itself.',
            timeInterval: { base: 'cohort', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'cohort_month',
            apiName: 'month',
            label: 'Cohort month',
            type: DimensionType.DATE,
            filterOperators: [],
            description: 'Month the cohort started, shown as its first day.',
            aiHint: 'Filter Cohort, not this field, to choose the cohorts. Mixpanel starts each month itself.',
            timeInterval: { base: 'cohort', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'days_after',
            apiName: 'period',
            label: 'Days after start',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                "Days after the cohort started; 0 is the cohort's own day, where every user of the cohort counts.",
            aiHint: `Pick it with the Cohort grain. Mixpanel reads at most ${MIXPANEL_MAX_RETENTION_PERIODS.day} days after start.`,
            groups: ['Retention period'],
        }),
        dimension({
            name: 'weeks_after',
            apiName: 'period',
            label: 'Weeks after start',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                "Weeks after the cohort started; 0 is the cohort's own week, where every user of the cohort counts.",
            aiHint: `Pick it with the Cohort week grain. Mixpanel reads at most ${MIXPANEL_MAX_RETENTION_PERIODS.week} weeks after start.`,
            groups: ['Retention period'],
        }),
        dimension({
            name: 'months_after',
            apiName: 'period',
            label: 'Months after start',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                "Months after the cohort started; 0 is the cohort's own month, where every user of the cohort counts.",
            aiHint: `Pick it with the Cohort month grain. Mixpanel reads at most ${MIXPANEL_MAX_RETENTION_PERIODS.month} months after start.`,
            groups: ['Retention period'],
        }),
        dimension({
            name: 'start_event',
            label: 'Start event',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_EVENT_FILTERS,
            description:
                'Event that puts users in a cohort, the first time they do it.',
            aiHint: 'Filter only (equals, one event). Without it a cohort is everyone who did the return event in the period. Event names are case-sensitive and must match Mixpanel exactly, often Title Case with spaces ("Signed Up", not signed_up or sign_up). Field value search cannot list them: query Top events today for the exact names of events fired today, and otherwise ask the user rather than guessing. Mixpanel returns zeros, not an error, for a name that does not exist, so if every date is 0 check the name before saying there is no data.',
        }),
        dimension({
            name: 'return_event',
            label: 'Return event',
            type: DimensionType.STRING,
            filterOperators: MIXPANEL_EVENT_FILTERS,
            description: 'Event that counts as coming back.',
            aiHint: 'Filter only (equals, one event). Without it any event counts. Event names are case-sensitive and must match Mixpanel exactly, often Title Case with spaces ("Signed Up", not signed_up or sign_up). Field value search cannot list them: query Top events today for the exact names of events fired today, and otherwise ask the user rather than guessing. Mixpanel returns zeros, not an error, for a name that does not exist, so if every date is 0 check the name before saying there is no data.',
        }),
    ],
    metrics: [
        metric({
            name: 'retained_users',
            label: 'Retained users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description:
                'Users of the cohort who did the return event in the period.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'cohort_users',
            label: 'Cohort users',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Users in the cohort.',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'retention_rate',
            label: 'Retention rate',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Retained users divided by cohort users.',
            format: '0.00%',
            aggregation: ratio('retained_users', 'cohort_users'),
        }),
    ],
};

export const MIXPANEL_EXPLORES = [
    MIXPANEL_TOP_EVENTS_EXPLORE,
    MIXPANEL_EVENTS_EXPLORE,
    MIXPANEL_FUNNEL_EXPLORE,
    MIXPANEL_RETENTION_EXPLORE,
] as const;
