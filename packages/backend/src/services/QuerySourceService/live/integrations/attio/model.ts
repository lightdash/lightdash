import {
    ApiConnectorType,
    ATTIO_OBJECTS,
    DimensionType,
    FilterOperator,
    getAttioAttributesPath,
    ParameterError,
    type AttioObject,
} from '@lightdash/common';
import { z } from 'zod';
import {
    defineLiveModel,
    dimension,
    pickLiveFields,
    withFieldsOffByDefault,
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveModel,
    type LiveRuntime,
} from '../../sdk';
import { ATTIO_MAX_RECORDS, AttioObjectAccessError } from './api';

export const ATTIO_TEXT_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
];

export const ATTIO_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
];

export const ATTIO_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

/** Select and status options match by title, exactly. */
export const ATTIO_CHOICE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const ATTIO_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

export const ATTIO_COMPANIES_EXPLORE: LiveExploreDefinition = {
    name: 'companies',
    label: 'Companies',
    description:
        'Company records in Attio, one row per company, with their attributes.',
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_PEOPLE_EXPLORE: LiveExploreDefinition = {
    name: 'people',
    label: 'People',
    description:
        'People records in Attio, one row per person, with their attributes.',
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_DEALS_EXPLORE: LiveExploreDefinition = {
    name: 'deals',
    label: 'Deals',
    description:
        'Deal records in Attio, one row per deal, with their attributes.',
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_USERS_EXPLORE: LiveExploreDefinition = {
    name: 'users',
    label: 'Users',
    description:
        "User records in Attio (users of your product, from Attio's Users object), one row per user, with their attributes.",
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

export const ATTIO_WORKSPACES_EXPLORE: LiveExploreDefinition = {
    name: 'workspaces',
    label: 'Workspaces',
    description:
        "Workspace records in Attio (your product's customer workspaces, from Attio's Workspaces object), one row per workspace, with their attributes.",
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString('en-US')} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'record_id',
            label: 'Record ID',
            type: DimensionType.STRING,
            filterOperators: ATTIO_CHOICE_FILTERS,
            description: "Attio's ID for the record.",
        }),
        dimension({
            name: 'web_url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to open the record in Attio.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: ATTIO_DATE_FILTERS,
            description: 'Day the record was created, in UTC.',
        }),
    ],
    metrics: [],
};

/** Companies first: an integration's first explore is its main one. */
export const ATTIO_EXPLORES = [
    ATTIO_COMPANIES_EXPLORE,
    ATTIO_PEOPLE_EXPLORE,
    ATTIO_DEALS_EXPLORE,
    ATTIO_USERS_EXPLORE,
    ATTIO_WORKSPACES_EXPLORE,
] as const;

/**
 * How Lightdash reads, filters and sorts one Attio attribute type. A field's
 * API name is the attribute's slug, then `.<property>` when the value keeps
 * what we read in a property of its own (`name.full_name`); compile and run
 * read the property back from the API name.
 */
type AttioAttributeRule = {
    type: DimensionType;
    /** The property of each value to read, when it isn't `value`. */
    property?: AttioValueProperty;
    filterOperators: FilterOperator[];
    /** Attio sorts it itself; the rest is sorted after reading. */
    sortable: boolean;
    /** Ids nobody reads, kept out of the default field list. */
    system: boolean;
};

export type AttioValueProperty =
    | 'currency_value'
    | 'option'
    | 'status'
    | 'full_name'
    | 'email_address'
    | 'domain'
    | 'original_phone_number'
    | 'address'
    | 'target_record_id'
    | 'referenced_actor_id'
    | 'interacted_at'
    // Derived: when the current status value started, and an owner's name
    | 'active_from'
    | 'member_name';

const rule = (
    type: DimensionType,
    overrides: Partial<AttioAttributeRule> = {},
): AttioAttributeRule => ({
    type,
    filterOperators: [],
    sortable: false,
    system: false,
    ...overrides,
});

/** Every attribute type Attio documents; any other type isn't scanned. */
export const ATTIO_ATTRIBUTE_RULES: Record<string, AttioAttributeRule> = {
    text: rule(DimensionType.STRING, {
        filterOperators: ATTIO_TEXT_FILTERS,
        sortable: true,
    }),
    number: rule(DimensionType.NUMBER, {
        filterOperators: ATTIO_NUMBER_FILTERS,
        sortable: true,
    }),
    rating: rule(DimensionType.NUMBER, {
        filterOperators: ATTIO_NUMBER_FILTERS,
        sortable: true,
    }),
    currency: rule(DimensionType.NUMBER, {
        property: 'currency_value',
        filterOperators: ATTIO_NUMBER_FILTERS,
        sortable: true,
    }),
    date: rule(DimensionType.DATE, {
        filterOperators: ATTIO_DATE_FILTERS,
        sortable: true,
    }),
    timestamp: rule(DimensionType.TIMESTAMP, {
        filterOperators: ATTIO_DATE_FILTERS,
        sortable: true,
    }),
    checkbox: rule(DimensionType.BOOLEAN, {
        filterOperators: ATTIO_BOOLEAN_FILTERS,
        sortable: true,
    }),
    select: rule(DimensionType.STRING, {
        property: 'option',
        filterOperators: ATTIO_CHOICE_FILTERS,
    }),
    status: rule(DimensionType.STRING, {
        property: 'status',
        filterOperators: ATTIO_CHOICE_FILTERS,
    }),
    'personal-name': rule(DimensionType.STRING, {
        property: 'full_name',
        filterOperators: ATTIO_TEXT_FILTERS,
        sortable: true,
    }),
    'email-address': rule(DimensionType.STRING, {
        property: 'email_address',
        filterOperators: ATTIO_TEXT_FILTERS,
    }),
    domain: rule(DimensionType.STRING, {
        property: 'domain',
        filterOperators: ATTIO_TEXT_FILTERS,
    }),
    'phone-number': rule(DimensionType.STRING, {
        property: 'original_phone_number',
    }),
    location: rule(DimensionType.STRING, { property: 'address' }),
    'record-reference': rule(DimensionType.STRING, {
        property: 'target_record_id',
        system: true,
    }),
    'actor-reference': rule(DimensionType.STRING, {
        property: 'referenced_actor_id',
        system: true,
    }),
    interaction: rule(DimensionType.TIMESTAMP, {
        property: 'interacted_at',
    }),
};

/**
 * Fields an attribute type adds next to its own, read from the same values.
 * Their names end in `__<suffix>`, which real slugs can't take.
 */
type AttioDerivedField = {
    suffix: string;
    label: (title: string) => string;
    description: (title: string) => string;
    /** Guidance only the AI agent reads. */
    aiHint?: string;
    type: DimensionType;
    property: AttioValueProperty;
};

export const ATTIO_DERIVED_FIELDS: Record<string, AttioDerivedField[]> = {
    status: [
        {
            suffix: 'entered_at',
            label: (title) => `${title} entered at`,
            description: (title) =>
                `When the record moved into its current ${title} value, in UTC.`,
            type: DimensionType.TIMESTAMP,
            property: 'active_from',
        },
    ],
    'actor-reference': [
        {
            suffix: 'name',
            label: (title) => `${title} name`,
            description: (title) => `Name of the workspace member in ${title}.`,
            aiHint: 'Empty when the access token lacks the user_management:read scope, or when the actor is not a workspace member.',
            type: DimensionType.STRING,
            property: 'member_name',
        },
    ],
};

const SYSTEM_PROPERTIES: ReadonlySet<string> = new Set(
    Object.values(ATTIO_ATTRIBUTE_RULES).flatMap(({ property, system }) =>
        system && property ? [property] : [],
    ),
);

/** An attribute's slug and the property of its values that a field reads. */
export const parseAttioApiName = (
    apiName: string,
): { slug: string; property: AttioValueProperty | null } => {
    const [slug, property] = apiName.split('.');
    return {
        slug,
        property: (property as AttioValueProperty | undefined) ?? null,
    };
};

export const toAttioApiName = (slug: string, property?: AttioValueProperty) =>
    property ? `${slug}.${property}` : slug;

export const isAttioSystemField = (apiName: string) => {
    const { property } = parseAttioApiName(apiName);
    return property !== null && SYSTEM_PROPERTIES.has(property);
};

/** Properties whose filters use Attio's shorthand, matching an option's title. */
export const isAttioChoiceProperty = (property: AttioValueProperty | null) =>
    property === 'option' || property === 'status';

/** Properties Attio sorts by as the sort's `field`. */
export const ATTIO_SORT_FIELDS: ReadonlySet<AttioValueProperty> = new Set([
    'currency_value',
    'full_name',
]);

/** Attributes the declared fields already read. */
const RECORD_SLUGS = new Set(['record_id', 'created_at']);

const MAX_SCANNED_ATTRIBUTES = 300;

// Slugs are lowercase snake case; anything else would break API names
const ATTIO_SLUG = /^[a-z0-9_]+$/;

const MULTISELECT_HINT =
    'Multi-select attribute: values are joined with commas.';

/** The object an explore definition reads. */
export const toAttioObject = (definitionName: string): AttioObject => {
    const object = ATTIO_OBJECTS.find(
        (candidate) => candidate === definitionName,
    );
    if (!object) {
        // A source last built when it read one object, before a refresh
        throw new ParameterError(
            "This Attio table is from before one source read every object. Refresh the source's fields in Live data sources, then use its Companies, People, Deals, Users or Workspaces table.",
        );
    }
    return object;
};

/** One object's attribute list from a scan; anything else reads as none. */
export const readAttioAttributes = (
    scanned: unknown,
    object: AttioObject,
): unknown =>
    scanned !== null &&
    typeof scanned === 'object' &&
    Object.hasOwn(scanned, object)
        ? (scanned as Record<string, unknown>)[object]
        : undefined;

/**
 * Names attribute fields can't take: declared fields, and fields of earlier
 * versions (created_at grains, count, total_*) that saved charts may still
 * name.
 */
const RESERVED_NAMES = new Set([
    // Every object's explore has the same declared fields
    ...ATTIO_COMPANIES_EXPLORE.dimensions.map(({ name }) => name),
    'created_at_week',
    'created_at_month',
    'created_at_year',
    'count',
]);

/** Name endings derived fields use, which attribute fields can't take. */
const DERIVED_SUFFIXES = Object.values(ATTIO_DERIVED_FIELDS).flatMap((fields) =>
    fields.map(({ suffix }) => `__${suffix}`),
);

/**
 * The field name of an attribute. It depends on the slug alone, so it never
 * changes as attributes come and go. A slug ending like a derived field
 * (`stage__entered_at`) is prefixed so the two can't collide.
 */
const toDimensionName = (slug: string) =>
    RESERVED_NAMES.has(slug) ||
    slug.startsWith('total_') ||
    DERIVED_SUFFIXES.some((suffix) => slug.endsWith(suffix))
        ? `attribute_${slug}`
        : slug;

const attributesSchema = z.object({
    data: z.array(
        z.object({
            api_slug: z.string(),
            title: z.string(),
            description: z.string().nullable().optional(),
            type: z.string(),
            is_archived: z.boolean().optional(),
            is_multiselect: z.boolean().optional(),
        }),
    ),
});

/**
 * Adds a dimension per attribute of the object. Unknown types and unreadable
 * lists add nothing.
 */
export const withAttioAttributeFields = <D extends LiveExploreDefinition>(
    definition: D,
    attributes: unknown,
): D => {
    const parsed = attributesSchema.safeParse(attributes);
    if (!parsed.success) {
        return definition;
    }
    const scanned = parsed.data.data
        .filter(
            ({ api_slug: slug, type, is_archived: isArchived }) =>
                !isArchived &&
                ATTIO_SLUG.test(slug) &&
                !RECORD_SLUGS.has(slug) &&
                Object.hasOwn(ATTIO_ATTRIBUTE_RULES, type),
        )
        .slice(0, MAX_SCANNED_ATTRIBUTES);
    const dimensions = scanned.flatMap(
        ({
            api_slug: slug,
            title,
            description,
            type,
            is_multiselect: isMultiselect,
        }): LiveDimensionDefinition[] => {
            const attributeRule = ATTIO_ATTRIBUTE_RULES[type];
            const name = toDimensionName(slug);
            const derived = (ATTIO_DERIVED_FIELDS[type] ?? []).map(
                (field): LiveDimensionDefinition => {
                    const aiHint = [
                        isMultiselect ? MULTISELECT_HINT : '',
                        field.aiHint ?? '',
                    ]
                        .filter(Boolean)
                        .join(' ');
                    return {
                        name: `${name}__${field.suffix}`,
                        apiName: toAttioApiName(slug, field.property),
                        label: field.label(title),
                        description: field.description(title),
                        ...(aiHint ? { aiHint } : {}),
                        type: field.type,
                        filterOperators: [],
                    };
                },
            );
            return [
                {
                    name,
                    apiName: toAttioApiName(slug, attributeRule.property),
                    label: title,
                    description:
                        description?.trim() ||
                        `The ${title} attribute in Attio.`,
                    ...(isMultiselect ? { aiHint: MULTISELECT_HINT } : {}),
                    type: attributeRule.type,
                    filterOperators: attributeRule.filterOperators,
                },
                ...derived,
            ];
        },
    );
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
    };
};

/**
 * Reads each object's attributes, which become its explore's fields. An
 * object the token can't read, or the workspace lacks, keeps its declared
 * fields; any other failed call, such as a throttled one, fails the scan so
 * the last good scan stays.
 */
export const scanAttioAttributes = async ({
    runtime,
}: {
    runtime: LiveRuntime;
}): Promise<unknown> => {
    const results = await Promise.allSettled(
        ATTIO_OBJECTS.map((object) =>
            runtime.fetch(
                {
                    method: 'GET',
                    path: getAttioAttributesPath(object),
                    body: undefined,
                },
                z.unknown(),
            ),
        ),
    );
    const failed = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    const [unexpected] = failed.filter(
        (error) => !(error instanceof AttioObjectAccessError),
    );
    if (unexpected !== undefined) {
        throw unexpected;
    }
    const read = ATTIO_OBJECTS.flatMap((object, index) => {
        const result = results[index];
        return result.status === 'fulfilled' ? [[object, result.value]] : [];
    });
    if (read.length === 0) {
        throw failed[0];
    }
    return { attributes: Object.fromEntries(read) };
};

export const attioModel: LiveModel<ApiConnectorType.ATTIO> = defineLiveModel({
    explores: ATTIO_EXPLORES,
    // Every object's explore gets the attributes the workspace has
    scan: scanAttioAttributes,
    metadata: z.object({
        attributes: z.record(
            z.string(),
            attributesSchema.optional().catch(undefined),
        ),
    }),
    extend: ({ attributes }) => ({
        fields: Object.fromEntries(
            ATTIO_EXPLORES.map((definition) => [
                definition.name,
                pickLiveFields(
                    withFieldsOffByDefault(
                        definition,
                        withAttioAttributeFields(
                            definition,
                            readAttioAttributes(
                                attributes,
                                toAttioObject(definition.name),
                            ),
                        ),
                        isAttioSystemField,
                    ),
                ),
            ]),
        ),
    }),
});
