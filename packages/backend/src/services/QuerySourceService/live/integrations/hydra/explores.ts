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

/** Each report filter takes a list of values to keep or drop. */
export const HYDRA_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const HYDRA_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
];

const text = (
    name: string,
    label: string,
    description: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type: DimensionType.STRING,
    filterOperators: HYDRA_STRING_FILTERS,
});

// Reports can't filter on totals
const metric = (
    name: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    description: string,
    aiHint?: string,
): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators: [],
    aggregation,
});

const grain = (
    name: string,
    label: string,
    timeGrain: TimeFrames,
    description: string,
    aiHint: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    aiHint,
    type: DimensionType.DATE,
    filterOperators: [],
    timeInterval: { base: 'date', grain: timeGrain },
});

export const HYDRA_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        "Sample product events (page views, sign-ups, adds to cart and purchases) over the last 90 days, from Lightdash's Hydra test integration. Dates are in UTC.",
    aiHint: 'Seeded test data. Without a Date filter the query reads the last 30 days. Unique users is a distinct count: summing rows counts a user once per row. Joins Users on User, Plan or Country.',
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            description: 'Day of the event, in UTC.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            type: DimensionType.DATE,
            filterOperators: HYDRA_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        },
        grain(
            'date_week',
            'Date week',
            TimeFrames.WEEK,
            'Week of the event, shown as its Monday, in UTC.',
            'Filter Date, not this field, to choose the weeks.',
        ),
        grain(
            'date_month',
            'Date month',
            TimeFrames.MONTH,
            'Month of the event, shown as its first day, in UTC.',
            'Filter Date, not this field, to choose the months.',
        ),
        text(
            'event_type',
            'Event type',
            'Type of event: page_view, sign_up, add_to_cart or purchase.',
        ),
        text('user_id', 'User', 'User who sent the event.'),
        text('country', 'Country', "Two-letter code of the user's country."),
        text('plan', 'Plan', "User's plan: free, pro or enterprise."),
    ],
    metrics: [
        metric(
            'event_count',
            'Events',
            MetricType.COUNT,
            { aggregation: 'additive' },
            'Number of events.',
        ),
        metric(
            'revenue',
            'Revenue',
            MetricType.SUM,
            { aggregation: 'additive' },
            'Revenue from purchases, in US dollars.',
        ),
        metric(
            'unique_users',
            'Unique users',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            'Number of distinct users with at least one event.',
            'Distinct count: summing rows counts a user once per row.',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

export const HYDRA_USERS_EXPLORE: LiveExploreDefinition = {
    name: 'users',
    label: 'Users',
    description:
        "Sample users with their plan, country, sign-up date and seats, from Lightdash's Hydra test integration.",
    aiHint: 'Seeded test data. Joins Events on User, Plan or Country.',
    dimensions: [
        text('user_id', 'User', 'User ID, as events name it.'),
        text('plan', 'Plan', "User's plan: free, pro or enterprise."),
        text('country', 'Country', "Two-letter code of the user's country."),
        {
            name: 'signup_date',
            apiName: 'signup_date',
            label: 'Sign-up date',
            description: 'Day the user signed up, in UTC.',
            type: DimensionType.DATE,
            filterOperators: [],
        },
    ],
    metrics: [
        metric(
            'user_count',
            'Users',
            MetricType.COUNT,
            { aggregation: 'additive' },
            'Number of users.',
        ),
        metric(
            'seats',
            'Seats',
            MetricType.SUM,
            { aggregation: 'additive' },
            'Number of seats the users pay for.',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};
