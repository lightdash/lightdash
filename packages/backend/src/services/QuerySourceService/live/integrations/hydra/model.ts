import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    HYDRA_OBJECTS_PATH,
    MetricType,
    TimeFrames,
    withHydraDefaults,
    type HydraApiSource,
} from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    NON_ADDITIVE,
    type LiveExploreDefinition,
    type LiveModel,
    type LiveRuntime,
    type NamedLiveExploreDefinition,
} from '../../sdk';
import {
    HYDRA_RECORD_COUNT,
    hydraObjectsResponseSchema,
    type HydraObjectsResponse,
} from './objects';

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

export const HYDRA_EVENTS_EXPLORE: NamedLiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        "Sample product events (page views, sign-ups, adds to cart and purchases) over the last 90 days, from Lightdash's Hydra test integration. Dates are in UTC.",
    aiHint: 'Seeded test data. Without a Date filter the query reads the last 30 days. Unique users is a distinct count: summing rows counts a user once per row. Joins Users on User, Plan or Country.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
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
};

export const HYDRA_USERS_EXPLORE: NamedLiveExploreDefinition = {
    name: 'users',
    label: 'Users',
    description:
        "Sample users with their plan, country, sign-up date and seats, from Lightdash's Hydra test integration.",
    aiHint: 'Seeded test data. Joins Events on User, Plan or Country.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
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
};

export const HYDRA_EXPLORES = [
    HYDRA_EVENTS_EXPLORE,
    HYDRA_USERS_EXPLORE,
] as const;

const DIMENSION_TYPES: Record<string, DimensionType> = {
    number: DimensionType.NUMBER,
    date: DimensionType.DATE,
    boolean: DimensionType.BOOLEAN,
};

/** A field id as a field name: `Amount__c` → `amount__c`. */
const toFieldName = (id: string) => id.toLowerCase();

type HydraListedObject = HydraObjectsResponse['objects'][number];

/**
 * One workspace object's explore, keyed by the object's id and named by the
 * core: every field as a dimension, filtered by value when it is text, and a
 * count of records. It starts off, and the vendor's system fields start
 * hidden.
 */
export const toHydraObjectExplore = (
    object: HydraListedObject,
): LiveExploreDefinition => ({
    apiName: object.id,
    onByDefault: false,
    label: object.label,
    description: `Records of the ${object.label} object in Hydra's test workspace.`,
    aiHint: 'Seeded test data from a Hydra workspace object.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: object.fields.map((field) =>
        dimension({
            name: toFieldName(field.id),
            apiName: field.id,
            label: field.label,
            type: DIMENSION_TYPES[field.type] ?? DimensionType.STRING,
            filterOperators:
                field.type === 'string' ? HYDRA_STRING_FILTERS : [],
            description: `${field.label} of the record.`,
            ...(field.system ? { onByDefault: false } : {}),
        }),
    ),
    // Reports can't filter on totals
    metrics: [
        metric({
            name: HYDRA_RECORD_COUNT,
            label: 'Records',
            type: MetricType.COUNT,
            filterOperators: [],
            description: 'Number of records.',
            aggregation: ADDITIVE,
        }),
    ],
});

/**
 * The events and users explores, then one per object the workspace has. A
 * source that declares no objects is never asked, so its call numbers and
 * limits stay as its tests expect.
 */
export const discoverHydraExplores = async ({
    settings,
    runtime,
}: {
    settings: HydraApiSource;
    runtime: LiveRuntime;
}): Promise<LiveExploreDefinition[]> => {
    if (withHydraDefaults(settings).objects.length === 0) {
        return [...HYDRA_EXPLORES];
    }
    const { objects } = await runtime.fetch(
        { method: 'GET', path: HYDRA_OBJECTS_PATH, body: undefined },
        hydraObjectsResponseSchema,
    );
    return [...HYDRA_EXPLORES, ...objects.map(toHydraObjectExplore)];
};

export const hydraModel: LiveModel<ApiConnectorType.HYDRA> = {
    explores: HYDRA_EXPLORES,
    discover: discoverHydraExplores,
};
