import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import { z } from 'zod';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';
import {
    ATTIO_ATTRIBUTE_RULES,
    ATTIO_DATE_FILTERS,
    toAttioApiName,
} from './attributes';

/** Records one query reads; one fewer than 20 pages of 500, to detect more. */
export const ATTIO_PAGE_SIZE = 500;
export const ATTIO_MAX_PAGES = 20;
export const ATTIO_MAX_RECORDS = ATTIO_PAGE_SIZE * ATTIO_MAX_PAGES - 1;

/**
 * Records a grouped query reads: one page, one fewer than its 500 to detect
 * more. Records are large, and grouping reads every one.
 */
export const ATTIO_MAX_GROUPED_RECORDS = ATTIO_PAGE_SIZE - 1;

const COUNT: LiveMetricDefinition = {
    name: 'count',
    apiName: 'count',
    label: 'Count',
    description: `How many records match the filters, counted from the records read. A query that matches more than ${ATTIO_MAX_GROUPED_RECORDS} records is refused.`,
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
    computed: { type: 'count' },
};

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
        description: "The record's id in Attio.",
        type: DimensionType.STRING,
        filterOperators: [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS],
    },
    {
        name: 'web_url',
        apiName: 'web_url',
        label: 'URL',
        description: 'Link to the record in Attio.',
        type: DimensionType.STRING,
        filterOperators: [],
    },
    {
        name: 'created_at',
        apiName: 'created_at',
        label: 'Created',
        description: 'The day the record was created, in UTC.',
        type: DimensionType.DATE,
        filterOperators: ATTIO_DATE_FILTERS,
    },
];

/** The built-in fields a record always has; a scan adds the object's attributes. */
export const ATTIO_RECORDS_EXPLORE: LiveExploreDefinition = {
    name: 'records',
    label: 'Records',
    description: `Records of one Attio object, read live from Attio, one row per record, at most ${ATTIO_MAX_RECORDS.toLocaleString(
        'en-US',
    )} per query. With Count selected, rows are grouped by the selected dimensions, over at most ${ATTIO_MAX_GROUPED_RECORDS} records.`,
    dimensions: BUILT_IN_DIMENSIONS,
    metrics: [COUNT],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

/**
 * Names attribute fields can't take: built-in fields, Count, and fields of
 * earlier versions (created_at grains, total_*) that saved charts may still
 * name.
 */
const RESERVED_NAMES = new Set([
    ...BUILT_IN_DIMENSIONS.map(({ name }) => name),
    'created_at_week',
    'created_at_month',
    'created_at_year',
    'count',
]);

/**
 * The field name of an attribute. It depends on the slug alone, so it never
 * changes as attributes come and go.
 */
const toDimensionName = (slug: string) =>
    RESERVED_NAMES.has(slug) || slug.startsWith('total_')
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
    const dimensions = scanned.map(
        ({
            api_slug: slug,
            title,
            description,
            type,
            is_multiselect: isMultiselect,
        }): LiveDimensionDefinition => {
            const rule = ATTIO_ATTRIBUTE_RULES[type];
            return {
                name: toDimensionName(slug),
                apiName: toAttioApiName(slug, rule.property),
                label: title,
                description: [
                    description?.trim() || `The ${title} attribute in Attio.`,
                    isMultiselect
                        ? 'Several values are joined with commas.'
                        : '',
                ]
                    .filter(Boolean)
                    .join(' '),
                type: rule.type,
                filterOperators: rule.filterOperators,
            };
        },
    );
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
    };
};
