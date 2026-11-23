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
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
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
): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type,
    filterOperators: [],
    aggregation,
});

const grain = (
    name: string,
    label: string,
    timeGrain: TimeFrames,
    description: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type: DimensionType.DATE,
    filterOperators: [],
    timeInterval: { base: 'date', grain: timeGrain },
});

export const HYDRA_EVENTS_EXPLORE: LiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        "Hydra's seeded product events: page views, sign-ups, add-to-carts and purchases over the last 90 days, from the test integration. Dates are UTC days; queries read the last 30 days unless the date filter says otherwise.",
    dimensions: [
        {
            name: 'date',
            apiName: 'date',
            label: 'Date',
            description: 'Day of the event, in UTC.',
            type: DimensionType.DATE,
            filterOperators: HYDRA_DATE_FILTERS,
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        },
        grain(
            'date_week',
            'Date week',
            TimeFrames.WEEK,
            'Monday of the week, in UTC. Filter Date to choose the weeks.',
        ),
        grain(
            'date_month',
            'Date month',
            TimeFrames.MONTH,
            'First day of the month, in UTC. Filter Date to choose the months.',
        ),
        text(
            'event_type',
            'Event type',
            'page_view, sign_up, add_to_cart or purchase.',
        ),
        text('user_id', 'User', 'The user who sent the event.'),
        text('country', 'Country', "Two-letter code of the user's country."),
        text('plan', 'Plan', "The user's plan: free, pro or enterprise."),
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
            'Users with at least one event; summed rows count a user once per row.',
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
        "Hydra's seeded users with their plan, country and seats, from the test integration. Joins events on User, Plan or Country.",
    dimensions: [
        text('user_id', 'User', 'The user, as events name them.'),
        text('plan', 'Plan', 'free, pro or enterprise.'),
        text('country', 'Country', 'Two-letter country code.'),
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
            'Seats the users pay for.',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};
