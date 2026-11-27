import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    isSupabaseTableName,
    ParameterError,
    SUPABASE_REST_PATH,
} from '@lightdash/common';
import { z } from 'zod';
import {
    defineLiveModel,
    toLiveModelName,
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveModel,
    type LiveRuntime,
} from '../../sdk';

/** "is" and "is not" take several values: PostgREST's in.(…) and not.in.(…). */
export const SUPABASE_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

export const SUPABASE_SET_FILTERS = [
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

export const SUPABASE_RANGE_FILTERS = [
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

export const SUPABASE_TEXT_FILTERS = [
    ...SUPABASE_VALUE_FILTERS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...SUPABASE_SET_FILTERS,
];

export const SUPABASE_NUMBER_FILTERS = [
    ...SUPABASE_VALUE_FILTERS,
    ...SUPABASE_RANGE_FILTERS,
    ...SUPABASE_SET_FILTERS,
];

export const SUPABASE_BOOLEAN_FILTERS = [
    FilterOperator.EQUALS,
    ...SUPABASE_SET_FILTERS,
];

export const SUPABASE_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    ...SUPABASE_RANGE_FILTERS,
    FilterOperator.IN_BETWEEN,
    ...SUPABASE_SET_FILTERS,
];

/** A timestamp "is" a day only as a range, so timestamps take ranges. */
export const SUPABASE_TIMESTAMP_FILTERS = [
    ...SUPABASE_RANGE_FILTERS,
    FilterOperator.IN_BETWEEN,
    ...SUPABASE_SET_FILTERS,
];

/** JSON and arrays read as text; they can only be checked for being empty. */
export const SUPABASE_STRUCTURED_FILTERS = SUPABASE_SET_FILTERS;

/**
 * What every table's explore shares. Each table or view is its own explore,
 * named after it; its columns come from the scan.
 */
const SUPABASE_TABLE_EXPLORE: Omit<
    LiveExploreDefinition,
    'name' | 'apiName' | 'label' | 'description' | 'dimensions'
> = {
    aiHint: 'Read live from the Supabase Data API (PostgREST), one row per record of the table. There are no metrics: count, sum or average by aggregating rows. Filters, sorts and the row limit run in Supabase; one query reads at most 4,999 rows, so filter large tables.',
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    metrics: [],
};

/** Most columns one table brings in; wider tables keep their first ones. */
export const SUPABASE_MAX_COLUMNS = 200;

const columnSchema = z.object({
    type: z.string().optional(),
    format: z.string().optional(),
    description: z.string().optional(),
});

/** One table's entry under `definitions` in PostgREST's OpenAPI description. */
const tableSchema = z.object({
    properties: z.record(z.string(), columnSchema),
});

export type SupabaseColumn = {
    name: string;
    type: string | null;
    format: string | null;
    description: string | null;
};

/** The table's columns, in the order the Data API lists them; empty when the shape is unknown. */
export const readSupabaseColumns = (table: unknown): SupabaseColumn[] => {
    const parsed = tableSchema.safeParse(table);
    if (!parsed.success) {
        return [];
    }
    return Object.entries(parsed.data.properties).map(([name, column]) => ({
        name,
        type: column.type ?? null,
        format: column.format ?? null,
        description: column.description ?? null,
    }));
};

/** Postgres number types, as the Data API names a column's format. */
const NUMBER_FORMATS = new Set([
    'smallint',
    'integer',
    'bigint',
    'numeric',
    'real',
    'double precision',
    'number',
]);

const toFieldRules = ({
    type,
    format,
}: SupabaseColumn): Pick<
    LiveDimensionDefinition,
    'type' | 'filterOperators'
> => {
    if (
        type === 'integer' ||
        type === 'number' ||
        NUMBER_FORMATS.has(format ?? '')
    ) {
        return {
            type: DimensionType.NUMBER,
            filterOperators: SUPABASE_NUMBER_FILTERS,
        };
    }
    if (type === 'boolean' || format === 'boolean') {
        return {
            type: DimensionType.BOOLEAN,
            filterOperators: SUPABASE_BOOLEAN_FILTERS,
        };
    }
    if (
        type === 'array' ||
        type === 'object' ||
        format?.startsWith('json') ||
        format?.endsWith('[]')
    ) {
        return {
            type: DimensionType.STRING,
            filterOperators: SUPABASE_STRUCTURED_FILTERS,
        };
    }
    if (format === 'date') {
        return {
            type: DimensionType.DATE,
            filterOperators: SUPABASE_DATE_FILTERS,
        };
    }
    if (format?.startsWith('timestamp')) {
        return {
            type: DimensionType.TIMESTAMP,
            filterOperators: SUPABASE_TIMESTAMP_FILTERS,
        };
    }
    return {
        type: DimensionType.STRING,
        filterOperators: SUPABASE_TEXT_FILTERS,
    };
};

/** A column's field name: lowercase letters, digits and underscores. */
const toBaseFieldName = (column: string) =>
    column
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'column';

/** "created_at" reads as "Created at". */
const toLabel = (column: string) => {
    const words = column.replace(/_+/g, ' ').trim();
    return words ? `${words[0].toUpperCase()}${words.slice(1)}` : column;
};

/** PostgREST appends key notes such as "<pk/>" to column comments. */
const toDescription = ({ name, description, format }: SupabaseColumn) => {
    const comment = (description ?? '')
        .replace(/<(pk|fk)[^>]*\/>/g, '')
        .replace(/^Note:\s*/m, '')
        .trim();
    return comment || `${name}${format ? ` (${format})` : ''}`;
};

/** One dimension per column of a table. */
export const toSupabaseDimensions = (
    columns: SupabaseColumn[],
): LiveDimensionDefinition[] => {
    const taken = new Set<string>();
    return columns
        .slice(0, SUPABASE_MAX_COLUMNS)
        .map((column): LiveDimensionDefinition => {
            const base = toBaseFieldName(column.name);
            let name = base;
            for (let suffix = 2; taken.has(name); suffix += 1) {
                name = `${base}_${suffix}`;
            }
            taken.add(name);
            return {
                name,
                apiName: column.name,
                label: toLabel(column.name),
                description: toDescription(column),
                ...toFieldRules(column),
            };
        });
};

const openApiSchema = z.object({
    definitions: z.record(z.string(), z.unknown()).optional(),
});

/** One table or view as an explore, named after it and with its columns. */
export const toSupabaseTableExplore = (
    table: string,
    definition: unknown,
): LiveExploreDefinition => ({
    ...SUPABASE_TABLE_EXPLORE,
    name: toLiveModelName(table),
    apiName: table,
    label: toLabel(table),
    description: `Rows of the ${table} table or view in a Supabase project, read live through its Data API, one row per record.`,
    dimensions: toSupabaseDimensions(readSupabaseColumns(definition)),
});

/**
 * Every table and view the key can see, with its columns, from the Data
 * API's OpenAPI description. Only secret keys may read it.
 */
export const scanSupabaseTables = async ({
    runtime,
}: {
    runtime: LiveRuntime;
}): Promise<unknown> => {
    const description = await runtime.fetch(
        { method: 'GET', path: SUPABASE_REST_PATH, body: undefined },
        openApiSchema,
    );
    const tables = Object.fromEntries(
        Object.entries(description.definitions ?? {}).filter(([table]) =>
            isSupabaseTableName(table),
        ),
    );
    if (Object.keys(tables).length === 0) {
        throw new ParameterError(
            "Supabase lists no tables or views. Check that the schema is exposed in the project's Data API settings.",
        );
    }
    return { tables };
};

export const supabaseModel: LiveModel<ApiConnectorType.SUPABASE> =
    defineLiveModel({
        // Every table is its own explore, named after it; all start on
        explores: [],
        scan: scanSupabaseTables,
        metadata: z.object({
            tables: z
                .record(z.string(), tableSchema.optional().catch(undefined))
                .optional(),
        }),
        extend: ({ tables }) => ({
            explores: Object.entries(tables ?? {}).flatMap(
                ([table, definition]) =>
                    definition
                        ? [toSupabaseTableExplore(table, definition)]
                        : [],
            ),
        }),
    });
