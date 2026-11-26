import {
    ATTIO_OBJECTS,
    DimensionType,
    FilterOperator,
    ParameterError,
    type AttioObject,
} from '@lightdash/common';
import { z } from 'zod';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
} from '../../explores/definition';
import {
    ATTIO_ATTRIBUTE_RULES,
    ATTIO_DATE_FILTERS,
    ATTIO_DERIVED_FIELDS,
    toAttioApiName,
} from './attributes';

/** Records one query reads; one fewer than 20 pages of 500, to detect more. */
export const ATTIO_PAGE_SIZE = 500;
export const ATTIO_MAX_PAGES = 20;
export const ATTIO_MAX_RECORDS = ATTIO_PAGE_SIZE * ATTIO_MAX_PAGES - 1;

/** Attributes the built-in fields already read. */
const BUILT_IN_SLUGS = new Set(['record_id', 'created_at']);
const MAX_SCANNED_ATTRIBUTES = 300;
// Slugs are lowercase snake case; anything else would break API names
const ATTIO_SLUG = /^[a-z0-9_]+$/;

const BUILT_IN_DIMENSIONS: LiveDimensionDefinition[] = [
    {
        name: 'record_id',
        apiName: 'record_id',
        label: 'Record ID',
        description: "Attio's ID for the record.",
        type: DimensionType.STRING,
        filterOperators: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
    },
    {
        name: 'web_url',
        apiName: 'web_url',
        label: 'URL',
        description: 'Link to open the record in Attio.',
        type: DimensionType.STRING,
        filterOperators: [],
    },
    {
        name: 'created_at',
        apiName: 'created_at',
        label: 'Created',
        description: 'Day the record was created, in UTC.',
        type: DimensionType.DATE,
        filterOperators: ATTIO_DATE_FILTERS,
    },
];

/** Each object's explore label, as Attio's sidebar names it. */
const OBJECT_LABELS: Record<AttioObject, string> = {
    companies: 'Companies',
    people: 'People',
    deals: 'Deals',
    users: 'Users',
    workspaces: 'Workspaces',
};

/** What each object's records are, for people browsing the explore. */
const OBJECT_DESCRIPTIONS: Record<AttioObject, string> = {
    companies:
        'Company records in Attio, one row per company, with their attributes.',
    people: 'People records in Attio, one row per person, with their attributes.',
    deals: 'Deal records in Attio, one row per deal, with their attributes.',
    users: "User records in Attio (users of your product, from Attio's Users object), one row per user, with their attributes.",
    workspaces:
        "Workspace records in Attio (your product's customer workspaces, from Attio's Workspaces object), one row per workspace, with their attributes.",
};

const MULTISELECT_HINT =
    'Multi-select attribute: values are joined with commas.';

/**
 * One object's built-in fields, which every record has; a scan adds the
 * object's attributes. The explore is named by the object's slug.
 */
const toObjectExplore = (object: AttioObject): LiveExploreDefinition => ({
    name: object,
    label: OBJECT_LABELS[object],
    description: OBJECT_DESCRIPTIONS[object],
    aiHint: `Read live, one row per record; a query lists at most ${ATTIO_MAX_RECORDS.toLocaleString(
        'en-US',
    )} records. There is no Count metric: count or sum by aggregating rows in the query. Multi-select attributes join several values with commas. Owner name fields are empty when the access token lacks the user_management:read scope.`,
    dimensions: BUILT_IN_DIMENSIONS,
    metrics: [],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
});

/** Companies first: an integration's first explore is its main one. */
export const ATTIO_EXPLORES = ATTIO_OBJECTS.map(toObjectExplore) as [
    LiveExploreDefinition,
    ...LiveExploreDefinition[],
];

/** Names of the explores scans add fields to besides the first. */
export const ATTIO_SCANNED_MODELS = ATTIO_EXPLORES.slice(1).map(
    ({ name }) => name,
);

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
 * Names attribute fields can't take: built-in fields, and fields of earlier
 * versions (created_at grains, count, total_*) that saved charts may still
 * name.
 */
const RESERVED_NAMES = new Set([
    ...BUILT_IN_DIMENSIONS.map(({ name }) => name),
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
export const withAttioAttributeFields = (
    definition: LiveExploreDefinition,
    attributes: unknown,
): LiveExploreDefinition => {
    const parsed = attributesSchema.safeParse(attributes);
    if (!parsed.success) {
        return definition;
    }
    const scanned = parsed.data.data
        .filter(
            ({ api_slug: slug, type, is_archived: isArchived }) =>
                !isArchived &&
                ATTIO_SLUG.test(slug) &&
                !BUILT_IN_SLUGS.has(slug) &&
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
            const rule = ATTIO_ATTRIBUTE_RULES[type];
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
                    apiName: toAttioApiName(slug, rule.property),
                    label: title,
                    description:
                        description?.trim() ||
                        `The ${title} attribute in Attio.`,
                    ...(isMultiselect ? { aiHint: MULTISELECT_HINT } : {}),
                    type: rule.type,
                    filterOperators: rule.filterOperators,
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
