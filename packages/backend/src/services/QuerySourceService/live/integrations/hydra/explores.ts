import { DimensionType, MetricType, TimeFrames } from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    explore,
    metric,
    NON_ADDITIVE,
} from '../../explores/declare';
import { HYDRA_DATE_FILTERS, HYDRA_STRING_FILTERS } from './filters';

export const HYDRA_EVENTS_EXPLORE = explore({
    name: 'events',
    label: 'Events',
    description:
        "Sample product events (page views, sign-ups, adds to cart and purchases) over the last 90 days, from Lightdash's Hydra test integration. Dates are in UTC.",
    aiHint: 'Seeded test data. Without a Date filter the query reads the last 30 days. Unique users is a distinct count: summing rows counts a user once per row. Joins Users on User, Plan or Country.',
    dateRange: { dimension: 'date', defaultDays: 30 },
    dimensions: [
        dimension({
            name: 'date',
            label: 'Date',
            type: DimensionType.DATE,
            filterOperators: HYDRA_DATE_FILTERS,
            description: 'Day of the event, in UTC.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            timeInterval: { base: 'date', grain: TimeFrames.DAY },
        }),
        dimension({
            name: 'date_week',
            label: 'Date week',
            type: DimensionType.DATE,
            filterOperators: [],
            description: 'Week of the event, shown as its Monday, in UTC.',
            aiHint: 'Filter Date, not this field, to choose the weeks.',
            timeInterval: { base: 'date', grain: TimeFrames.WEEK },
        }),
        dimension({
            name: 'date_month',
            label: 'Date month',
            type: DimensionType.DATE,
            filterOperators: [],
            description: 'Month of the event, shown as its first day, in UTC.',
            aiHint: 'Filter Date, not this field, to choose the months.',
            timeInterval: { base: 'date', grain: TimeFrames.MONTH },
        }),
        dimension({
            name: 'event_type',
            label: 'Event type',
            type: DimensionType.STRING,
            filterOperators: HYDRA_STRING_FILTERS,
            description:
                'Type of event: page_view, sign_up, add_to_cart or purchase.',
        }),
        dimension({
            name: 'user_id',
            label: 'User',
            type: DimensionType.STRING,
            filterOperators: HYDRA_STRING_FILTERS,
            description: 'User who sent the event.',
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: HYDRA_STRING_FILTERS,
            description: "Two-letter code of the user's country.",
        }),
        dimension({
            name: 'plan',
            label: 'Plan',
            type: DimensionType.STRING,
            filterOperators: HYDRA_STRING_FILTERS,
            description: "User's plan: free, pro or enterprise.",
        }),
    ],
    // Reports can't filter on totals
    metrics: [
        metric({
            name: 'event_count',
            label: 'Events',
            type: MetricType.COUNT,
            filterOperators: [],
            description: 'Number of events.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'revenue',
            label: 'Revenue',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Revenue from purchases, in US dollars.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'unique_users',
            label: 'Unique users',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: [],
            description: 'Number of distinct users with at least one event.',
            aiHint: 'Distinct count: summing rows counts a user once per row.',
            aggregation: NON_ADDITIVE,
        }),
    ],
});

export const HYDRA_USERS_EXPLORE = explore({
    name: 'users',
    label: 'Users',
    description:
        "Sample users with their plan, country, sign-up date and seats, from Lightdash's Hydra test integration.",
    aiHint: 'Seeded test data. Joins Events on User, Plan or Country.',
    dimensions: [
        dimension({
            name: 'user_id',
            label: 'User',
            type: DimensionType.STRING,
            filterOperators: HYDRA_STRING_FILTERS,
            description: 'User ID, as events name it.',
        }),
        dimension({
            name: 'plan',
            label: 'Plan',
            type: DimensionType.STRING,
            filterOperators: HYDRA_STRING_FILTERS,
            description: "User's plan: free, pro or enterprise.",
        }),
        dimension({
            name: 'country',
            label: 'Country',
            type: DimensionType.STRING,
            filterOperators: HYDRA_STRING_FILTERS,
            description: "Two-letter code of the user's country.",
        }),
        dimension({
            name: 'signup_date',
            label: 'Sign-up date',
            type: DimensionType.DATE,
            filterOperators: [],
            description: 'Day the user signed up, in UTC.',
        }),
    ],
    // Reports can't filter on totals
    metrics: [
        metric({
            name: 'user_count',
            label: 'Users',
            type: MetricType.COUNT,
            filterOperators: [],
            description: 'Number of users.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'seats',
            label: 'Seats',
            type: MetricType.SUM,
            filterOperators: [],
            description: 'Number of seats the users pay for.',
            aggregation: ADDITIVE,
        }),
    ],
});

export const HYDRA_EXPLORES = [
    HYDRA_EVENTS_EXPLORE,
    HYDRA_USERS_EXPLORE,
] as const;
