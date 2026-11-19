import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import { z } from 'zod';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

/** HubSpot's search returns at most 200 records a call. */
export const HUBSPOT_PAGE_SIZE = 200;
export const HUBSPOT_MAX_PAGES = 5;
export const HUBSPOT_MAX_ROWS = HUBSPOT_PAGE_SIZE * HUBSPOT_MAX_PAGES;
/** One search takes at most this many filters in a group. */
export const HUBSPOT_MAX_FILTERS = 6;

export const HUBSPOT_TEXT_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

/** Options match HubSpot's internal values exactly. */
export const HUBSPOT_CHOICE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const HUBSPOT_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
];

export const HUBSPOT_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

export const HUBSPOT_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

/**
 * API names of the built-in fields: the keys every search result has. They
 * are camelCase, so no property name (lowercase) can take them.
 */
export const HUBSPOT_BUILT_IN_COLUMNS = [
    'id',
    'createdAt',
    'updatedAt',
] as const;
export type HubspotBuiltInColumn = (typeof HUBSPOT_BUILT_IN_COLUMNS)[number];

/** Properties the built-in fields already read. */
const BUILT_IN_PROPERTIES = new Set([
    'hs_object_id',
    'createdate',
    'hs_lastmodifieddate',
    'lastmodifieddate',
]);

const BUILT_IN_DIMENSIONS: LiveDimensionDefinition[] = [
    {
        name: 'record_id',
        apiName: 'id',
        label: 'Record ID',
        description: "The record's id in HubSpot.",
        type: DimensionType.STRING,
        filterOperators: HUBSPOT_CHOICE_FILTERS,
    },
    {
        name: 'created_at',
        apiName: 'createdAt',
        label: 'Created',
        description: 'When the record was created, in UTC.',
        type: DimensionType.TIMESTAMP,
        filterOperators: HUBSPOT_DATE_FILTERS,
    },
    {
        name: 'updated_at',
        apiName: 'updatedAt',
        label: 'Last modified',
        description: 'When the record last changed, in UTC.',
        type: DimensionType.TIMESTAMP,
        filterOperators: HUBSPOT_DATE_FILTERS,
    },
];

const COUNT: LiveMetricDefinition = {
    name: 'count',
    apiName: 'total',
    label: 'Count',
    description:
        'How many records match the filters, from the total HubSpot reports for the search. One call, whatever the count.',
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
};

export const HUBSPOT_COUNT_REASON =
    "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.";

/**
 * The shared check only sees the built-in fields here; compile refuses Count
 * with a scanned property, which the explore's rules don't name.
 */
const countIncompatibility = (dimensions: LiveDimensionDefinition[]) => ({
    fields: [COUNT.name],
    with: dimensions.map(({ name }) => name),
    reason: HUBSPOT_COUNT_REASON,
    selectedOnly: true as const,
});

/** The built-in fields a record always has; a scan adds the object's properties. */
export const HUBSPOT_RECORDS_EXPLORE: LiveExploreDefinition = {
    name: 'records',
    label: 'Records',
    description: `Records of one HubSpot CRM object, read live from HubSpot, one row per record, at most ${HUBSPOT_MAX_ROWS.toLocaleString(
        'en-US',
    )} per query. Count gives the number of matching records without reading them.`,
    dimensions: BUILT_IN_DIMENSIONS,
    metrics: [COUNT],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [countIncompatibility(BUILT_IN_DIMENSIONS)],
};

/** HubSpot property types Lightdash reads, with how it filters them. */
const PROPERTY_RULES: Record<
    string,
    { type: DimensionType; filterOperators: FilterOperator[] }
> = {
    string: {
        type: DimensionType.STRING,
        filterOperators: HUBSPOT_TEXT_FILTERS,
    },
    phone_number: {
        type: DimensionType.STRING,
        filterOperators: HUBSPOT_TEXT_FILTERS,
    },
    enumeration: {
        type: DimensionType.STRING,
        filterOperators: HUBSPOT_CHOICE_FILTERS,
    },
    number: {
        type: DimensionType.NUMBER,
        filterOperators: HUBSPOT_NUMBER_FILTERS,
    },
    bool: {
        type: DimensionType.BOOLEAN,
        filterOperators: HUBSPOT_BOOLEAN_FILTERS,
    },
    date: { type: DimensionType.DATE, filterOperators: HUBSPOT_DATE_FILTERS },
    datetime: {
        type: DimensionType.TIMESTAMP,
        filterOperators: HUBSPOT_DATE_FILTERS,
    },
};

const MAX_SCANNED_PROPERTIES = 400;
const MAX_LISTED_OPTIONS = 15;
// Internal names are lowercase letters, digits and underscores
const PROPERTY_NAME = /^[a-z][a-z0-9_]*$/;

/** HubSpot's own hs_ properties people read often; other hs_ ones start hidden. */
const USEFUL_HS_PROPERTIES = new Set([
    'hs_is_closed',
    'hs_is_closed_won',
    'hs_deal_stage_probability',
    'hs_forecast_amount',
    'hs_lead_status',
    'hs_analytics_source',
]);

export const isInternalHubspotField = (apiName: string) =>
    apiName.startsWith('hs_') && !USEFUL_HS_PROPERTIES.has(apiName);

/**
 * Names properties can't take: the built-in fields and Count. A property
 * named like one gets a prefix, from its name alone, so it never changes.
 */
const RESERVED_NAMES = new Set([
    ...BUILT_IN_DIMENSIONS.map(({ name }) => name),
    COUNT.name,
]);

const toDimensionName = (property: string) =>
    RESERVED_NAMES.has(property) ? `property_${property}` : property;

const propertiesSchema = z.object({
    results: z.array(
        z.object({
            name: z.string(),
            label: z.string(),
            type: z.string(),
            fieldType: z.string().optional(),
            description: z.string().nullable().optional(),
            hidden: z.boolean().optional(),
            options: z
                .array(z.object({ label: z.string(), value: z.string() }))
                .optional(),
        }),
    ),
});

type HubspotProperty = z.infer<typeof propertiesSchema>['results'][number];

const describeProperty = ({
    label,
    description,
    type,
    fieldType,
    options,
}: HubspotProperty) => {
    const listed = (options ?? []).slice(0, MAX_LISTED_OPTIONS);
    const more = (options ?? []).length - listed.length;
    return [
        description?.trim() || `The ${label} property in HubSpot.`,
        type === 'enumeration' && listed.length > 0
            ? `Values are HubSpot's internal option names: ${listed
                  .map(({ value, label: title }) =>
                      value === title ? value : `${value} (${title})`,
                  )
                  .join(', ')}${more > 0 ? ` and ${more} more` : ''}.`
            : '',
        fieldType === 'checkbox'
            ? 'Several values are separated by semicolons.'
            : '',
        type === 'string'
            ? 'Contains matches whole words or part of one word.'
            : '',
    ]
        .filter(Boolean)
        .join(' ');
};

/**
 * Adds a dimension per property of the object, people's own before
 * HubSpot's hs_ ones. Unknown types and unreadable lists add nothing.
 */
export const withHubspotPropertyFields = (
    definition: LiveExploreDefinition,
    properties: unknown,
): LiveExploreDefinition => {
    const parsed = propertiesSchema.safeParse(properties);
    if (!parsed.success) {
        return definition;
    }
    const kept = parsed.data.results.filter(
        ({ name, type, hidden }) =>
            !hidden &&
            PROPERTY_NAME.test(name) &&
            !BUILT_IN_PROPERTIES.has(name) &&
            Object.hasOwn(PROPERTY_RULES, type),
    );
    const scanned = [
        ...kept.filter(({ name }) => !isInternalHubspotField(name)),
        ...kept.filter(({ name }) => isInternalHubspotField(name)),
    ].slice(0, MAX_SCANNED_PROPERTIES);
    const dimensions = scanned.map(
        (property): LiveDimensionDefinition => ({
            name: toDimensionName(property.name),
            apiName: property.name,
            label: property.label,
            description: describeProperty(property),
            ...PROPERTY_RULES[property.type],
        }),
    );
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
    };
};
