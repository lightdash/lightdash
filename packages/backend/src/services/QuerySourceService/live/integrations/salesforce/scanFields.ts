import {
    DimensionType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type SalesforceObject,
} from '@lightdash/common';
import { z } from 'zod';
import {
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
} from '../../sdk';
import {
    SALESFORCE_EXPLORES,
    SALESFORCE_OPPORTUNITIES_EXPLORE,
} from './explores';
import {
    SALESFORCE_BOOLEAN_FILTERS,
    SALESFORCE_CHOICE_FILTERS,
    SALESFORCE_DATE_FILTERS,
    SALESFORCE_METRIC_FILTERS,
    SALESFORCE_NUMBER_FILTERS,
    SALESFORCE_TEXT_FILTERS,
} from './filters';

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

const GRAIN_AI_HINT =
    'Salesforce groups it with CALENDAR_* functions in UTC. Filter the base date field, not this one.';

/** Names of the explores scans add fields to besides the first. */
export const SALESFORCE_SCANNED_MODELS = SALESFORCE_EXPLORES.slice(1).map(
    ({ name }) => name,
);

/** One object's describe from a scan; anything else reads as none. */
export const readSalesforceDescribe = (
    scanned: unknown,
    object: SalesforceObject,
): unknown =>
    scanned !== null &&
    typeof scanned === 'object' &&
    Object.hasOwn(scanned, object)
        ? (scanned as Record<string, unknown>)[object]
        : undefined;

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
    // Every object's explore has the same built-in fields
    ...SALESFORCE_OPPORTUNITIES_EXPLORE.dimensions.map(({ name }) => name),
    ...SALESFORCE_OPPORTUNITIES_EXPLORE.metrics.map(({ name }) => name),
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

/** A scanned field's description, with its API name moved to the AI hint. */
const describe = (
    field: DescribeField,
    extra = '',
): Pick<LiveDimensionDefinition, 'description' | 'aiHint'> => {
    const values = describeValues(field);
    return {
        description: [
            field.inlineHelpText?.trim() ||
                `The ${field.label} field in Salesforce.`,
            values,
            extra,
        ]
            .filter(Boolean)
            .join(' '),
        aiHint: [
            `Salesforce API name: ${field.name}.`,
            values
                ? `Picklist values are listed as value (label), up to ${MAX_LISTED_VALUES} active ones.`
                : '',
        ]
            .filter(Boolean)
            .join(' '),
    };
};

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
                          ...describe(field),
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
                          ...describe(field),
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
                          ...describe(field),
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
                    description: `Name of the ${referenceTo.join(
                        ' or ',
                    )} in ${field.label}.`,
                    aiHint: 'Read through the lookup relationship.',
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
                          ...describe(field),
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
                          ...describe(field),
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
            const day = toName(apiName);
            return [
                {
                    name: day,
                    apiName: isDatetime ? `DAY_ONLY(${apiName})` : apiName,
                    label,
                    ...describe(
                        field,
                        isDatetime ? 'Shown as the day, in UTC.' : '',
                    ),
                    type: DimensionType.DATE,
                    filterOperators: textFilters(
                        field,
                        SALESFORCE_DATE_FILTERS,
                    ),
                    // The day is its own finest grain, grouped with the coarser ones
                    timeInterval: { base: day, grain: TimeFrames.DAY },
                },
                ...GRAINS.map(
                    ({
                        suffix,
                        fn,
                        label: grainLabel,
                        grain,
                    }): LiveDimensionDefinition => ({
                        name: toName(apiName, suffix),
                        apiName: `${fn}(${apiName})`,
                        label: `${label} ${grainLabel}`,
                        description: `${label} by ${grainLabel}, shown as the period's first day, in UTC.`,
                        aiHint: GRAIN_AI_HINT,
                        type: DimensionType.DATE,
                        filterOperators: [],
                        timeInterval: { base: day, grain },
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
              description: `${label} ${field.label} of the matching records.`,
              aiHint: `Computed by Salesforce (${fn}); sum is not offered for percent fields.`,
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
