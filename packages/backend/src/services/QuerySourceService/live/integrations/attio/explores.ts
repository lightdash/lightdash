import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
} from '@lightdash/common';
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

/** Attributes the built-in fields already read. */
const BUILT_IN_SLUGS = new Set(['record_id', 'created_at']);
const MAX_SCANNED_ATTRIBUTES = 300;
// Slugs are lowercase snake case; anything else would break API names
const ATTIO_SLUG = /^[a-z0-9_]+$/;

const createdAtGrain = (
    grain: TimeFrames,
    suffix: string,
    label: string,
    description: string,
): LiveDimensionDefinition => ({
    name: `created_at_${suffix}`,
    apiName: `created_at_${suffix}`,
    label,
    description,
    type: DimensionType.DATE,
    filterOperators: [],
    timeInterval: { base: 'created_at', grain },
});

export const ATTIO_COUNT: LiveMetricDefinition = {
    name: 'count',
    apiName: 'count',
    label: 'Count',
    description:
        'How many records match the filters, counted from the records read.',
    type: MetricType.COUNT,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
};

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
        timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
    },
    createdAtGrain(
        TimeFrames.WEEK,
        'week',
        'Created week',
        'Monday of the week the record was created, in UTC. Filter Created to choose the weeks.',
    ),
    createdAtGrain(
        TimeFrames.MONTH,
        'month',
        'Created month',
        'First day of the month the record was created, in UTC. Filter Created to choose the months.',
    ),
    createdAtGrain(
        TimeFrames.YEAR,
        'year',
        'Created year',
        'First day of the year the record was created, in UTC. Filter Created to choose the years.',
    ),
];

/** The built-in fields a record always has; a scan adds the object's attributes. */
export const ATTIO_RECORDS_EXPLORE: LiveExploreDefinition = {
    name: 'records',
    label: 'Records',
    description: `Records of one Attio object, read live from Attio. Count and totals are computed from the matching records, at most ${ATTIO_MAX_RECORDS.toLocaleString(
        'en-US',
    )} per query.`,
    dimensions: BUILT_IN_DIMENSIONS,
    metrics: [ATTIO_COUNT],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

const BUILT_IN_NAMES = new Set([
    ...BUILT_IN_DIMENSIONS.map(({ name }) => name),
    ATTIO_COUNT.name,
]);

/**
 * The field name of an attribute. It depends on the slug alone, so it never
 * changes as attributes come and go.
 */
const toDimensionName = (slug: string) =>
    BUILT_IN_NAMES.has(slug) || slug.startsWith('total_')
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
 * Adds a dimension per attribute of the object, and a total per number and
 * currency attribute. Unknown types and unreadable lists add nothing.
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
    const metrics = scanned
        .filter(({ type }) => ATTIO_ATTRIBUTE_RULES[type].summable)
        .map(
            ({ api_slug: slug, title, type }): LiveMetricDefinition => ({
                name: `total_${slug}`,
                apiName: `total:${toAttioApiName(
                    slug,
                    ATTIO_ATTRIBUTE_RULES[type].property,
                )}`,
                label: `Total ${title}`,
                description:
                    type === 'currency'
                        ? `Sum of ${title} over the matching records, as stored, whatever each record's currency.`
                        : `Sum of ${title} over the matching records.`,
                type: MetricType.SUM,
                filterOperators: [],
                aggregation: { aggregation: 'additive' },
            }),
        );
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
        metrics: [...definition.metrics, ...metrics],
    };
};
