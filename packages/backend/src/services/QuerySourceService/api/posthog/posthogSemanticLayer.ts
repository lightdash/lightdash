import {
    DimensionType,
    FilterOperator,
    MetricType,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import { z } from 'zod';
import type {
    ApiSourceDimensionDefinition,
    ApiSourceExploreDefinition,
    ApiSourceMetricDefinition,
} from '../apiSourceExplore';

export const POSTHOG_SEMANTIC_LAYER_VERSION = 1;

/** Properties a scan keeps per kind; PostHog projects can define thousands. */
export const POSTHOG_MAX_SCANNED_PROPERTIES = 2000;

// Ad click ids PostHog captures from landing URLs: one value per click, never a useful dimension.
const AD_CLICK_ID_PROPERTIES = new Set([
    'gclid',
    'gad_source',
    'gbraid',
    'wbraid',
    'dclid',
    'fbclid',
    'msclkid',
    'twclid',
    'ttclid',
    'li_fat_id',
    'mc_cid',
    'igshid',
    'rdt_cid',
    'irclid',
    '_kx',
]);

/** PostHog's own bookkeeping properties (`$lib_version`) and ad click ids. */
export const isInternalPostHogProperty = (apiName: string) => {
    const property = apiName.split('.').at(-1) ?? apiName;
    return property.startsWith('$') || AD_CLICK_ID_PROPERTIES.has(property);
};

const NULL_FILTERS = [FilterOperator.NULL, FilterOperator.NOT_NULL];
const STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...NULL_FILTERS,
];
const NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
    ...NULL_FILTERS,
];
export const POSTHOG_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_BETWEEN,
    FilterOperator.LESS_THAN,
    FilterOperator.GREATER_THAN,
    ...NULL_FILTERS,
];
const BOOLEAN_FILTERS = [FilterOperator.EQUALS, ...NULL_FILTERS];

export const POSTHOG_FILTERS_BY_TYPE: Record<DimensionType, FilterOperator[]> =
    {
        [DimensionType.STRING]: STRING_FILTERS,
        [DimensionType.NUMBER]: NUMBER_FILTERS,
        [DimensionType.DATE]: POSTHOG_DATE_FILTERS,
        [DimensionType.TIMESTAMP]: POSTHOG_DATE_FILTERS,
        [DimensionType.BOOLEAN]: BOOLEAN_FILTERS,
    };

const dimension = ({
    name,
    apiName,
    label,
    type = DimensionType.STRING,
    sql = `\${TABLE}.${apiName}`,
    description,
}: {
    name: string;
    apiName: string;
    label: string;
    type?: DimensionType;
    sql?: string;
    description?: string;
}): ApiSourceDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    type,
    sql,
    filterOperators: POSTHOG_FILTERS_BY_TYPE[type],
});

export const POSTHOG_METRIC_FILTERS = NUMBER_FILTERS.filter(
    (operator) => !NULL_FILTERS.includes(operator),
);

const metric = (
    name: string,
    label: string,
    type: MetricType,
    aggregation: ApiSourceMetricAggregation,
    sql: string,
    description: string,
): ApiSourceMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type,
    sql,
    filterOperators: POSTHOG_METRIC_FILTERS,
    aggregation,
});

const eventProperty = (
    name: string,
    property: string,
    label: string,
    description: string,
) => dimension({ name, apiName: `properties.${property}`, label, description });

export const POSTHOG_EVENTS_EXPLORE: ApiSourceExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        'Product events captured by PostHog: pageviews, autocapture and custom events. Dates are in the PostHog project time zone.',
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'timestamp',
            label: 'Event date',
            type: DimensionType.DATE,
            sql: 'toDate(${TABLE}.timestamp)',
            description:
                'Day the event happened. Queries without a date filter read the last 30 days.',
        }),
        dimension({
            name: 'week',
            apiName: 'timestamp',
            label: 'Event week',
            type: DimensionType.DATE,
            sql: 'toStartOfWeek(${TABLE}.timestamp, 1)',
            description: 'Weeks start on Monday.',
        }),
        dimension({
            name: 'month',
            apiName: 'timestamp',
            label: 'Event month',
            type: DimensionType.DATE,
            sql: 'toStartOfMonth(${TABLE}.timestamp)',
            description: 'Month the event happened.',
        }),
        dimension({
            name: 'timestamp',
            apiName: 'timestamp',
            label: 'Event time',
            type: DimensionType.TIMESTAMP,
            description: 'Exact time the event happened.',
        }),
        dimension({
            name: 'event',
            apiName: 'event',
            label: 'Event name',
            description:
                '$pageview, $autocapture, $identify or a custom event.',
        }),
        dimension({
            name: 'distinct_id',
            apiName: 'distinct_id',
            label: 'Distinct ID',
            description:
                'The ID the event was sent with: anonymous until identify, then the user ID.',
        }),
        dimension({
            name: 'person_id',
            apiName: 'person_id',
            label: 'Person ID',
            sql: 'toString(${TABLE}.person_id)',
            description: 'The person after identify and merges.',
        }),
        eventProperty(
            'current_url',
            '$current_url',
            'Current URL',
            'Full URL of the page the event happened on.',
        ),
        eventProperty(
            'pathname',
            '$pathname',
            'Path',
            'URL path of the page, without domain or query string.',
        ),
        eventProperty(
            'referring_domain',
            '$referring_domain',
            'Referring domain',
            'Domain the visitor came from, or $direct.',
        ),
        eventProperty(
            'utm_source',
            'utm_source',
            'UTM source',
            'utm_source of the page URL, such as google or newsletter.',
        ),
        eventProperty(
            'browser',
            '$browser',
            'Browser',
            'Browser name, such as Chrome or Safari.',
        ),
        eventProperty(
            'os',
            '$os',
            'Operating system',
            'Operating system, such as Mac OS X or Android.',
        ),
        eventProperty(
            'device_type',
            '$device_type',
            'Device type',
            'Desktop, Mobile or Tablet.',
        ),
        eventProperty(
            'country',
            '$geoip_country_code',
            'Country code',
            'Two-letter country code, from the IP address.',
        ),
    ],
    metrics: [
        metric(
            'event_count',
            'Events',
            MetricType.COUNT,
            // A count of event rows (https://posthog.com/docs/sql)
            { aggregation: 'additive' },
            '${TABLE}.uuid',
            'Events captured.',
        ),
        metric(
            'unique_users',
            'Unique users',
            MetricType.COUNT_DISTINCT,
            { aggregation: 'non_additive' },
            '${TABLE}.person_id',
            'Distinct people, after identify and merges.',
        ),
        metric(
            'unique_sessions',
            'Unique sessions',
            MetricType.COUNT_DISTINCT,
            // Sessions can span days, so daily counts overlap
            { aggregation: 'non_additive' },
            '${TABLE}.$session_id',
            'Distinct sessions.',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
};

const propertyDefinitionsSchema = z.object({
    results: z.array(
        z.object({
            name: z.string(),
            property_type: z.string().nullish(),
            description: z.string().nullish(),
        }),
    ),
});

// Only names that need no quoting, so a property name can never change the query.
const PROPERTY_NAME = /^[$A-Za-z_][$A-Za-z0-9_]{0,99}$/;

const TYPES_BY_PROPERTY_TYPE: Record<string, DimensionType> = {
    Numeric: DimensionType.NUMBER,
    Boolean: DimensionType.BOOLEAN,
    DateTime: DimensionType.TIMESTAMP,
};

const toScannedFieldName = (prefix: string, property: string) =>
    `${prefix}_${property
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()}`;

export type PostHogPropertyKind = 'event' | 'person';

/**
 * Adds a dimension per event and person property PostHog knows, read from
 * its property definitions. Properties the hand-written fields already cover
 * are skipped; unreadable definitions add nothing.
 */
export const withPostHogPropertyFields = (
    definition: ApiSourceExploreDefinition,
    propertyDefinitions: Record<PostHogPropertyKind, unknown>,
): ApiSourceExploreDefinition => {
    const taken = new Set([
        ...definition.dimensions.map(({ name }) => name),
        ...definition.metrics.map(({ name }) => name),
    ]);
    const coveredApiNames = new Set(
        definition.dimensions.map(({ apiName }) => apiName),
    );
    const toDimensions = (kind: PostHogPropertyKind) => {
        const parsed = propertyDefinitionsSchema.safeParse(
            propertyDefinitions[kind],
        );
        if (!parsed.success) {
            return [];
        }
        const path = kind === 'event' ? 'properties' : 'person.properties';
        const prefix = kind === 'event' ? 'property' : 'person';
        const labelPrefix = kind === 'event' ? '' : 'Person ';
        return parsed.data.results
            .filter(({ name }) => PROPERTY_NAME.test(name))
            .slice(0, POSTHOG_MAX_SCANNED_PROPERTIES)
            .map(({ name, property_type: propertyType, description }) => {
                const type =
                    TYPES_BY_PROPERTY_TYPE[propertyType ?? ''] ??
                    DimensionType.STRING;
                const apiName = `${path}.${name}`;
                return dimension({
                    name: toScannedFieldName(prefix, name),
                    apiName,
                    label: `${labelPrefix}${name}`,
                    description:
                        description?.trim() ||
                        `The ${name} ${kind} property, as sent to PostHog.`,
                    type,
                    sql:
                        type === DimensionType.NUMBER
                            ? `toFloat(\${TABLE}.${apiName})`
                            : `\${TABLE}.${apiName}`,
                });
            });
    };
    const scanned = [
        ...toDimensions('event'),
        ...toDimensions('person'),
    ].filter(({ name, apiName }) => {
        if (taken.has(name) || coveredApiNames.has(apiName)) {
            return false;
        }
        taken.add(name);
        return true;
    });
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...scanned],
    };
};
