import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    getHubspotPropertiesPath,
    HUBSPOT_OBJECTS,
    MetricType,
} from '@lightdash/common';
import { z } from 'zod';
import {
    ADDITIVE,
    defineLiveModel,
    dimension,
    keepParsed,
    metric,
    withFieldsOffByDefault,
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveModel,
    type LiveRuntime,
} from '../../sdk';
import {
    HUBSPOT_LABEL_SUFFIX,
    HUBSPOT_MAX_FILTERS,
    HUBSPOT_MAX_ROWS,
    isUnreadableObjectError,
} from './api';

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

export const HUBSPOT_DEALS_EXPLORE: LiveExploreDefinition = {
    name: 'deals',
    label: 'Deals',
    description: 'Deals in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the declared fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of deals that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_CONTACTS_EXPLORE: LiveExploreDefinition = {
    name: 'contacts',
    label: 'Contacts',
    description:
        'Contacts in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the declared fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of contacts that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_COMPANIES_EXPLORE: LiveExploreDefinition = {
    name: 'companies',
    label: 'Companies',
    description:
        'Companies in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the declared fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of companies that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_TICKETS_EXPLORE: LiveExploreDefinition = {
    name: 'tickets',
    label: 'Tickets',
    description:
        'Tickets in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the declared fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of tickets that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const HUBSPOT_LEADS_EXPLORE: LiveExploreDefinition = {
    name: 'leads',
    label: 'Leads',
    description: 'Leads in HubSpot, one row per record, with their properties.',
    aiHint: `Read live from HubSpot search, one row per record; listing reads at most ${HUBSPOT_MAX_ROWS.toLocaleString('en-US')} records. Count is HubSpot's search total for the filters (one call, any size) and cannot be split by any field: query Count alone with filters, or list records without Count. At most ${HUBSPOT_MAX_FILTERS} filters per query. Dropdown properties come as two fields: the internal value and the label HubSpot shows; filter the label field with labels and the internal-value field with internal values. Checkbox (multi-select) values are separated by semicolons. Text 'contains' matches whole words or part of a word. Most hs_ properties start hidden. Pipeline and stage IDs map to labels via the Pipeline stages explore.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    // The shared check only sees the declared fields here; compile refuses Count
    // with a scanned property, which the explore's rules don't name.
    incompatible: [
        {
            fields: ['count'],
            with: ['record_id', 'created_at', 'updated_at'],
            reason: "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'record_id',
            apiName: 'id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: "HubSpot's ID for the record.",
        }),
        dimension({
            name: 'created_at',
            apiName: 'createdAt',
            label: 'Create Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record was created, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            apiName: 'updatedAt',
            label: 'Last Modified Date',
            type: DimensionType.TIMESTAMP,
            filterOperators: HUBSPOT_DATE_FILTERS,
            description: 'When the record last changed, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of leads that match the filters.',
            aiHint: "HubSpot's search total: cannot be split by any field. Query it alone with filters, or list records without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

/**
 * Every deal and ticket pipeline with its stages, one row per stage, from
 * HubSpot's pipelines API: one call per object. Records hold stage and
 * pipeline ids, so this explains them and can be merged with them.
 */
export const HUBSPOT_PIPELINE_STAGES_EXPLORE: LiveExploreDefinition = {
    name: 'pipeline_stages',
    label: 'Pipeline stages',
    description:
        'Deal and ticket pipelines in HubSpot and their stages, one row per stage, with the names HubSpot shows.',
    aiHint: 'Use to translate IDs: Stage ID matches Deal Stage (internal value) on deals and Ticket status (internal value) on tickets; Pipeline ID matches Pipeline (internal value). Filter Object to Deals or Tickets to read only one. No metrics; count rows if needed.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'object_type',
            apiName: 'objectType',
            label: 'Object',
            type: DimensionType.STRING,
            filterOperators: HUBSPOT_CHOICE_FILTERS,
            description: 'Object the pipeline belongs to: Deals or Tickets.',
        }),
        dimension({
            name: 'pipeline_id',
            apiName: 'pipelineId',
            label: 'Pipeline ID',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "Pipeline's internal ID, as records store it.",
            aiHint: 'Matches Pipeline (internal value) on deals and tickets.',
        }),
        dimension({
            name: 'pipeline_label',
            apiName: 'pipelineLabel',
            label: 'Pipeline',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Pipeline name as HubSpot shows it.',
        }),
        dimension({
            name: 'pipeline_display_order',
            apiName: 'pipelineDisplayOrder',
            label: 'Pipeline order',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                "Pipeline's position in HubSpot's list, starting at 0.",
        }),
        dimension({
            name: 'stage_id',
            apiName: 'stageId',
            label: 'Stage ID',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "Stage's internal ID, as records store it.",
            aiHint: 'Matches Deal Stage (internal value) on deals and Ticket status (internal value) on tickets.',
        }),
        dimension({
            name: 'stage_label',
            apiName: 'stageLabel',
            label: 'Stage',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Stage name as HubSpot shows it.',
        }),
        dimension({
            name: 'stage_display_order',
            apiName: 'stageDisplayOrder',
            label: 'Stage order',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: "Stage's position in its pipeline, starting at 0.",
        }),
        dimension({
            name: 'probability',
            label: 'Deal probability',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description:
                'For deal stages, the probability that a deal in this stage closes as won, from 0 to 1. Empty for ticket stages.',
        }),
        dimension({
            name: 'is_closed',
            apiName: 'isClosed',
            label: 'Is closed',
            type: DimensionType.BOOLEAN,
            filterOperators: [],
            description:
                'Whether records in this stage are closed: won or lost deals, or closed tickets.',
        }),
    ],
    metrics: [],
};

/** Deals first: an integration's first explore is its main one. */
export const HUBSPOT_EXPLORES = [
    HUBSPOT_DEALS_EXPLORE,
    HUBSPOT_CONTACTS_EXPLORE,
    HUBSPOT_COMPANIES_EXPLORE,
    HUBSPOT_TICKETS_EXPLORE,
    HUBSPOT_LEADS_EXPLORE,
    HUBSPOT_PIPELINE_STAGES_EXPLORE,
] as const;

/** Properties the declared fields already read. */
const DECLARED_PROPERTIES = new Set([
    'hs_object_id',
    'createdate',
    'hs_createdate',
    'hs_lastmodifieddate',
    'lastmodifieddate',
]);

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

/** The property a field reads: itself, or the one a label field shows. */
export const toHubspotPropertyName = (apiName: string) =>
    apiName.endsWith(HUBSPOT_LABEL_SUFFIX)
        ? apiName.slice(0, -HUBSPOT_LABEL_SUFFIX.length)
        : apiName;

export const isHubspotSystemField = (apiName: string) => {
    const property = toHubspotPropertyName(apiName);
    return property.startsWith('hs_') && !USEFUL_HS_PROPERTIES.has(property);
};

/**
 * Names properties can't take: the declared fields and Count. A property
 * named like one gets a prefix, from its name alone, so it never changes.
 */
const RESERVED_NAMES = new Set([
    // Every object's explore has the same declared fields
    ...HUBSPOT_DEALS_EXPLORE.dimensions.map(({ name }) => name),
    ...HUBSPOT_DEALS_EXPLORE.metrics.map(({ name }) => name),
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

const describeProperty = ({ label, description }: HubspotProperty) => {
    // HubSpot's own descriptions often end without a full stop
    const own = description?.trim().replace(/([^.!?])$/, '$1.');
    return own || `The ${label} property in HubSpot.`;
};

/** How to filter a property: its option names, checkbox and text rules. */
const hintProperty = ({ name, type, fieldType, options }: HubspotProperty) => {
    const listed = PIPELINE_PROPERTIES.has(name)
        ? (options ?? [])
        : (options ?? []).slice(0, MAX_LISTED_OPTIONS);
    const more = (options ?? []).length - listed.length;
    return [
        type === 'enumeration' && listed.length > 0
            ? `Values are HubSpot's internal option names: ${listed
                  .map(({ value, label: title }) =>
                      value === title ? value : `${value} (${title})`,
                  )
                  .join(', ')}${more > 0 ? ` and ${more} more` : ''}.`
            : '',
        fieldType === 'checkbox'
            ? 'Checkbox values are separated by semicolons.'
            : '',
        type === 'string'
            ? "Text 'contains' matches whole words or part of one word."
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

/** How to filter a label field: the labels it shows, which filters take. */
const hintLabels = (property: HubspotProperty) => {
    const options = property.options ?? [];
    const listed = PIPELINE_PROPERTIES.has(property.name)
        ? options
        : options.slice(0, MAX_LISTED_OPTIONS);
    const more = options.length - listed.length;
    return [
        `Filter with these labels: ${listed
            .map(({ label }) => label)
            .join(', ')}${more > 0 ? ` and ${more} more` : ''}.`,
        property.fieldType === 'checkbox'
            ? 'Checkbox values are separated by semicolons.'
            : '',
        `The raw field is renamed "${property.label} (internal value)".`,
    ]
        .filter(Boolean)
        .join(' ');
};

/**
 * Adds a dimension per property of the object, people's own before
 * HubSpot's hs_ ones. Unknown types and unreadable lists add nothing.
 */
export const withHubspotPropertyFields = <D extends LiveExploreDefinition>(
    definition: D,
    properties: unknown,
): D => {
    const parsed = propertiesSchema.safeParse(properties);
    if (!parsed.success) {
        return definition;
    }
    const kept = parsed.data.results.filter(
        ({ name, type, hidden }) =>
            !hidden &&
            PROPERTY_NAME.test(name) &&
            !DECLARED_PROPERTIES.has(name) &&
            Object.hasOwn(PROPERTY_RULES, type),
    );
    const scanned = [
        ...kept.filter(({ name }) => !isHubspotSystemField(name)),
        ...kept.filter(({ name }) => isHubspotSystemField(name)),
    ].slice(0, MAX_SCANNED_PROPERTIES);
    const names = new Set([
        ...RESERVED_NAMES,
        ...scanned.map(({ name }) => toDimensionName(name)),
    ]);
    const dimensions = scanned.flatMap(
        (property): LiveDimensionDefinition[] => {
            const aiHint = hintProperty(property);
            const raw: LiveDimensionDefinition = {
                name: toDimensionName(property.name),
                apiName: property.name,
                label: property.label,
                description: describeProperty(property),
                ...(aiHint ? { aiHint } : {}),
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
                    description: `${property.label} as HubSpot shows it, using the option's label rather than its internal value.`,
                    aiHint: hintLabels(property),
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

/** Each object's property list, as HubSpot returns it. */
export type HubspotScan = { hubspotProperties?: unknown };

/**
 * Reads each object's properties, which become its explore's fields: one
 * call per object. An object the token can't read is left out, so the others
 * still build and querying it says which scope is missing. Any other
 * failure, such as a timeout or rate limit, fails the scan and keeps the
 * last one.
 */
export const scanHubspotProperties = async ({
    runtime,
}: {
    runtime: LiveRuntime;
}): Promise<HubspotScan> => {
    const lists = await Promise.allSettled(
        HUBSPOT_OBJECTS.map((object) =>
            runtime.fetch(
                {
                    method: 'GET',
                    path: getHubspotPropertiesPath(object),
                    body: undefined,
                },
                z.unknown(),
            ),
        ),
    );
    const rejected = lists.flatMap((list) =>
        list.status === 'rejected' ? [list.reason as unknown] : [],
    );
    const failure = rejected.find((error) => !isUnreadableObjectError(error));
    if (failure !== undefined || rejected.length === lists.length) {
        throw failure ?? rejected[0];
    }
    return {
        hubspotProperties: Object.fromEntries(
            HUBSPOT_OBJECTS.flatMap((object, index) => {
                const list = lists[index];
                return list.status === 'fulfilled'
                    ? [[object, keepParsed(propertiesSchema, list.value)]]
                    : [];
            }),
        ),
    };
};

export const hubspotModel: LiveModel<ApiConnectorType.HUBSPOT> =
    defineLiveModel({
        explores: HUBSPOT_EXPLORES,
        // Every object's explore gets the properties the account has
        scan: scanHubspotProperties,
        metadata: z.object({ hubspotProperties: z.unknown() }),
        extend: ({ hubspotProperties }) =>
            HUBSPOT_EXPLORES.map((definition) =>
                withFieldsOffByDefault(
                    definition,
                    withHubspotPropertyFields(
                        definition,
                        readHubspotProperties(
                            hubspotProperties,
                            definition.name,
                        ),
                    ),
                    isHubspotSystemField,
                ),
            ),
    });
