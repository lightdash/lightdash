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

/** Salesforce returns query results in batches of up to 2,000 records. */
export const SALESFORCE_BATCH_SIZE = 2_000;
/** Record lists read at most this many rows: 5 batches with the extra row. */
export const SALESFORCE_MAX_RECORD_ROWS = 9_999;
export const SALESFORCE_MAX_CALLS = Math.ceil(
    (SALESFORCE_MAX_RECORD_ROWS + 1) / SALESFORCE_BATCH_SIZE,
);
/**
 * A query with aggregate functions comes back in one batch: Salesforce
 * refuses it past 2,000 rows (no queryMore), so its LIMIT never goes higher.
 */
export const SALESFORCE_MAX_AGGREGATE_ROWS = 2_000;

export const SALESFORCE_TEXT_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

/** Picklists and ids match whole values. */
export const SALESFORCE_CHOICE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const SALESFORCE_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const SALESFORCE_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const SALESFORCE_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

/** HAVING compares a metric with a number. */
export const SALESFORCE_METRIC_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
];

/** The coarser grains of a date, each a SOQL date function. */
const GRAINS = [
    {
        suffix: 'month',
        fn: 'CALENDAR_MONTH',
        label: 'month',
        grain: TimeFrames.MONTH,
    },
    {
        suffix: 'quarter',
        fn: 'CALENDAR_QUARTER',
        label: 'quarter',
        grain: TimeFrames.QUARTER,
    },
    {
        suffix: 'year',
        fn: 'CALENDAR_YEAR',
        label: 'year',
        grain: TimeFrames.YEAR,
    },
] as const;

const grainDescription = (label: string, grain: string) =>
    `${label} by ${grain}, as the ${grain}'s first day. Salesforce groups it with its CALENDAR functions, in UTC. Filter by ${label} itself.`;

/** Fields every object has; a scan adds the object's own. */
const BUILT_IN_DIMENSIONS: LiveDimensionDefinition[] = [
    {
        name: 'record_id',
        apiName: 'Id',
        label: 'Record ID',
        description: "The record's 18-character Salesforce ID.",
        type: DimensionType.STRING,
        filterOperators: SALESFORCE_CHOICE_FILTERS.filter(
            (operator) =>
                operator !== FilterOperator.NULL &&
                operator !== FilterOperator.NOT_NULL,
        ),
    },
    {
        name: 'created_at',
        apiName: 'CreatedDate',
        label: 'Created',
        description:
            'When the record was created, in UTC. Lists show it as is; totals group it by day, month, quarter or year.',
        type: DimensionType.TIMESTAMP,
        filterOperators: SALESFORCE_DATE_FILTERS,
    },
    {
        name: 'created_at_day',
        apiName: 'DAY_ONLY(CreatedDate)',
        label: 'Created day',
        description: 'The day the record was created, in UTC.',
        type: DimensionType.DATE,
        filterOperators: SALESFORCE_DATE_FILTERS,
        timeInterval: { base: 'created_at', grain: TimeFrames.DAY },
    },
    ...GRAINS.map(
        ({ suffix, fn, label, grain }): LiveDimensionDefinition => ({
            name: `created_at_${suffix}`,
            apiName: `${fn}(CreatedDate)`,
            label: `Created ${label}`,
            description: grainDescription('Created', label),
            type: DimensionType.DATE,
            filterOperators: [],
            timeInterval: { base: 'created_at', grain },
        }),
    ),
];

const COUNT: LiveMetricDefinition = {
    name: 'count',
    apiName: 'COUNT(Id)',
    label: 'Count',
    description:
        'How many records match, counted by Salesforce: one call, whatever the number of records.',
    type: MetricType.COUNT,
    filterOperators: SALESFORCE_METRIC_FILTERS,
    aggregation: { aggregation: 'additive' },
};

export const SALESFORCE_RECORDS_EXPLORE: LiveExploreDefinition = {
    name: 'records',
    label: 'Records',
    description: `Records of one Salesforce object, read live with SOQL. With a metric, Salesforce groups and totals the records itself and returns at most ${SALESFORCE_MAX_AGGREGATE_ROWS.toLocaleString(
        'en-US',
    )} rows, in one call. Without one, it lists records, at most ${SALESFORCE_MAX_RECORD_ROWS.toLocaleString(
        'en-US',
    )} per query.`,
    dimensions: BUILT_IN_DIMENSIONS,
    metrics: [COUNT],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

const describeFieldSchema = z.object({
    name: z.string(),
    label: z.string(),
    type: z.string(),
    groupable: z.boolean().optional(),
    filterable: z.boolean().optional(),
    aggregatable: z.boolean().optional(),
    calculated: z.boolean().optional(),
    deprecatedAndHidden: z.boolean().optional(),
    inlineHelpText: z.string().nullable().optional(),
    relationshipName: z.string().nullable().optional(),
    referenceTo: z.array(z.string()).optional(),
    picklistValues: z
        .array(
            z.object({
                value: z.string(),
                label: z.string().nullable().optional(),
                active: z.boolean().optional(),
            }),
        )
        .optional(),
});

const describeSchema = z.object({
    name: z.string(),
    fields: z.array(describeFieldSchema),
});

type DescribeField = z.infer<typeof describeFieldSchema>;

/** API names: letters, digits and single underscores, custom ones ending in __c. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const MAX_SCANNED_FIELDS = 400;
const MAX_LISTED_VALUES = 25;

/** Fields the built-in ones already read. */
const BUILT_IN_API_NAMES = new Set(['Id', 'CreatedDate']);

/** Lookups whose target always has a Name field, so `Owner.Name` reads. */
const NAMED_OBJECTS = new Set([
    'Account',
    'Campaign',
    'Contact',
    'Contract',
    'Group',
    'Lead',
    'Opportunity',
    'Pricebook2',
    'RecordType',
    'User',
]);

/** Bookkeeping fields people rarely read; scanned, but start hidden. */
const SYSTEM_FIELDS = new Set([
    'IsDeleted',
    'MasterRecordId',
    'CreatedById',
    'LastModifiedById',
    'SystemModstamp',
    'LastActivityDate',
    'LastViewedDate',
    'LastReferencedDate',
    'Jigsaw',
    'JigsawCompanyId',
    'JigsawContactId',
    'PhotoUrl',
    'CleanStatus',
    'ConnectionReceivedId',
    'ConnectionSentId',
]);

/** Minimums and maximums, and system fields, start hidden from the field list. */
export const isInternalSalesforceField = (apiName: string) => {
    if (/^(MIN|MAX)\(/.test(apiName)) return true;
    const field = apiName.replace(/^[A-Z_]+\((.*)\)$/, '$1').split('.')[0];
    return SYSTEM_FIELDS.has(field) || SYSTEM_FIELDS.has(`${field}Id`);
};

const RESERVED_NAMES = new Set([
    ...BUILT_IN_DIMENSIONS.map(({ name }) => name),
    COUNT.name,
]);

/**
 * A field's name, from its API name alone so it never changes. API names
 * are unique ignoring case, and none has a double underscore before its
 * end, so `__month` and `__sum` suffixes can't meet another field.
 */
const toName = (apiName: string, suffix?: string) => {
    const base = apiName.toLowerCase();
    const name = suffix ? `${base}__${suffix}` : base;
    return RESERVED_NAMES.has(name) ? `field_${name}` : name;
};

const describeValues = (field: DescribeField) => {
    const active = (field.picklistValues ?? []).filter(
        ({ active: isActive }) => isActive !== false,
    );
    if (active.length === 0) return '';
    const listed = active.slice(0, MAX_LISTED_VALUES);
    const more = active.length - listed.length;
    return `Values: ${listed
        .map(({ value, label }) =>
            label && label !== value ? `${value} (${label})` : value,
        )
        .join(', ')}${more > 0 ? ` and ${more} more` : ''}.`;
};

const describe = (field: DescribeField, extra = '') =>
    [
        field.inlineHelpText?.trim() ||
            `The ${field.label} field in Salesforce (${field.name}).`,
        describeValues(field),
        extra,
    ]
        .filter(Boolean)
        .join(' ');

const textFilters = (field: DescribeField, operators: FilterOperator[]) =>
    field.filterable === false ? [] : operators;

const toDimensions = (field: DescribeField): LiveDimensionDefinition[] => {
    const { name: apiName, label, type } = field;
    switch (type) {
        case 'string':
        case 'email':
        case 'phone':
        case 'url':
        case 'combobox':
            return field.groupable
                ? [
                      {
                          name: toName(apiName),
                          apiName,
                          label,
                          description: describe(field),
                          type: DimensionType.STRING,
                          filterOperators: textFilters(
                              field,
                              SALESFORCE_TEXT_FILTERS,
                          ),
                      },
                  ]
                : [];
        case 'picklist':
        case 'id':
            return field.groupable
                ? [
                      {
                          name: toName(apiName),
                          apiName,
                          label,
                          description: describe(field),
                          type: DimensionType.STRING,
                          filterOperators: textFilters(
                              field,
                              SALESFORCE_CHOICE_FILTERS,
                          ),
                      },
                  ]
                : [];
        case 'reference': {
            const ids: LiveDimensionDefinition[] = field.groupable
                ? [
                      {
                          name: toName(apiName),
                          apiName,
                          label,
                          description: describe(field),
                          type: DimensionType.STRING,
                          filterOperators: textFilters(
                              field,
                              SALESFORCE_CHOICE_FILTERS,
                          ),
                      },
                  ]
                : [];
            const { relationshipName, referenceTo = [] } = field;
            const isNamed =
                relationshipName &&
                FIELD_NAME.test(relationshipName) &&
                referenceTo.length > 0 &&
                referenceTo.every((target) => NAMED_OBJECTS.has(target));
            if (!isNamed) return ids;
            return [
                ...ids,
                {
                    name: toName(relationshipName, 'name'),
                    apiName: `${relationshipName}.Name`,
                    label: `${label.replace(/ ID$/, '')} name`,
                    description: `The name of the ${referenceTo.join(
                        ' or ',
                    )} in ${field.label}, read through the lookup.`,
                    type: DimensionType.STRING,
                    filterOperators: SALESFORCE_TEXT_FILTERS,
                },
            ];
        }
        case 'boolean':
            return field.groupable
                ? [
                      {
                          name: toName(apiName),
                          apiName,
                          label,
                          description: describe(field),
                          type: DimensionType.BOOLEAN,
                          filterOperators:
                              field.filterable === false
                                  ? []
                                  : SALESFORCE_BOOLEAN_FILTERS,
                      },
                  ]
                : [];
        case 'int':
            return field.groupable
                ? [
                      {
                          name: toName(apiName),
                          apiName,
                          label,
                          description: describe(field),
                          type: DimensionType.NUMBER,
                          filterOperators: textFilters(
                              field,
                              SALESFORCE_NUMBER_FILTERS,
                          ),
                      },
                  ]
                : [];
        case 'date':
        case 'datetime': {
            // Date and time fields can't be grouped as they are, only by day
            const isDatetime = type === 'datetime';
            if (field.calculated || (!isDatetime && !field.groupable)) {
                return [];
            }
            return [
                {
                    name: toName(apiName),
                    apiName: isDatetime ? `DAY_ONLY(${apiName})` : apiName,
                    label,
                    description: describe(
                        field,
                        isDatetime ? 'The day, in UTC.' : '',
                    ),
                    type: DimensionType.DATE,
                    filterOperators: textFilters(
                        field,
                        SALESFORCE_DATE_FILTERS,
                    ),
                },
                ...GRAINS.map(
                    ({
                        suffix,
                        fn,
                        label: grain,
                    }): LiveDimensionDefinition => ({
                        name: toName(apiName, suffix),
                        apiName: `${fn}(${apiName})`,
                        label: `${label} ${grain}`,
                        description: grainDescription(label, grain),
                        type: DimensionType.DATE,
                        filterOperators: [],
                    }),
                ),
            ];
        }
        default:
            return [];
    }
};

const AGGREGATES = [
    { fn: 'SUM', suffix: 'sum', type: MetricType.SUM, label: 'Total' },
    { fn: 'AVG', suffix: 'avg', type: MetricType.AVERAGE, label: 'Average' },
    { fn: 'MIN', suffix: 'min', type: MetricType.MIN, label: 'Lowest' },
    { fn: 'MAX', suffix: 'max', type: MetricType.MAX, label: 'Highest' },
] as const;

const NUMERIC_TYPES = new Set(['int', 'double', 'currency', 'percent']);

const toMetrics = (field: DescribeField): LiveMetricDefinition[] =>
    NUMERIC_TYPES.has(field.type) && field.aggregatable
        ? AGGREGATES.filter(
              // A total of percentages means nothing
              ({ fn }) => !(fn === 'SUM' && field.type === 'percent'),
          ).map(({ fn, suffix, type, label }) => ({
              name: toName(field.name, suffix),
              apiName: `${fn}(${field.name})`,
              label: `${label} ${field.label}`,
              description: `${label} ${field.label} of the matching records, computed by Salesforce (${fn}).`,
              type,
              filterOperators: SALESFORCE_METRIC_FILTERS,
          }))
        : [];

/**
 * Adds the object's own fields from its describe: a dimension per field
 * Salesforce can group by, day/month/quarter/year for dates, the name
 * behind each lookup, and sum/average/min/max for numbers. Fields it can't
 * group (long text, multi-select picklists, decimals) are left out of
 * dimensions so every dimension works with metrics too.
 */
export const withSalesforceFields = (
    definition: LiveExploreDefinition,
    describeBody: unknown,
): LiveExploreDefinition => {
    const parsed = describeSchema.safeParse(describeBody);
    if (!parsed.success) {
        return definition;
    }
    const fields = parsed.data.fields.filter(
        ({ name, deprecatedAndHidden }) =>
            !deprecatedAndHidden &&
            FIELD_NAME.test(name) &&
            !BUILT_IN_API_NAMES.has(name),
    );
    const people = [
        ...fields.filter(({ name }) => !isInternalSalesforceField(name)),
        ...fields.filter(({ name }) => isInternalSalesforceField(name)),
    ];
    const dimensions = people
        .flatMap(toDimensions)
        .slice(0, MAX_SCANNED_FIELDS);
    const metrics = people
        .flatMap(toMetrics)
        .slice(0, Math.max(0, MAX_SCANNED_FIELDS - dimensions.length));
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
        metrics: [...definition.metrics, ...metrics],
    };
};
