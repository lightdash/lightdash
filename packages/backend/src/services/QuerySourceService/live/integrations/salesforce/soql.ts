import { ParameterError } from '@lightdash/common';
import { z } from 'zod';

/**
 * A Salesforce query, as compile writes it and an agent may send it. It is
 * structured, not SOQL text: `toSoql` writes the SOQL, reads only the
 * source's own object and escapes every value, so nothing in a request can
 * change the query's shape.
 */

const PATH = '[A-Za-z][A-Za-z0-9_]{0,79}(?:\\.[A-Za-z][A-Za-z0-9_]{0,79})?';
const FIELD = new RegExp(`^${PATH}$`);
const DATE_FUNCTION = new RegExp(
    `^(DAY_ONLY|CALENDAR_MONTH|CALENDAR_QUARTER|CALENDAR_YEAR)\\((${PATH})\\)$`,
);
const AGGREGATE_FUNCTION = new RegExp(
    `^(COUNT|SUM|AVG|MIN|MAX)\\((${PATH})\\)$`,
);

export type SalesforceDateFunction =
    | 'DAY_ONLY'
    | 'CALENDAR_MONTH'
    | 'CALENDAR_QUARTER'
    | 'CALENDAR_YEAR';

export type SalesforceExpression =
    | { kind: 'field'; field: string }
    /** A date at a grain; month and quarter group with the year too. */
    | { kind: 'date'; fn: SalesforceDateFunction; field: string }
    | { kind: 'aggregate'; fn: string; field: string };

/** Reads a field's API name: a field path, a date function or an aggregate. */
export const parseSalesforceExpression = (
    name: string,
): SalesforceExpression | null => {
    if (FIELD.test(name)) return { kind: 'field', field: name };
    const date = DATE_FUNCTION.exec(name);
    if (date) {
        return {
            kind: 'date',
            fn: date[1] as SalesforceDateFunction,
            field: date[2],
        };
    }
    const aggregate = AGGREGATE_FUNCTION.exec(name);
    if (aggregate) {
        return { kind: 'aggregate', fn: aggregate[1], field: aggregate[2] };
    }
    return null;
};

const expressionSchema = z
    .string()
    .refine((name) => parseSalesforceExpression(name) !== null, {
        message:
            'names are Salesforce field API names (Amount, Account.Name), a date function of one (CALENDAR_MONTH(CloseDate)) or an aggregate (SUM(Amount), COUNT(Id))',
    });
const fieldSchema = z.string().regex(FIELD, {
    message: 'filters name a Salesforce field, such as StageName or Owner.Name',
});

export const SALESFORCE_COLUMN_TYPES = [
    'string',
    'number',
    'boolean',
    'date',
    'timestamp',
] as const;
export type SalesforceColumnType = (typeof SALESFORCE_COLUMN_TYPES)[number];

const VALUE_TYPES = [
    'string',
    'number',
    'boolean',
    'date',
    'datetime',
] as const;
export type SalesforceValueType = (typeof VALUE_TYPES)[number];

const OPERATORS = [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'not_in',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'is_null',
    'not_null',
] as const;
export type SalesforceOperator = (typeof OPERATORS)[number];

export type SalesforceCondition = {
    /** A field in WHERE; an aggregate such as SUM(Amount) in HAVING. */
    field: string;
    operator: SalesforceOperator;
    values: Array<string | number | boolean>;
    valueType: SalesforceValueType;
};

export type SalesforceFilter =
    | { and: SalesforceFilter[] }
    | { or: SalesforceFilter[] }
    | SalesforceCondition;

const conditionSchema = z
    .object({
        field: expressionSchema,
        operator: z.enum(OPERATORS),
        values: z.array(z.union([z.string(), z.number(), z.boolean()])),
        valueType: z.enum(VALUE_TYPES),
    })
    .strict();

const MAX_FILTER_DEPTH = 5;

const filterSchema: z.ZodType<SalesforceFilter> = z.lazy(() =>
    z.union([
        z.object({ and: z.array(filterSchema).min(1) }).strict(),
        z.object({ or: z.array(filterSchema).min(1) }).strict(),
        conditionSchema,
    ]),
);

const depthOf = (filter: SalesforceFilter): number => {
    if ('and' in filter) return 1 + Math.max(...filter.and.map(depthOf));
    if ('or' in filter) return 1 + Math.max(...filter.or.map(depthOf));
    return 0;
};

const conditionsOf = (
    filter: SalesforceFilter | null,
): SalesforceCondition[] => {
    if (!filter) return [];
    if ('and' in filter) return filter.and.flatMap(conditionsOf);
    if ('or' in filter) return filter.or.flatMap(conditionsOf);
    return [filter];
};

/** What SOQL can't run, said before any call. */
const getRequestIssue = (request: {
    kind: 'aggregate' | 'records';
    columns: { name: string; type: SalesforceColumnType }[];
    where: SalesforceFilter | null;
    having: SalesforceFilter | null;
    sorts: { name: string; descending: boolean }[];
}): string | null => {
    const kinds = request.columns.map(
        (column) => parseSalesforceExpression(column.name)?.kind,
    );
    const names = new Set(request.columns.map(({ name }) => name));
    if (names.size !== kinds.length) {
        return 'Each Salesforce column can appear once.';
    }
    if (request.kind === 'records') {
        if (kinds.includes('aggregate')) {
            return 'A records query lists fields; totals such as SUM(Amount) need kind "aggregate".';
        }
        if (request.having) {
            return 'Only an aggregate query can filter by a total (HAVING).';
        }
    } else {
        if (!kinds.includes('aggregate')) {
            return 'An aggregate query needs at least one total, such as COUNT(Id).';
        }
        const timestamp = request.columns.find(
            ({ type, name }) =>
                type === 'timestamp' &&
                parseSalesforceExpression(name)?.kind === 'field',
        );
        if (timestamp) {
            return `Salesforce can't group by a date and time (${timestamp.name}). Group by its day, month, quarter or year instead.`;
        }
        if (request.having && !kinds.some((kind) => kind !== 'aggregate')) {
            return 'Salesforce filters totals (HAVING) only when they are split by a field. Add a dimension, or filter the records instead.';
        }
    }
    for (const filter of [request.where, request.having]) {
        if (filter && depthOf(filter) > MAX_FILTER_DEPTH) {
            return `Filters can nest at most ${MAX_FILTER_DEPTH} groups deep.`;
        }
    }
    if (
        conditionsOf(request.where).some(
            ({ field }) => parseSalesforceExpression(field)?.kind !== 'field',
        )
    ) {
        return 'Record filters (WHERE) compare fields, such as CloseDate or StageName.';
    }
    if (
        conditionsOf(request.having).some(
            ({ field }) =>
                parseSalesforceExpression(field)?.kind !== 'aggregate',
        )
    ) {
        return 'Total filters (HAVING) compare totals, such as SUM(Amount).';
    }
    const unsorted = request.sorts.find(({ name }) => !names.has(name));
    if (unsorted) {
        return `Sort by a selected column; ${unsorted.name} isn't one.`;
    }
    return null;
};

export const salesforceRequestSchema = z
    .object({
        /** `aggregate` groups and totals on Salesforce; `records` lists records. */
        kind: z.enum(['aggregate', 'records']),
        columns: z
            .array(
                z
                    .object({
                        name: expressionSchema,
                        type: z.enum(SALESFORCE_COLUMN_TYPES),
                    })
                    .strict(),
            )
            .min(1),
        where: filterSchema.nullable(),
        having: filterSchema.nullable(),
        sorts: z.array(
            z
                .object({ name: expressionSchema, descending: z.boolean() })
                .strict(),
        ),
    })
    .strict()
    .superRefine((request, context) => {
        const issue = getRequestIssue(request);
        if (issue) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: issue });
        }
    });

export type SalesforceRequest = z.infer<typeof salesforceRequestSchema>;

// Backslash first, so the escapes added after it stay single
const STRING_ESCAPES: [RegExp, string][] = [
    [/\\/g, '\\\\'],
    [/'/g, "\\'"],
    [/"/g, '\\"'],
    [/\n/g, '\\n'],
    [/\r/g, '\\r'],
    [/\t/g, '\\t'],
    [/\u0008/g, '\\b'],
    [/\f/g, '\\f'],
];

// eslint-disable-next-line no-control-regex
const OTHER_CONTROL_CHARACTERS = /[\u0000-\u0007\u000B\u000E-\u001F\u007F]/;

const assertNoControlCharacters = (value: string) => {
    if (OTHER_CONTROL_CHARACTERS.test(value)) {
        throw new ParameterError(
            'Salesforce filter values cannot contain control characters.',
        );
    }
};

const escapeSoqlString = (value: string) => {
    assertNoControlCharacters(value);
    return STRING_ESCAPES.reduce(
        (text, [pattern, replacement]) => text.replace(pattern, replacement),
        value,
    );
};

/** A SOQL string literal: quoted, with Salesforce's escape sequences. */
export const quoteSoqlString = (value: string): string =>
    `'${escapeSoqlString(value)}'`;

/**
 * A LIKE pattern: the value escaped as a string, then its own % and _
 * escaped so they match themselves, then the wildcards added.
 */
const likeLiteral = (value: string, prefix: string, suffix: string) =>
    `'${prefix}${escapeSoqlString(value).replace(/[%_]/g, '\\$&')}${suffix}'`;

const NUMBER = /^-?\d{1,18}(\.\d{1,18})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** One value as a SOQL literal, checked against its type. */
export const toSoqlLiteral = (
    value: string | number | boolean,
    valueType: SalesforceValueType,
): string => {
    const text = String(value);
    switch (valueType) {
        case 'string':
            return quoteSoqlString(text);
        case 'number':
            if (!NUMBER.test(text)) {
                throw new ParameterError(`"${text}" isn't a number.`);
            }
            return text;
        case 'boolean':
            if (text !== 'true' && text !== 'false') {
                throw new ParameterError(`"${text}" isn't true or false.`);
            }
            return text.toUpperCase();
        case 'date':
            if (!DATE.test(text) || Number.isNaN(Date.parse(text))) {
                throw new ParameterError(
                    `"${text}" isn't a date (YYYY-MM-DD).`,
                );
            }
            return text;
        case 'datetime':
            if (!DATETIME.test(text) || Number.isNaN(Date.parse(text))) {
                throw new ParameterError(
                    `"${text}" isn't a UTC date and time (YYYY-MM-DDTHH:MM:SSZ).`,
                );
            }
            return text;
        default:
            throw new ParameterError(`Unknown value type ${valueType}.`);
    }
};

const COMPARISONS: Partial<Record<SalesforceOperator, string>> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
};

const toCondition = ({
    field,
    operator,
    values,
    valueType,
}: SalesforceCondition): string => {
    const one = () => {
        if (values.length !== 1) {
            throw new ParameterError(
                `The "${operator}" filter on ${field} takes one value.`,
            );
        }
        return values[0];
    };
    const comparison = COMPARISONS[operator];
    if (comparison) {
        return `${field} ${comparison} ${toSoqlLiteral(one(), valueType)}`;
    }
    const text = () => {
        if (valueType !== 'string') {
            throw new ParameterError(
                `"${operator}" compares text, not ${valueType} values.`,
            );
        }
        return String(one());
    };
    switch (operator) {
        case 'in':
        case 'not_in':
            if (values.length === 0) {
                throw new ParameterError(
                    `The "${operator}" filter on ${field} needs values.`,
                );
            }
            return `${field} ${operator === 'in' ? 'IN' : 'NOT IN'} (${values
                .map((value) => toSoqlLiteral(value, valueType))
                .join(', ')})`;
        case 'contains':
            return `${field} LIKE ${likeLiteral(text(), '%', '%')}`;
        // SOQL has no NOT LIKE; NOT goes before the comparison
        case 'not_contains':
            return `(NOT ${field} LIKE ${likeLiteral(text(), '%', '%')})`;
        case 'starts_with':
            return `${field} LIKE ${likeLiteral(text(), '', '%')}`;
        case 'ends_with':
            return `${field} LIKE ${likeLiteral(text(), '%', '')}`;
        case 'is_null':
            return `${field} = null`;
        case 'not_null':
            return `${field} != null`;
        default:
            throw new ParameterError(`Unknown filter operator ${operator}.`);
    }
};

const toFilter = (filter: SalesforceFilter): string => {
    if ('and' in filter) {
        return filter.and.length === 1
            ? toFilter(filter.and[0])
            : `(${filter.and.map(toFilter).join(' AND ')})`;
    }
    if ('or' in filter) {
        return filter.or.length === 1
            ? toFilter(filter.or[0])
            : `(${filter.or.map(toFilter).join(' OR ')})`;
    }
    return toCondition(filter);
};

/** The parts a grouped column is made of: year and month for a month. */
const toGroupedParts = (
    expression: SalesforceExpression,
): { soql: string; part: 'value' | 'year' | 'month' | 'quarter' }[] => {
    if (expression.kind === 'field') {
        return [{ soql: expression.field, part: 'value' }];
    }
    if (expression.kind === 'aggregate') {
        return [
            { soql: `${expression.fn}(${expression.field})`, part: 'value' },
        ];
    }
    const year = {
        soql: `CALENDAR_YEAR(${expression.field})`,
        part: 'year' as const,
    };
    switch (expression.fn) {
        case 'DAY_ONLY':
            return [{ soql: `DAY_ONLY(${expression.field})`, part: 'value' }];
        case 'CALENDAR_MONTH':
            return [
                year,
                { soql: `CALENDAR_MONTH(${expression.field})`, part: 'month' },
            ];
        case 'CALENDAR_QUARTER':
            return [
                year,
                {
                    soql: `CALENDAR_QUARTER(${expression.field})`,
                    part: 'quarter',
                },
            ];
        default:
            return [year];
    }
};

/** Where one column of an aggregate query's rows lives: its aliases. */
export type SalesforceAggregateColumn = {
    name: string;
    parts: { alias: string; part: 'value' | 'year' | 'month' | 'quarter' }[];
};

const orderBy = (soql: string, descending: boolean) =>
    `${soql} ${descending ? 'DESC' : 'ASC'} NULLS LAST`;

const parse = (name: string) => {
    const expression = parseSalesforceExpression(name);
    if (!expression) {
        throw new ParameterError(`${name} isn't a Salesforce field.`);
    }
    return expression;
};

/**
 * The SOQL for a request on one object. Aggregate columns get aliases
 * (c0, c1y, c1m), since Salesforce names unaliased totals expr0 and
 * relationship fields by their last part. Records select the fields
 * themselves; dates at a grain are read whole and cut to the grain after.
 */
export const toSoql = (
    request: SalesforceRequest,
    object: string,
    rowLimit: number,
): { soql: string; aggregateColumns: SalesforceAggregateColumn[] } => {
    const where = request.where ? ` WHERE ${toFilter(request.where)}` : '';
    if (request.kind === 'records') {
        const fields = [
            ...new Set(request.columns.map(({ name }) => parse(name).field)),
        ];
        const sorts = request.sorts.map(({ name, descending }) =>
            orderBy(parse(name).field, descending),
        );
        return {
            soql: `SELECT ${fields.join(', ')} FROM ${object}${where}${
                sorts.length > 0 ? ` ORDER BY ${sorts.join(', ')}` : ''
            } LIMIT ${rowLimit}`,
            aggregateColumns: [],
        };
    }

    const aggregateColumns = request.columns.map(
        ({ name }, index): SalesforceAggregateColumn & { soql: string[] } => {
            const parts = toGroupedParts(parse(name));
            const suffix = (part: string) =>
                part === 'value' ? '' : part.charAt(0);
            return {
                name,
                soql: parts.map(({ soql }) => soql),
                parts: parts.map(({ part }) => ({
                    alias: `c${index}${suffix(part)}`,
                    part,
                })),
            };
        },
    );
    const select = aggregateColumns.flatMap(({ soql, parts }) =>
        soql.map((expression, index) => `${expression} ${parts[index].alias}`),
    );
    const groupBy = aggregateColumns
        .filter(({ name }) => parse(name).kind !== 'aggregate')
        .flatMap(({ soql }) => soql);
    const having = request.having ? ` HAVING ${toFilter(request.having)}` : '';
    const sorts = request.sorts.flatMap(({ name, descending }) =>
        toGroupedParts(parse(name)).map(({ soql }) =>
            orderBy(soql, descending),
        ),
    );
    // Totals with no grouping are one row, and Salesforce refuses LIMIT or
    // ORDER BY on them.
    const grouped =
        groupBy.length > 0
            ? ` GROUP BY ${groupBy.join(', ')}${having}${
                  sorts.length > 0 ? ` ORDER BY ${sorts.join(', ')}` : ''
              } LIMIT ${rowLimit}`
            : '';
    return {
        soql: `SELECT ${select.join(', ')} FROM ${object}${where}${grouped}`,
        aggregateColumns: aggregateColumns.map(({ name, parts }) => ({
            name,
            parts,
        })),
    };
};
