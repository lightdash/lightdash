import {
    DimensionType,
    FilterOperator,
    HUBSPOT_OBJECTS,
    MetricType,
    type HubspotObject,
} from '@lightdash/common';
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
    FilterOperator.IN_THE_NEXT,
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
    'hs_createdate',
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
        label: 'Create date',
        description: 'When the record was created, in UTC.',
        type: DimensionType.TIMESTAMP,
        filterOperators: HUBSPOT_DATE_FILTERS,
    },
    {
        name: 'updated_at',
        apiName: 'updatedAt',
        label: 'Last modified date',
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

const OBJECT_LABELS: Record<HubspotObject, string> = {
    deals: 'Deals',
    contacts: 'Contacts',
    companies: 'Companies',
    tickets: 'Tickets',
    leads: 'Leads',
};

/**
 * One CRM object's built-in fields, which every record has; a scan adds the
 * object's properties. The explore is named after the object.
 */
const toObjectExplore = (object: HubspotObject): LiveExploreDefinition => ({
    name: object,
    label: OBJECT_LABELS[object],
    description: `HubSpot ${object}, read live from HubSpot, one row per record, at most ${HUBSPOT_MAX_ROWS.toLocaleString(
        'en-US',
    )} per query. Count gives the number of matching ${object} without reading them.`,
    dimensions: BUILT_IN_DIMENSIONS,
    metrics: [COUNT],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [countIncompatibility(BUILT_IN_DIMENSIONS)],
});

/** The explore listing deal and ticket pipelines with their stages. */
export const HUBSPOT_PIPELINE_STAGES = 'pipeline_stages';

/** Columns of a pipeline stages request, one per field. */
export const HUBSPOT_PIPELINE_COLUMNS = [
    'objectType',
    'pipelineId',
    'pipelineLabel',
    'pipelineDisplayOrder',
    'stageId',
    'stageLabel',
    'stageDisplayOrder',
    'probability',
    'isClosed',
] as const;
export type HubspotPipelineColumn = (typeof HUBSPOT_PIPELINE_COLUMNS)[number];

const pipelineField = (
    name: string,
    apiName: HubspotPipelineColumn,
    label: string,
    type: DimensionType,
    description: string,
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    type,
    filterOperators: [],
});

/**
 * Every deal and ticket pipeline with its stages, one row per stage, from
 * HubSpot's pipelines API: one call per object. Records hold stage and
 * pipeline ids, so this explains them and can be merged with them.
 */
const PIPELINE_STAGES_EXPLORE: LiveExploreDefinition = {
    name: HUBSPOT_PIPELINE_STAGES,
    label: 'Pipeline stages',
    description:
        'HubSpot deal and ticket pipelines and their stages, one row per stage, with ids and the labels HubSpot shows. Stage ID matches Deal Stage (internal value) on deals and Ticket status (internal value) on tickets; Pipeline ID matches Pipeline (internal value). Filter by Object to read only deals or tickets.',
    dimensions: [
        {
            ...pipelineField(
                'object_type',
                'objectType',
                'Object',
                DimensionType.STRING,
                'The object the pipeline belongs to: deals or tickets.',
            ),
            filterOperators: HUBSPOT_CHOICE_FILTERS,
        },
        pipelineField(
            'pipeline_id',
            'pipelineId',
            'Pipeline ID',
            DimensionType.STRING,
            "The pipeline's internal value, as records store it.",
        ),
        pipelineField(
            'pipeline_label',
            'pipelineLabel',
            'Pipeline',
            DimensionType.STRING,
            'The pipeline as HubSpot shows it.',
        ),
        pipelineField(
            'pipeline_display_order',
            'pipelineDisplayOrder',
            'Pipeline order',
            DimensionType.NUMBER,
            "The pipeline's position in HubSpot, from 0.",
        ),
        pipelineField(
            'stage_id',
            'stageId',
            'Stage ID',
            DimensionType.STRING,
            "The stage's internal value, as records store it.",
        ),
        pipelineField(
            'stage_label',
            'stageLabel',
            'Stage',
            DimensionType.STRING,
            'The stage as HubSpot shows it.',
        ),
        pipelineField(
            'stage_display_order',
            'stageDisplayOrder',
            'Stage order',
            DimensionType.NUMBER,
            "The stage's position in its pipeline, from 0.",
        ),
        pipelineField(
            'probability',
            'probability',
            'Deal probability',
            DimensionType.NUMBER,
            'For deal stages, the chance a deal in the stage closes won, from 0 to 1. Empty for tickets.',
        ),
        pipelineField(
            'is_closed',
            'isClosed',
            'Is closed',
            DimensionType.BOOLEAN,
            'Whether records in the stage are closed: won or lost deals, closed tickets.',
        ),
    ],
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

/** Deals first: an integration's first explore is its main one. */
const [DEALS, ...OTHER_OBJECTS] = HUBSPOT_OBJECTS.map(toObjectExplore);
export const HUBSPOT_EXPLORES: [
    LiveExploreDefinition,
    ...LiveExploreDefinition[],
] = [DEALS, ...OTHER_OBJECTS, PIPELINE_STAGES_EXPLORE];

/** One object's property list from a scan; anything else reads as none. */
export const readHubspotProperties = (
    scanned: unknown,
    object: string,
): unknown =>
    scanned !== null &&
    typeof scanned === 'object' &&
    Object.hasOwn(scanned, object)
        ? (scanned as Record<string, unknown>)[object]
        : undefined;

/** The CRM object an explore definition reads. */
export const toHubspotObject = (definitionName: string): HubspotObject => {
    const object = HUBSPOT_OBJECTS.find((name) => name === definitionName);
    if (!object) {
        throw new Error(`"${definitionName}" isn't a HubSpot object`);
    }
    return object;
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
/**
 * Pipelines and stages whose values are ids (tickets' stages are 1, 2, ...),
 * so their descriptions list every value with its label.
 */
const PIPELINE_PROPERTIES = new Set([
    'pipeline',
    'dealstage',
    'hs_pipeline',
    'hs_pipeline_stage',
]);
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
    'hs_pipeline',
    'hs_pipeline_stage',
    'hs_ticket_priority',
    'hs_ticket_category',
    'hs_lead_name',
    'hs_lead_type',
    'hs_lead_label',
]);

/** A label field's API name: the property it reads, then `:label`. */
export const HUBSPOT_LABEL_SUFFIX = ':label';

/** The property a field reads: itself, or the one a label field shows. */
export const toHubspotPropertyName = (apiName: string) =>
    apiName.endsWith(HUBSPOT_LABEL_SUFFIX)
        ? apiName.slice(0, -HUBSPOT_LABEL_SUFFIX.length)
        : apiName;

export const isInternalHubspotField = (apiName: string) => {
    const property = toHubspotPropertyName(apiName);
    return property.startsWith('hs_') && !USEFUL_HS_PROPERTIES.has(property);
};

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
    name,
    label,
    description,
    type,
    fieldType,
    options,
}: HubspotProperty) => {
    const listed = PIPELINE_PROPERTIES.has(name)
        ? (options ?? [])
        : (options ?? []).slice(0, MAX_LISTED_OPTIONS);
    const more = (options ?? []).length - listed.length;
    // HubSpot's own descriptions often end without a full stop
    const own = description?.trim().replace(/([^.!?])$/, '$1.');
    return [
        own || `The ${label} property in HubSpot.`,
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
 * Labels by internal value for a dropdown whose labels differ from its
 * values, such as deal stages and ticket pipeline stages; none otherwise.
 */
const toValueLabels = ({
    type,
    options,
}: HubspotProperty): Record<string, string> | null => {
    if (type !== 'enumeration' || !options || options.length === 0) {
        return null;
    }
    return options.some(({ value, label }) => value !== label)
        ? Object.fromEntries(options.map(({ value, label }) => [value, label]))
        : null;
};

/** A label field's description: the labels it shows, which filters take. */
const describeLabels = (property: HubspotProperty) => {
    const options = property.options ?? [];
    const listed = PIPELINE_PROPERTIES.has(property.name)
        ? options
        : options.slice(0, MAX_LISTED_OPTIONS);
    const more = options.length - listed.length;
    return [
        `${property.label} as HubSpot shows it, the option's label rather than its internal value.`,
        `Filter with these labels: ${listed
            .map(({ label }) => label)
            .join(', ')}${more > 0 ? ` and ${more} more` : ''}.`,
        property.fieldType === 'checkbox'
            ? 'Several values are separated by semicolons.'
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
    const names = new Set([
        ...RESERVED_NAMES,
        ...scanned.map(({ name }) => toDimensionName(name)),
    ]);
    const dimensions = scanned.flatMap(
        (property): LiveDimensionDefinition[] => {
            const raw: LiveDimensionDefinition = {
                name: toDimensionName(property.name),
                apiName: property.name,
                label: property.label,
                description: describeProperty(property),
                ...PROPERTY_RULES[property.type],
            };
            const labelName = `${raw.name}_label`;
            const valueLabels = toValueLabels(property);
            if (!valueLabels || names.has(labelName)) {
                return [raw];
            }
            names.add(labelName);
            return [
                {
                    ...raw,
                    // The label field takes HubSpot's own name for it
                    label: `${property.label} (internal value)`,
                },
                {
                    name: labelName,
                    apiName: `${property.name}${HUBSPOT_LABEL_SUFFIX}`,
                    label: property.label,
                    description: describeLabels(property),
                    type: DimensionType.STRING,
                    filterOperators: HUBSPOT_CHOICE_FILTERS,
                    valueLabels,
                },
            ];
        },
    );
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
    };
};
