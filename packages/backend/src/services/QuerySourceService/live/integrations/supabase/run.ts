import {
    DimensionType,
    getSupabaseTablePath,
    ParameterError,
    SUPABASE_REST_PATH,
    type ApiConnectorType,
} from '@lightdash/common';
import { z } from 'zod';
import {
    assertMaxRows,
    readRowsWithinCap,
    type LiveColumn,
    type LiveRunArgs,
    type LiveRunResult,
    type LiveRuntime,
} from '../../sdk';

const LABEL = 'Supabase';

/** Supabase's default max-rows: the most rows one Data API call returns. */
export const SUPABASE_PAGE_SIZE = 1_000;
export const SUPABASE_MAX_PAGES = 5;
/** One fewer than the pages hold, so reading every page detects a cut-off result. */
export const SUPABASE_MAX_QUERY_ROWS =
    SUPABASE_PAGE_SIZE * SUPABASE_MAX_PAGES - 1;

const FILTER_OPERATORS = [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'not_in',
    'ilike',
    'not_ilike',
    'is_null',
    'not_null',
] as const;
type SupabaseFilterOperator = (typeof FILTER_OPERATORS)[number];

const LIST_OPERATORS = new Set<SupabaseFilterOperator>(['in', 'not_in']);
const PATTERN_OPERATORS = new Set<SupabaseFilterOperator>([
    'ilike',
    'not_ilike',
]);
const SET_OPERATORS = new Set<SupabaseFilterOperator>(['is_null', 'not_null']);

const filterSchema = z
    .object({
        column: z.string().min(1),
        operator: z.enum(FILTER_OPERATORS),
        /**
         * A list for in and not_in, nothing for is_null and not_null, one
         * value or a list (any of them) for ilike and not_ilike, one value
         * otherwise.
         */
        value: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
    })
    .strict()
    .superRefine(({ operator, value }, context) => {
        const isList = Array.isArray(value);
        if (
            SET_OPERATORS.has(operator)
                ? value !== undefined
                : value === undefined
        ) {
            context.addIssue({
                code: 'custom',
                message: SET_OPERATORS.has(operator)
                    ? `${operator} takes no value`
                    : `${operator} needs a value`,
            });
        } else if (
            value !== undefined &&
            !PATTERN_OPERATORS.has(operator) &&
            LIST_OPERATORS.has(operator) !== isList
        ) {
            context.addIssue({
                code: 'custom',
                message: LIST_OPERATORS.has(operator)
                    ? `${operator} takes a list of values`
                    : `${operator} takes one value`,
            });
        }
    });

/** One read of the source's table, as compile writes it and agents send it. */
export const supabaseRequestSchema = z
    .object({
        /** Columns as the table names them. */
        select: z.array(z.string().min(1)).min(1),
        /** All must match. ilike takes a pattern with * as the wildcard. */
        filters: z.array(filterSchema).optional(),
        order: z
            .array(
                z
                    .object({
                        column: z.string().min(1),
                        ascending: z.boolean(),
                    })
                    .strict(),
            )
            .optional(),
        // Agents sometimes copy a limit in; the smaller limit wins
        limit: z.number().int().positive().optional(),
    })
    .strict();

export type SupabaseRequest = z.infer<typeof supabaseRequestSchema>;
export type SupabaseFilter = z.infer<typeof filterSchema>;

const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const quote = (text: string) =>
    `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** A column as PostgREST reads it in select, order and filters. */
const toIdentifier = (column: string) =>
    PLAIN_IDENTIFIER.test(column) ? column : quote(column);

/** A value inside and=(…) or in.(…), quoted when PostgREST would split it. */
const toValue = (value: string) =>
    /[,(){}"\\]|^\s|\s$|^$/.test(value) ? quote(value) : value;

const toCondition = ({ column, operator, value }: SupabaseFilter) => {
    const target = toIdentifier(column);
    const values = Array.isArray(value) ? value : [value ?? ''];
    switch (operator) {
        case 'is_null':
            return `${target}.is.null`;
        case 'not_null':
            return `${target}.not.is.null`;
        case 'in':
            return `${target}.in.(${values.map(toValue).join(',')})`;
        case 'not_in':
            return `${target}.not.in.(${values.map(toValue).join(',')})`;
        // A list matches any pattern; not_ilike then matches none of them
        case 'ilike':
        case 'not_ilike': {
            const negation = operator === 'not_ilike' ? 'not.' : '';
            return Array.isArray(value)
                ? `${target}.${negation}ilike(any).{${values.map(toValue).join(',')}}`
                : `${target}.${negation}ilike.${toValue(values[0])}`;
        }
        default:
            return `${target}.${operator}.${toValue(values[0])}`;
    }
};

/** The Data API's query string for one request, without paging. */
export const toSupabaseQuery = (
    request: SupabaseRequest,
): Record<string, string> => ({
    select: request.select.map(toIdentifier).join(','),
    ...(request.filters && request.filters.length > 0
        ? { and: `(${request.filters.map(toCondition).join(',')})` }
        : {}),
    ...(request.order && request.order.length > 0
        ? {
              order: request.order
                  .map(
                      ({ column, ascending }) =>
                          `${toIdentifier(column)}.${ascending ? 'asc' : 'desc'}`,
                  )
                  .join(','),
          }
        : {}),
});

const rowsSchema = z.array(z.record(z.string(), z.unknown()));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** JSON and arrays read as text; everything else as the Data API returns it. */
const toCell = (value: unknown) =>
    value !== null && typeof value === 'object' ? JSON.stringify(value) : value;

/** A column's type, from the first value that says. */
const toColumnType = (
    rows: Record<string, unknown>[],
    column: string,
): DimensionType => {
    const value = rows.find((row) => row[column] != null)?.[column];
    if (typeof value === 'number') return DimensionType.NUMBER;
    if (typeof value === 'boolean') return DimensionType.BOOLEAN;
    if (typeof value === 'string' && ISO_DATE.test(value)) {
        return DimensionType.DATE;
    }
    if (typeof value === 'string' && ISO_TIMESTAMP.test(value)) {
        return DimensionType.TIMESTAMP;
    }
    return DimensionType.STRING;
};

/** Reads the source's table, a page of up to 1,000 rows at a time. */
export const runSupabaseQuery = async ({
    settings,
    request,
    limit,
    runtime,
}: LiveRunArgs<
    ApiConnectorType.SUPABASE,
    SupabaseRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, SUPABASE_MAX_QUERY_ROWS);
    const query = toSupabaseQuery(request);
    const requestedRows = Math.min(limit, request.limit ?? limit);
    const { rows, hasMoreRows } = await readRowsWithinCap({
        label: LABEL,
        requestedRows,
        maxRows: SUPABASE_MAX_QUERY_ROWS,
        pageSize: SUPABASE_PAGE_SIZE,
        maxPages: SUPABASE_MAX_PAGES,
        fetchPage: async ({ limit: pageLimit, cursor }) => {
            const offset = cursor ? Number(cursor) : 0;
            const page = await runtime.fetch(
                {
                    method: 'GET',
                    path: getSupabaseTablePath(settings.table),
                    query: {
                        ...query,
                        limit: String(pageLimit),
                        offset: String(offset),
                    },
                    body: undefined,
                },
                rowsSchema,
            );
            return {
                rows: page.map((row) =>
                    Object.fromEntries(
                        request.select.map((column) => [
                            column,
                            toCell(row[column] ?? null),
                        ]),
                    ),
                ),
                nextCursor:
                    page.length === pageLimit
                        ? String(offset + page.length)
                        : undefined,
            };
        },
    });
    return {
        columns: request.select.map(
            (name): LiveColumn => ({ name, type: toColumnType(rows, name) }),
        ),
        rows,
        hasMoreRows,
    };
};

const openApiSchema = z.object({
    definitions: z.record(z.string(), z.unknown()).optional(),
});

/** The source's table under `definitions` in the Supabase Data API's OpenAPI description. */
export type SupabaseCatalog = { supabaseTable?: unknown };

/**
 * Reads the table's columns from the Data API's OpenAPI description. Only
 * secret (service role) keys may read it, and only tables the key can see
 * are listed.
 */
export const scanSupabaseTable = async ({
    settings,
    runtime,
}: {
    settings: { table: string };
    runtime: LiveRuntime;
}): Promise<SupabaseCatalog> => {
    const description = await runtime.fetch(
        { method: 'GET', path: SUPABASE_REST_PATH, body: undefined },
        openApiSchema,
    );
    const definitions = description.definitions ?? {};
    if (!Object.hasOwn(definitions, settings.table)) {
        const known = Object.keys(definitions).slice(0, 10);
        throw new ParameterError(
            `Supabase has no table or view called "${settings.table}" in the exposed schema${
                known.length > 0 ? `; it has ${known.join(', ')}` : ''
            }. Check the table name, and that the schema is exposed in the project's Data API settings.`,
        );
    }
    return { supabaseTable: definitions[settings.table] };
};
