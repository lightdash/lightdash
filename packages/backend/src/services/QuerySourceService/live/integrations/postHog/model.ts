import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    getErrorMessage,
    MetricType,
    type ApiSourceSchemaScan,
    type QuerySourceSchemaTable,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ADDITIVE,
    defineLiveDiscovery,
    dimension,
    metric,
    NON_ADDITIVE,
    withFieldsOffByDefault,
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveModel,
    type LiveQueryResult,
    type LiveRuntime,
    type NamedLiveExploreDefinition,
} from '../../sdk';
import {
    getPostHogPropertyDefinitionsPrefix,
    type PostHogSettings,
} from './api';

export const POSTHOG_NULL_FILTERS = [
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const POSTHOG_STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.LESS_THAN,
    FilterOperator.GREATER_THAN,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_BOOLEAN_FILTERS = [
    FilterOperator.EQUALS,
    ...POSTHOG_NULL_FILTERS,
];

export const POSTHOG_FILTERS_BY_TYPE: Record<DimensionType, FilterOperator[]> =
    {
        [DimensionType.STRING]: POSTHOG_STRING_FILTERS,
        [DimensionType.NUMBER]: POSTHOG_NUMBER_FILTERS,
        [DimensionType.DATE]: POSTHOG_DATE_FILTERS,
        [DimensionType.TIMESTAMP]: POSTHOG_DATE_FILTERS,
        [DimensionType.BOOLEAN]: POSTHOG_BOOLEAN_FILTERS,
    };

export const POSTHOG_METRIC_FILTERS = POSTHOG_NUMBER_FILTERS.filter(
    (operator) => !POSTHOG_NULL_FILTERS.includes(operator),
);

export const POSTHOG_EVENTS_EXPLORE: NamedLiveExploreDefinition = {
    name: 'events',
    label: 'Events',
    description:
        'Product events captured by PostHog, such as pageviews, autocaptured clicks and custom events, with their event and person properties. Dates are in the PostHog project time zone.',
    aiHint: 'Without a Date filter the query reads the last 30 days. Unique users and Unique sessions are distinct counts: never sum rows. Events without a session ID are not in Unique sessions. Every event and person property PostHog knows is added as a dimension (Person properties are prefixed "Person").',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'date', defaultDays: 30 },
    incompatible: [],
    dimensions: [
        dimension({
            name: 'date',
            apiName: 'timestamp',
            label: 'Event date',
            type: DimensionType.DATE,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Day the event happened, in the project time zone.',
            aiHint: 'Without a date filter the query reads the last 30 days.',
            sql: 'toDate(${TABLE}.timestamp)',
        }),
        dimension({
            name: 'week',
            apiName: 'timestamp',
            label: 'Event week',
            type: DimensionType.DATE,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Week the event happened, shown as its Monday.',
            sql: 'toStartOfWeek(${TABLE}.timestamp, 1)',
        }),
        dimension({
            name: 'month',
            apiName: 'timestamp',
            label: 'Event month',
            type: DimensionType.DATE,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Month the event happened, shown as its first day.',
            sql: 'toStartOfMonth(${TABLE}.timestamp)',
        }),
        dimension({
            name: 'timestamp',
            label: 'Event time',
            type: DimensionType.TIMESTAMP,
            filterOperators: POSTHOG_DATE_FILTERS,
            description: 'Exact time the event happened.',
            sql: '${TABLE}.timestamp',
        }),
        dimension({
            name: 'event',
            label: 'Event name',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'Name of the event, such as $pageview, $autocapture, $identify or a custom event.',
            sql: '${TABLE}.event',
        }),
        dimension({
            name: 'distinct_id',
            label: 'Distinct ID',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                "ID the event was sent with: an anonymous ID until the user is identified, then the user's ID.",
            sql: '${TABLE}.distinct_id',
        }),
        dimension({
            name: 'person_id',
            label: 'Person ID',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'The person the event belongs to, after identifying and merging IDs.',
            sql: 'toString(${TABLE}.person_id)',
        }),
        dimension({
            name: 'current_url',
            apiName: 'properties.$current_url',
            label: 'Current URL',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Full URL of the page the event happened on.',
            sql: '${TABLE}.properties.$current_url',
        }),
        dimension({
            name: 'pathname',
            apiName: 'properties.$pathname',
            label: 'Path',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'Path of the page, without the domain or query string.',
            sql: '${TABLE}.properties.$pathname',
        }),
        dimension({
            name: 'referring_domain',
            apiName: 'properties.$referring_domain',
            label: 'Referring domain',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Domain the visitor came from, or $direct.',
            sql: '${TABLE}.properties.$referring_domain',
        }),
        dimension({
            name: 'utm_source',
            apiName: 'properties.utm_source',
            label: 'UTM source',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description:
                'utm_source value in the page URL, such as google or newsletter.',
            sql: '${TABLE}.properties.utm_source',
        }),
        dimension({
            name: 'browser',
            apiName: 'properties.$browser',
            label: 'Browser',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Browser name, such as Chrome or Safari.',
            sql: '${TABLE}.properties.$browser',
        }),
        dimension({
            name: 'os',
            apiName: 'properties.$os',
            label: 'Operating system',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Operating system, such as Mac OS X or Android.',
            sql: '${TABLE}.properties.$os',
        }),
        dimension({
            name: 'device_type',
            apiName: 'properties.$device_type',
            label: 'Device type',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Type of device: Desktop, Mobile or Tablet.',
            sql: '${TABLE}.properties.$device_type',
        }),
        dimension({
            name: 'country',
            apiName: 'properties.$geoip_country_code',
            label: 'Country code',
            type: DimensionType.STRING,
            filterOperators: POSTHOG_STRING_FILTERS,
            description: 'Two-letter country code, based on the IP address.',
            sql: '${TABLE}.properties.$geoip_country_code',
        }),
    ],
    metrics: [
        metric({
            name: 'event_count',
            label: 'Events',
            type: MetricType.COUNT,
            filterOperators: POSTHOG_METRIC_FILTERS,
            description: 'Number of events captured.',
            sql: '${TABLE}.uuid',
            // A count of event rows (https://posthog.com/docs/sql)
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'unique_users',
            label: 'Unique users',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: POSTHOG_METRIC_FILTERS,
            description:
                'Number of distinct people, after identifying and merging IDs.',
            aiHint: 'Distinct count: never sum rows.',
            sql: '${TABLE}.person_id',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'unique_sessions',
            label: 'Unique sessions',
            type: MetricType.COUNT_DISTINCT,
            filterOperators: POSTHOG_METRIC_FILTERS,
            description: 'Number of distinct sessions.',
            aiHint: 'Distinct count: never sum rows. Events without a session ID are not counted.',
            // Events without a session have an empty session ID
            sql: "nullIf(${TABLE}.$session_id, '')",
            // Sessions can span days, so daily counts overlap
            aggregation: NON_ADDITIVE,
        }),
    ],
};

export const POSTHOG_EXPLORES = [POSTHOG_EVENTS_EXPLORE] as const;

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
export const isPostHogSystemProperty = (apiName: string) => {
    const property = apiName.split('.').at(-1) ?? apiName;
    return property.startsWith('$') || AD_CLICK_ID_PROPERTIES.has(property);
};

const propertyDimension = ({
    name,
    apiName,
    label,
    type = DimensionType.STRING,
    sql = `\${TABLE}.${apiName}`,
    description,
    aiHint,
}: {
    name: string;
    apiName: string;
    label: string;
    type?: DimensionType;
    sql?: string;
    description?: string;
    aiHint?: string;
}): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    sql,
    filterOperators: POSTHOG_FILTERS_BY_TYPE[type],
});

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
export const withPostHogPropertyFields = <D extends LiveExploreDefinition>(
    definition: D,
    propertyDefinitions: Record<PostHogPropertyKind, unknown>,
): D => {
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
                return propertyDimension({
                    name: toScannedFieldName(prefix, name),
                    apiName,
                    label: `${labelPrefix}${name}`,
                    description:
                        description?.trim() ||
                        `The ${name} ${kind} property, as sent to PostHog.`,
                    ...(kind === 'person'
                        ? {
                              aiHint: "Person properties reflect the person's current values, not their values at the time of the event (depends on the project's person-on-events mode).",
                          }
                        : {}),
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

export const POSTHOG_SCAN_WINDOW_DAYS = 30;
const MAX_EVENTS = 1_000;
const MAX_PROPERTY_KEYS = 500;
const PROPERTY_SAMPLE_ROWS = 10_000;
const DESCRIBED_EVENTS = 50;
const PLAIN_PROPERTY_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const toPropertyReference = (key: string): string =>
    PLAIN_PROPERTY_KEY.test(key)
        ? `properties.${key}`
        : `properties['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;

export const POSTHOG_EVENTS_QUERY = `SELECT event AS event_name, count() AS event_count
FROM events
WHERE timestamp > now() - INTERVAL ${POSTHOG_SCAN_WINDOW_DAYS} DAY
GROUP BY event_name
ORDER BY event_count DESC`;

// Samples recent events so the key scan stays cheap on large projects.
export const POSTHOG_PROPERTY_KEYS_QUERY = `SELECT property_key, count() AS occurrences
FROM (
    SELECT arrayJoin(JSONExtractKeys(properties)) AS property_key
    FROM events
    WHERE timestamp > now() - INTERVAL 1 DAY
    LIMIT ${PROPERTY_SAMPLE_ROWS}
)
GROUP BY property_key
ORDER BY occurrences DESC`;

/** Each call runs as its own query: a metered source allows one call per query. */
export type RunLiveQuery = (args: {
    query: string;
    limit: number;
}) => Promise<LiveQueryResult>;

/** Two HogQL calls: event names with counts, then property keys from a sample. */
export const scanPostHogSchema = async (
    runQuery: RunLiveQuery,
    now: () => Date = () => new Date(),
): Promise<ApiSourceSchemaScan> => {
    const events = await runQuery({
        query: POSTHOG_EVENTS_QUERY,
        limit: MAX_EVENTS,
    });
    let propertyKeys: string[] | null;
    try {
        const properties = await runQuery({
            query: POSTHOG_PROPERTY_KEYS_QUERY,
            limit: MAX_PROPERTY_KEYS,
        });
        propertyKeys = properties.rows.flatMap(({ property_key: key }) =>
            typeof key === 'string' ? [key] : [],
        );
    } catch {
        propertyKeys = null;
    }
    return {
        status: 'ready',
        scannedAt: now(),
        windowDays: POSTHOG_SCAN_WINDOW_DAYS,
        events: events.rows.flatMap(
            ({ event_name: name, event_count: count }) =>
                typeof name === 'string'
                    ? [{ name, count: Number(count) || 0 }]
                    : [],
        ),
        eventsTruncated: events.hasMoreRows,
        propertyKeys,
    };
};

export const toFailedScan = (
    error: unknown,
    now: () => Date = () => new Date(),
): ApiSourceSchemaScan => ({
    status: 'failed',
    scannedAt: now(),
    error: getErrorMessage(error),
});

/** A scanned connection as a schema table: the events table, with its busiest events in the description. */
export const toPostHogSchemaTable = (
    connection: { connectionUuid: string; name: string },
    scan: Extract<ApiSourceSchemaScan, { status: 'ready' }>,
): QuerySourceSchemaTable => ({
    reference: connection.connectionUuid,
    label: connection.name,
    description: `HogQL table "events" in PostHog. ${
        scan.events.length
    } event names seen in the last ${scan.windowDays} days, busiest first: ${scan.events
        .slice(0, DESCRIBED_EVENTS)
        .map(({ name, count }) => `${JSON.stringify(name)} (${count})`)
        .join(', ')}${scan.events.length > DESCRIBED_EVENTS ? ', …' : ''}`,
    columns: [
        { name: 'event', type: DimensionType.STRING },
        { name: 'timestamp', type: DimensionType.TIMESTAMP },
        { name: 'distinct_id', type: DimensionType.STRING },
        { name: 'person_id', type: DimensionType.STRING },
        ...(scan.propertyKeys ?? []).map((key) => ({
            name: toPropertyReference(key),
            type: DimensionType.STRING,
        })),
    ].map(({ name, type }) => ({
        reference: name,
        type,
        label: null,
        description: null,
    })),
});
const PROPERTY_DEFINITIONS_PAGE_SIZE = 500;

const propertyDefinitionsPageSchema = z.object({
    next: z.string().nullish(),
    results: z.array(z.unknown()),
});

/** Every property definition of one kind, a page at a time, up to the scan cap. */
const readPropertyDefinitions = async (
    projectId: string,
    type: PostHogPropertyKind,
    runtime: LiveRuntime,
): Promise<{ results: unknown[] }> => {
    const readPage = async (offset: number) => {
        const response = await runtime.send({
            method: 'GET',
            path: getPostHogPropertyDefinitionsPrefix(projectId),
            query: {
                type,
                limit: String(PROPERTY_DEFINITIONS_PAGE_SIZE),
                ...(offset > 0 ? { offset: String(offset) } : {}),
            },
            body: null,
        });
        const page = propertyDefinitionsPageSchema.safeParse(response.body);
        return page.success ? page.data : { results: [], next: null };
    };
    const readFrom = async (offset: number): Promise<unknown[]> => {
        const page = await readPage(offset);
        const nextOffset = offset + page.results.length;
        const hasMore =
            Boolean(page.next) &&
            page.results.length > 0 &&
            nextOffset < POSTHOG_MAX_SCANNED_PROPERTIES;
        return hasMore
            ? [...page.results, ...(await readFrom(nextOffset))]
            : page.results;
    };
    return { results: await readFrom(0) };
};

/** The project's event and person property definitions, as PostHog returns them. */
export type PostHogScan = {
    posthogProperties?: Record<'event' | 'person', unknown>;
};

/** Reads the event and person property definitions the explore adds fields for. */
export const scanPostHogProperties = async ({
    settings: { projectId },
    runtime,
}: {
    settings: PostHogSettings;
    runtime: LiveRuntime;
}): Promise<PostHogScan> => {
    const [event, person] = await Promise.all([
        readPropertyDefinitions(projectId, 'event', runtime),
        readPropertyDefinitions(projectId, 'person', runtime),
    ]);
    return { posthogProperties: { event, person } };
};

export const postHogModel: LiveModel<ApiConnectorType.POSTHOG> = {
    explores: POSTHOG_EXPLORES,
    // The first explore gets the project's event and person properties
    discover: defineLiveDiscovery({
        read: scanPostHogProperties,
        schema: z.object({
            posthogProperties: z
                .object({ event: z.unknown(), person: z.unknown() })
                .optional(),
        }),
        explores: ({ posthogProperties }) => {
            const [events, ...others] = POSTHOG_EXPLORES;
            return [
                posthogProperties
                    ? withFieldsOffByDefault(
                          events,
                          withPostHogPropertyFields(events, {
                              event: posthogProperties.event,
                              person: posthogProperties.person,
                          }),
                          isPostHogSystemProperty,
                      )
                    : events,
                ...others,
            ];
        },
    }),
};
