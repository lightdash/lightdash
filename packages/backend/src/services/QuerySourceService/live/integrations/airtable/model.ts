import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    getAirtableTablesPath,
} from '@lightdash/common';
import { z } from 'zod';
import {
    defineLiveModel,
    dimension,
    toLiveModelName,
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveModel,
    type LiveRuntime,
} from '../../sdk';

/** Most fields one table brings in; wider tables keep their first ones. */
export const AIRTABLE_MAX_FIELDS = 200;

/** Every record's id and creation time, which Airtable sends beside its fields. */
export const AIRTABLE_RECORD_ID = '$id';
export const AIRTABLE_CREATED_TIME = '$createdTime';
export const AIRTABLE_RECORD_COLUMNS = [
    AIRTABLE_RECORD_ID,
    AIRTABLE_CREATED_TIME,
];

const VALUE_FILTERS = [FilterOperator.EQUALS, FilterOperator.NOT_EQUALS];
const SET_FILTERS = [FilterOperator.NULL, FilterOperator.NOT_NULL];
const RANGE_FILTERS = [
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

export const AIRTABLE_TEXT_FILTERS = [
    ...VALUE_FILTERS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...SET_FILTERS,
];

export const AIRTABLE_NUMBER_FILTERS = [
    ...VALUE_FILTERS,
    ...RANGE_FILTERS,
    ...SET_FILTERS,
];

/** An unticked checkbox is empty, so "is false" covers it. */
export const AIRTABLE_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

export const AIRTABLE_DATE_FILTERS = [
    ...VALUE_FILTERS,
    ...RANGE_FILTERS,
    FilterOperator.IN_BETWEEN,
    ...SET_FILTERS,
];

/** A time "is" a day only as a range, so times take ranges. */
export const AIRTABLE_TIMESTAMP_FILTERS = [
    ...RANGE_FILTERS,
    FilterOperator.IN_BETWEEN,
    ...SET_FILTERS,
];

/** What the agent should know about any table explore. */
const RECORDS_AI_HINT =
    'Read live from the Airtable Web API, one row per record of the table. There are no metrics: count, sum or average by aggregating rows, e.g. count records per week of Created time. Filters, sorts and the row limit run in Airtable; one query reads at most 4,999 records, so filter large tables. Linked records read as record ids, lookups as the looked-up values, people as their names.';

/** Every record's id and creation time, which Airtable sends beside its fields. */
const RECORD_DIMENSIONS: LiveDimensionDefinition[] = [
    dimension({
        name: 'record_id',
        apiName: AIRTABLE_RECORD_ID,
        label: 'Record ID',
        type: DimensionType.STRING,
        filterOperators: [...VALUE_FILTERS],
        description: "The record's Airtable id, rec followed by 14 characters.",
    }),
    dimension({
        name: 'created_time',
        apiName: AIRTABLE_CREATED_TIME,
        label: 'Created time',
        type: DimensionType.TIMESTAMP,
        filterOperators: AIRTABLE_TIMESTAMP_FILTERS,
        description: 'When the record was created, in UTC.',
    }),
];

/** The base schema's keys for one table, as the tables explore reads them. */
export const AIRTABLE_TABLE_COLUMNS = {
    id: 'id',
    name: 'name',
    description: 'description',
    primaryField: 'primaryField',
    fieldCount: 'fieldCount',
} as const;

/**
 * The tables of the base, one row each, from the base schema. Every source
 * has it; each table's records are an explore of their own.
 */
export const AIRTABLE_TABLES_EXPLORE: LiveExploreDefinition = {
    name: 'tables',
    label: 'Tables',
    description:
        'The tables of an Airtable base, one row per table, with their primary field and number of fields.',
    aiHint: "Lists the base's tables; read a table's records from its own explore. Filters and sorts run in Lightdash.",
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'table_id',
            apiName: AIRTABLE_TABLE_COLUMNS.id,
            label: 'Table ID',
            type: DimensionType.STRING,
            filterOperators: [],
            description:
                "The table's Airtable id, tbl followed by 14 characters.",
        }),
        dimension({
            name: 'name',
            apiName: AIRTABLE_TABLE_COLUMNS.name,
            label: 'Name',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'The name of the table.',
        }),
        dimension({
            name: 'description',
            apiName: AIRTABLE_TABLE_COLUMNS.description,
            label: 'Description',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "The table's description in Airtable.",
        }),
        dimension({
            name: 'primary_field',
            apiName: AIRTABLE_TABLE_COLUMNS.primaryField,
            label: 'Primary field',
            type: DimensionType.STRING,
            filterOperators: [],
            description: "The name of the table's primary field.",
        }),
        dimension({
            name: 'field_count',
            apiName: AIRTABLE_TABLE_COLUMNS.fieldCount,
            label: 'Fields',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'How many fields the table has.',
        }),
    ],
    metrics: [],
};

export const AIRTABLE_EXPLORES = [AIRTABLE_TABLES_EXPLORE] as const;

const fieldSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string().optional(),
    options: z
        .object({
            result: z.object({ type: z.string() }).nullable().optional(),
        })
        .nullable()
        .optional(),
});

/** One table in the base schema (`GET /v0/meta/bases/{baseId}/tables`). */
export const airtableTableSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    primaryFieldId: z.string().optional(),
    fields: z.array(fieldSchema),
});

export type AirtableTable = z.infer<typeof airtableTableSchema>;
export type AirtableField = z.infer<typeof fieldSchema>;

/** The base schema's tables in Airtable's order, skipping any of an unknown shape. */
export const readAirtableTables = (tables: unknown[]): AirtableTable[] =>
    tables.flatMap((table) => {
        const parsed = airtableTableSchema.safeParse(table);
        return parsed.success ? [parsed.data] : [];
    });

const NUMBER_TYPES = new Set([
    'number',
    'currency',
    'percent',
    'rating',
    'count',
    'autoNumber',
    'duration',
]);
const TIMESTAMP_TYPES = new Set([
    'dateTime',
    'createdTime',
    'lastModifiedTime',
]);
/** Fields with no value to read. */
const SKIPPED_TYPES = new Set(['button']);

type FieldRules = Pick<LiveDimensionDefinition, 'type' | 'filterOperators'>;

const toFieldRules = (type: string): FieldRules => {
    if (NUMBER_TYPES.has(type)) {
        return {
            type: DimensionType.NUMBER,
            filterOperators: AIRTABLE_NUMBER_FILTERS,
        };
    }
    if (type === 'checkbox') {
        return {
            type: DimensionType.BOOLEAN,
            filterOperators: AIRTABLE_BOOLEAN_FILTERS,
        };
    }
    if (type === 'date') {
        return {
            type: DimensionType.DATE,
            filterOperators: AIRTABLE_DATE_FILTERS,
        };
    }
    if (TIMESTAMP_TYPES.has(type)) {
        return {
            type: DimensionType.TIMESTAMP,
            filterOperators: AIRTABLE_TIMESTAMP_FILTERS,
        };
    }
    // Text, selects, people, links, lookups, attachments: read as text
    return {
        type: DimensionType.STRING,
        filterOperators: AIRTABLE_TEXT_FILTERS,
    };
};

/** Formulas and rollups take the type of their result. */
const getValueType = ({ type, options }: AirtableField) =>
    (type === 'formula' || type === 'rollup') && options?.result?.type
        ? options.result.type
        : type;

/** A field's dimension name: lowercase letters, digits and underscores. */
const toBaseFieldName = (field: string) =>
    field
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'field';

/** The fields an explore can read, in Airtable's order. */
const getReadableFields = (fields: AirtableField[]) =>
    fields
        .filter(
            (field) =>
                !SKIPPED_TYPES.has(field.type) &&
                !AIRTABLE_RECORD_COLUMNS.includes(field.name),
        )
        .slice(0, AIRTABLE_MAX_FIELDS);

/**
 * One table's explore: its records, with the record id, creation time and
 * one dimension per readable field. Named from the table's id, which
 * survives renames; on from the start, since the tables are the base.
 */
export const toAirtableTableExplore = (
    table: AirtableTable,
): LiveExploreDefinition => {
    const taken = new Set(RECORD_DIMENSIONS.map(({ name }) => name));
    const fields = getReadableFields(table.fields).map(
        (field): LiveDimensionDefinition => {
            const base = toBaseFieldName(field.name);
            let name = base;
            for (let suffix = 2; taken.has(name); suffix += 1) {
                name = `${base}_${suffix}`;
            }
            taken.add(name);
            return dimension({
                name,
                apiName: field.name,
                label: field.name,
                ...toFieldRules(getValueType(field)),
                description:
                    field.description?.trim() ||
                    `${field.name} (${field.type})`,
            });
        },
    );
    return {
        name: toLiveModelName(table.id),
        apiName: table.id,
        label: table.name,
        description:
            table.description?.trim() ||
            `Records of the ${table.name} table in an Airtable base, read live through the Airtable Web API, one row per record.`,
        aiHint: RECORDS_AI_HINT,
        maxDimensions: null,
        maxMetrics: null,
        dateRange: null,
        incompatible: [],
        dimensions: [...RECORD_DIMENSIONS, ...fields],
        metrics: [],
    };
};

const tablesSchema = z.object({ tables: z.array(z.unknown()) });

/** Every table of the base with its fields. Needs schema.bases:read. */
export const readAirtableBase = async ({
    settings,
    runtime,
}: {
    settings: { baseId: string };
    runtime: LiveRuntime;
}): Promise<AirtableTable[]> => {
    const { tables } = await runtime.fetch(
        {
            method: 'GET',
            path: getAirtableTablesPath(settings.baseId),
            body: undefined,
        },
        tablesSchema,
    );
    return readAirtableTables(tables);
};

/** The tables explore, then one explore per table of the base. */
export const airtableModel: LiveModel<ApiConnectorType.AIRTABLE> =
    defineLiveModel({
        explores: AIRTABLE_EXPLORES,
        scan: async (args) => ({ tables: await readAirtableBase(args) }),
        metadata: z.object({
            tables: z.array(airtableTableSchema).catch([]),
        }),
        extend: ({ tables }) => ({
            explores: tables.map(toAirtableTableExplore),
        }),
    });
