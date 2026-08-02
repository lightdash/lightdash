import {
    FilterOperator,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type MetricQuery,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import {
    astMapper,
    parse,
    toSql,
    type Expr,
    type ExprRef,
    type SelectedColumn,
    type SelectFromStatement,
    type Statement,
} from 'pgsql-ast-parser';
import {
    type PgWireColumn,
    type PgWireCompiledQuery,
    type PgWireField,
    type PgWireTable,
} from './types';

export const PGWIRE_DEFAULT_LIMIT = 500;

export class SqlCompileError extends Error {
    public readonly hint: string | undefined;

    constructor(message: string, hint?: string) {
        super(message);
        this.name = 'SqlCompileError';
        this.hint = hint;
    }
}

type ColumnKind = 'dimension' | 'metric' | 'table_calculation';

type ResolvedColumn = {
    /** fieldId or table calculation name */
    source: string;
    kind: ColumnKind;
    type: string | null;
};

type CompilerContext = {
    table: PgWireTable;
    fieldMap: Map<string, PgWireField>;
    /** names that qualify a column as belonging to the FROM table (table name + alias) */
    fromNames: Set<string>;
    /** output alias -> resolved column (fields and table calculations) */
    aliasMap: Map<string, ResolvedColumn>;
    /** table calculation names defined so far */
    tableCalcNames: Set<string>;
    nextFilterId: () => string;
};

const AGGREGATE_FUNCTIONS = new Set([
    'sum',
    'count',
    'avg',
    'min',
    'max',
    'median',
    'array_agg',
    'string_agg',
    'bool_and',
    'bool_or',
    'percentile_cont',
    'percentile_disc',
    'stddev',
    'stddev_pop',
    'stddev_samp',
    'variance',
    'var_pop',
    'var_samp',
]);

const isLiteralExpr = (expr: Expr): boolean => {
    switch (expr.type) {
        case 'string':
        case 'integer':
        case 'numeric':
        case 'boolean':
        case 'null':
        case 'constant':
            return true;
        case 'cast':
            return isLiteralExpr(expr.operand);
        case 'unary':
            return (
                (expr.op === '-' || expr.op === '+') &&
                isLiteralExpr(expr.operand)
            );
        default:
            return false;
    }
};

type LiteralValue = string | number | boolean | null;

/** Extract a literal filter value, unwrapping casts (e.g. '2024-01-01'::date) */
const literalValue = (expr: Expr): LiteralValue => {
    switch (expr.type) {
        case 'string':
            return expr.value;
        case 'integer':
        case 'numeric':
            return expr.value;
        case 'boolean':
            return expr.value;
        case 'null':
            return null;
        case 'constant':
            return expr.value as LiteralValue;
        case 'cast':
            return literalValue(expr.operand);
        case 'unary': {
            if (expr.op === '-' || expr.op === '+') {
                const inner = literalValue(expr.operand);
                if (typeof inner !== 'number') {
                    throw new SqlCompileError(
                        `Cannot apply unary ${expr.op} to a non-numeric value`,
                    );
                }
                return expr.op === '-' ? -inner : inner;
            }
            throw new SqlCompileError(
                `Unsupported operator "${expr.op}" in filter value`,
            );
        }
        default:
            throw new SqlCompileError(
                `Expected a literal value in filter but found ${expr.type}`,
                'Only constant values (strings, numbers, booleans, dates) are supported in filters',
            );
    }
};

const resolveRef = (
    ctx: CompilerContext,
    ref: ExprRef,
): ResolvedColumn | undefined => {
    const candidates: string[] = [];
    if (ref.table) {
        if (ctx.fromNames.has(ref.table.name)) {
            candidates.push(ref.name, `${ctx.table.name}_${ref.name}`);
        } else {
            // qualified reference to a joined table in the explore, e.g. customers.first_name
            candidates.push(`${ref.table.name}_${ref.name}`);
        }
    } else {
        candidates.push(ref.name);
    }
    for (const candidate of candidates) {
        const field = ctx.fieldMap.get(candidate);
        if (field) {
            return {
                source: field.fieldId,
                kind: field.kind,
                type: field.type,
            };
        }
    }
    // unqualified names can also refer to select-list aliases (incl. table calculations)
    if (!ref.table) {
        const aliased = ctx.aliasMap.get(ref.name);
        if (aliased) return aliased;
    }
    return undefined;
};

const unknownColumnError = (ctx: CompilerContext, ref: ExprRef) => {
    const name = ref.table ? `${ref.table.name}.${ref.name}` : ref.name;
    return new SqlCompileError(
        `Column "${name}" does not exist in table "${ctx.table.name}"`,
        `Available columns: ${ctx.table.fields
            .map((f) => f.fieldId)
            .slice(0, 30)
            .join(', ')}`,
    );
};

const resolveRefOrThrow = (
    ctx: CompilerContext,
    ref: ExprRef,
): ResolvedColumn => {
    const resolved = resolveRef(ctx, ref);
    if (!resolved) throw unknownColumnError(ctx, ref);
    return resolved;
};

/**
 * Convert a SQL expression to a Lightdash table calculation SQL string, replacing
 * column references with ${fieldId} placeholders. References must be selected fields
 * or previously defined table calculations.
 */
const exprToTableCalcSql = (
    ctx: CompilerContext,
    expr: Expr,
    selectedSources: Set<string>,
): string => {
    const mapper = astMapper((map) => ({
        ref: (ref: ExprRef): ExprRef => {
            if (ref.name === '*') {
                throw new SqlCompileError(
                    'Cannot use * inside an expression',
                    'Aggregate functions like count(*) are not supported; select a pre-defined metric instead',
                );
            }
            const resolved = resolveRefOrThrow(ctx, ref);
            if (
                !selectedSources.has(resolved.source) &&
                !ctx.tableCalcNames.has(resolved.source)
            ) {
                throw new SqlCompileError(
                    `Expression references "${resolved.source}" which is not in the SELECT list`,
                    'Table calculations can only reference selected dimensions, metrics, or previous expressions',
                );
            }
            return {
                type: 'ref',
                name: `__ldref__${resolved.source}__ferdl__`,
            };
        },
        call: (call) => {
            const fnName = call.function.name.toLowerCase();
            if (AGGREGATE_FUNCTIONS.has(fnName) && !call.over) {
                throw new SqlCompileError(
                    `Aggregate function "${fnName}" is not supported`,
                    'Metrics are already aggregated - select a pre-defined metric instead. Window functions (with OVER) are allowed.',
                );
            }
            const mapped = map.super().call(call);
            // astMapper does not descend into OVER clauses; rewrite refs there too
            if (mapped && 'over' in mapped && mapped.over) {
                return {
                    ...mapped,
                    over: {
                        ...mapped.over,
                        partitionBy: mapped.over.partitionBy?.map(
                            (e) => map.expr(e) ?? e,
                        ),
                        orderBy: mapped.over.orderBy?.map((ob) => ({
                            ...ob,
                            by: map.expr(ob.by) ?? ob.by,
                        })),
                    },
                };
            }
            return mapped;
        },
    }));
    const mapped = mapper.expr(expr);
    if (!mapped) {
        throw new SqlCompileError('Unsupported expression in SELECT');
    }
    const sql = toSql.expr(mapped);
    return sql.replace(
        /"?__ldref__([A-Za-z0-9_]+?)__ferdl__"?/g,
        (_, fieldId) => `\${${fieldId}}`,
    );
};

/** Map a supported binary comparison operator to a FilterOperator, optionally flipped */
const comparisonOperator = (
    op: string,
    flipped: boolean,
): FilterOperator | undefined => {
    switch (op) {
        case '=':
            return FilterOperator.EQUALS;
        case '!=':
            return FilterOperator.NOT_EQUALS;
        case '<':
            return flipped
                ? FilterOperator.GREATER_THAN
                : FilterOperator.LESS_THAN;
        case '<=':
            return flipped
                ? FilterOperator.GREATER_THAN_OR_EQUAL
                : FilterOperator.LESS_THAN_OR_EQUAL;
        case '>':
            return flipped
                ? FilterOperator.LESS_THAN
                : FilterOperator.GREATER_THAN;
        case '>=':
            return flipped
                ? FilterOperator.LESS_THAN_OR_EQUAL
                : FilterOperator.GREATER_THAN_OR_EQUAL;
        default:
            return undefined;
    }
};

/** Parse a LIKE/ILIKE pattern into a Lightdash string operator */
const likeToOperator = (
    pattern: string,
    negated: boolean,
): { operator: FilterOperator; value: string } => {
    const inner = pattern.replace(/^%|%$/g, '');
    if (inner.includes('%') || inner.includes('_')) {
        throw new SqlCompileError(
            `Unsupported LIKE pattern "${pattern}"`,
            "Only patterns of the form '%value%', 'value%', '%value' or 'value' are supported",
        );
    }
    const startsWithWildcard = pattern.startsWith('%');
    const endsWithWildcard = pattern.endsWith('%');
    if (startsWithWildcard && endsWithWildcard) {
        return {
            operator: negated
                ? FilterOperator.NOT_INCLUDE
                : FilterOperator.INCLUDE,
            value: inner,
        };
    }
    if (negated) {
        throw new SqlCompileError(
            `NOT LIKE with pattern "${pattern}" is not supported`,
            "Only NOT LIKE '%value%' (does not include) is supported",
        );
    }
    if (endsWithWildcard) {
        return { operator: FilterOperator.STARTS_WITH, value: inner };
    }
    if (startsWithWildcard) {
        return { operator: FilterOperator.ENDS_WITH, value: inner };
    }
    return { operator: FilterOperator.EQUALS, value: inner };
};

const NEGATED_OPERATORS: Partial<Record<FilterOperator, FilterOperator>> = {
    [FilterOperator.EQUALS]: FilterOperator.NOT_EQUALS,
    [FilterOperator.NOT_EQUALS]: FilterOperator.EQUALS,
    [FilterOperator.INCLUDE]: FilterOperator.NOT_INCLUDE,
    [FilterOperator.NOT_INCLUDE]: FilterOperator.INCLUDE,
    [FilterOperator.NULL]: FilterOperator.NOT_NULL,
    [FilterOperator.NOT_NULL]: FilterOperator.NULL,
    [FilterOperator.LESS_THAN]: FilterOperator.GREATER_THAN_OR_EQUAL,
    [FilterOperator.LESS_THAN_OR_EQUAL]: FilterOperator.GREATER_THAN,
    [FilterOperator.GREATER_THAN]: FilterOperator.LESS_THAN_OR_EQUAL,
    [FilterOperator.GREATER_THAN_OR_EQUAL]: FilterOperator.LESS_THAN,
};

type CompiledFilter = {
    item: FilterGroupItem;
    kinds: Set<ColumnKind>;
};

const isTautology = (expr: Expr): boolean => {
    if (expr.type === 'boolean' && expr.value === true) return true;
    if (
        expr.type === 'binary' &&
        expr.op === '=' &&
        isLiteralExpr(expr.left) &&
        isLiteralExpr(expr.right)
    ) {
        return literalValue(expr.left) === literalValue(expr.right);
    }
    return false;
};

const compileFilterExpr = (
    ctx: CompilerContext,
    expr: Expr,
): CompiledFilter => {
    const rule = (
        target: ResolvedColumn,
        operator: FilterOperator,
        values?: LiteralValue[],
    ): CompiledFilter => {
        const filterRule: FilterRule = {
            id: ctx.nextFilterId(),
            target: { fieldId: target.source },
            operator,
            ...(values !== undefined ? { values } : {}),
        };
        return { item: filterRule, kinds: new Set([target.kind]) };
    };

    switch (expr.type) {
        case 'binary': {
            const { op } = expr;
            if (op === 'AND' || op === 'OR') {
                const children = [
                    compileFilterExpr(ctx, expr.left),
                    compileFilterExpr(ctx, expr.right),
                ];
                const kinds = new Set(
                    children.flatMap((c) => Array.from(c.kinds)),
                );
                const group: FilterGroup =
                    op === 'AND'
                        ? {
                              id: ctx.nextFilterId(),
                              and: children.map((c) => c.item),
                          }
                        : {
                              id: ctx.nextFilterId(),
                              or: children.map((c) => c.item),
                          };
                return { item: group, kinds };
            }
            if (op === 'IN' || op === 'NOT IN') {
                if (expr.left.type !== 'ref') {
                    throw new SqlCompileError(
                        'IN filters must have a column on the left side',
                    );
                }
                if (
                    expr.right.type === 'select' ||
                    expr.right.type === 'union' ||
                    expr.right.type === 'union all' ||
                    expr.right.type === 'with'
                ) {
                    throw new SqlCompileError(
                        'IN filters must use a list of literal values',
                        'Subqueries are not supported',
                    );
                }
                const target = resolveRefOrThrow(ctx, expr.left);
                // single-element IN ('x') parses as a parenthesized literal, not a list
                const valueExprs =
                    expr.right.type === 'list'
                        ? expr.right.expressions
                        : [expr.right];
                const values = valueExprs.map(literalValue);
                if (values.some((v) => v === null)) {
                    throw new SqlCompileError(
                        'NULL is not supported inside IN lists',
                        'Use IS NULL instead',
                    );
                }
                return rule(
                    target,
                    op === 'IN'
                        ? FilterOperator.EQUALS
                        : FilterOperator.NOT_EQUALS,
                    values,
                );
            }
            if (
                op === 'LIKE' ||
                op === 'ILIKE' ||
                op === 'NOT LIKE' ||
                op === 'NOT ILIKE'
            ) {
                if (expr.left.type !== 'ref') {
                    throw new SqlCompileError(
                        'LIKE filters must have a column on the left side',
                    );
                }
                const target = resolveRefOrThrow(ctx, expr.left);
                const pattern = literalValue(expr.right);
                if (typeof pattern !== 'string') {
                    throw new SqlCompileError(
                        'LIKE patterns must be string literals',
                    );
                }
                const negated = op.startsWith('NOT');
                const { operator, value } = likeToOperator(pattern, negated);
                return rule(target, operator, [value]);
            }
            // plain comparison: one side must be a column ref, the other a literal
            const leftIsRef = expr.left.type === 'ref';
            const rightIsRef = expr.right.type === 'ref';
            let refSide: ExprRef | undefined;
            if (leftIsRef) refSide = expr.left as ExprRef;
            else if (rightIsRef) refSide = expr.right as ExprRef;
            const valueSide = leftIsRef ? expr.right : expr.left;
            if (!refSide || (leftIsRef && rightIsRef)) {
                throw new SqlCompileError(
                    `Unsupported filter: ${toSql.expr(expr)}`,
                    'Filters must compare a column to a literal value',
                );
            }
            const operator = comparisonOperator(op, !leftIsRef);
            if (!operator) {
                throw new SqlCompileError(
                    `Unsupported operator "${op}" in filter`,
                );
            }
            const target = resolveRefOrThrow(ctx, refSide);
            const value = literalValue(valueSide);
            if (value === null) {
                throw new SqlCompileError(
                    'Cannot compare to NULL with = or !=',
                    'Use IS NULL or IS NOT NULL instead',
                );
            }
            return rule(target, operator, [value]);
        }
        case 'unary': {
            switch (expr.op) {
                case 'IS NULL':
                case 'IS NOT NULL': {
                    if (expr.operand.type !== 'ref') {
                        throw new SqlCompileError(
                            'IS NULL must be applied to a column',
                        );
                    }
                    const target = resolveRefOrThrow(ctx, expr.operand);
                    return rule(
                        target,
                        expr.op === 'IS NULL'
                            ? FilterOperator.NULL
                            : FilterOperator.NOT_NULL,
                    );
                }
                case 'IS TRUE':
                case 'IS FALSE':
                case 'IS NOT TRUE':
                case 'IS NOT FALSE': {
                    if (expr.operand.type !== 'ref') {
                        throw new SqlCompileError(
                            `${expr.op} must be applied to a column`,
                        );
                    }
                    const target = resolveRefOrThrow(ctx, expr.operand);
                    const isNegated = expr.op.includes('NOT');
                    const boolValue = expr.op.endsWith('TRUE');
                    return rule(
                        target,
                        isNegated
                            ? FilterOperator.NOT_EQUALS
                            : FilterOperator.EQUALS,
                        [boolValue],
                    );
                }
                case 'NOT': {
                    // bare boolean column: NOT my_bool_col
                    if (expr.operand.type === 'ref') {
                        const target = resolveRefOrThrow(ctx, expr.operand);
                        return rule(target, FilterOperator.EQUALS, [false]);
                    }
                    const inner = compileFilterExpr(ctx, expr.operand);
                    if ('and' in inner.item || 'or' in inner.item) {
                        throw new SqlCompileError(
                            'NOT over AND/OR groups is not supported',
                            'Rewrite the filter without NOT, e.g. using != or NOT IN',
                        );
                    }
                    const innerRule = inner.item as FilterRule;
                    const negatedOp = NEGATED_OPERATORS[innerRule.operator];
                    if (!negatedOp) {
                        throw new SqlCompileError(
                            `Cannot negate operator "${innerRule.operator}"`,
                        );
                    }
                    return {
                        item: { ...innerRule, operator: negatedOp },
                        kinds: inner.kinds,
                    };
                }
                default:
                    throw new SqlCompileError(
                        `Unsupported operator "${expr.op}" in filter`,
                    );
            }
        }
        case 'ternary': {
            if (expr.value.type !== 'ref') {
                throw new SqlCompileError(
                    'BETWEEN must be applied to a column',
                );
            }
            const target = resolveRefOrThrow(ctx, expr.value);
            const lo = literalValue(expr.lo);
            const hi = literalValue(expr.hi);
            if (expr.op === 'BETWEEN') {
                const group: FilterGroup = {
                    id: ctx.nextFilterId(),
                    and: [
                        {
                            id: ctx.nextFilterId(),
                            target: { fieldId: target.source },
                            operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                            values: [lo],
                        },
                        {
                            id: ctx.nextFilterId(),
                            target: { fieldId: target.source },
                            operator: FilterOperator.LESS_THAN_OR_EQUAL,
                            values: [hi],
                        },
                    ],
                };
                return { item: group, kinds: new Set([target.kind]) };
            }
            const group: FilterGroup = {
                id: ctx.nextFilterId(),
                or: [
                    {
                        id: ctx.nextFilterId(),
                        target: { fieldId: target.source },
                        operator: FilterOperator.LESS_THAN,
                        values: [lo],
                    },
                    {
                        id: ctx.nextFilterId(),
                        target: { fieldId: target.source },
                        operator: FilterOperator.GREATER_THAN,
                        values: [hi],
                    },
                ],
            };
            return { item: group, kinds: new Set([target.kind]) };
        }
        case 'ref': {
            // bare boolean column: WHERE my_bool_col
            const target = resolveRefOrThrow(ctx, expr);
            return rule(target, FilterOperator.EQUALS, [true]);
        }
        default:
            throw new SqlCompileError(
                `Unsupported filter expression: ${toSql.expr(expr)}`,
                'Supported filters: =, !=, <, <=, >, >=, IN, NOT IN, LIKE, ILIKE, BETWEEN, IS NULL, IS NOT NULL, AND, OR, NOT',
            );
    }
};

/** Flatten nested ANDs into a list of conjuncts */
const flattenAnd = (expr: Expr): Expr[] => {
    if (expr.type === 'binary' && expr.op === 'AND') {
        return [...flattenAnd(expr.left), ...flattenAnd(expr.right)];
    }
    return [expr];
};

const groupItems = (
    ctx: CompilerContext,
    items: FilterGroupItem[],
): FilterGroup | undefined => {
    if (items.length === 0) return undefined;
    return { id: ctx.nextFilterId(), and: items };
};

const asSingleKind = (
    filter: CompiledFilter,
    context: 'WHERE' | 'HAVING',
): ColumnKind => {
    if (filter.kinds.size !== 1) {
        throw new SqlCompileError(
            `A single ${context} condition cannot mix dimensions, metrics and table calculations with OR`,
            'Split the condition into separate AND-ed conditions per field type',
        );
    }
    return filter.kinds.values().next().value as ColumnKind;
};

const parseStatement = (sql: string): Statement[] => {
    try {
        return parse(sql);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new SqlCompileError(`SQL syntax error: ${message}`);
    }
};

/**
 * Compile a Postgres SELECT statement into a Lightdash MetricQuery against
 * one of the explores in the catalog.
 */
export const compileSqlToMetricQuery = (
    sql: string,
    catalog: PgWireTable[],
): PgWireCompiledQuery => {
    const statements = parseStatement(sql);
    if (statements.length !== 1) {
        throw new SqlCompileError(
            'Exactly one SQL statement is supported per query',
        );
    }
    const [statement] = statements;
    if (statement.type !== 'select') {
        throw new SqlCompileError(
            `${statement.type.toUpperCase()} statements are not supported`,
            'Only SELECT queries can be run against the Lightdash semantic layer',
        );
    }
    const select = statement as SelectFromStatement;

    if (select.distinct) {
        throw new SqlCompileError(
            'SELECT DISTINCT is not supported',
            'Results are already grouped by the selected dimensions',
        );
    }

    // FROM: exactly one explore, no joins
    if (!select.from || select.from.length === 0) {
        throw new SqlCompileError(
            'Missing FROM clause',
            'Query an explore, e.g. SELECT ... FROM orders',
        );
    }
    if (select.from.some((f) => f.join)) {
        throw new SqlCompileError(
            'JOINs are not supported',
            'Joins are defined in the Lightdash explore itself - joined table fields are available as columns',
        );
    }
    if (select.from.length > 1) {
        throw new SqlCompileError(
            'Only one table is supported in FROM',
            'Joins are defined in the Lightdash explore itself',
        );
    }
    const [from] = select.from;
    if (from.type !== 'table') {
        throw new SqlCompileError(
            'FROM must reference an explore by name',
            'Subqueries and function calls in FROM are not supported',
        );
    }
    const tableName = from.name.name;
    const table = catalog.find((t) => t.name === tableName);
    if (!table) {
        throw new SqlCompileError(
            `Table "${tableName}" does not exist`,
            `Available tables: ${catalog.map((t) => t.name).join(', ')}`,
        );
    }

    let filterIdCounter = 0;
    const ctx: CompilerContext = {
        table,
        fieldMap: new Map(table.fields.map((f) => [f.fieldId, f])),
        fromNames: new Set(
            from.name.alias ? [tableName, from.name.alias] : [tableName],
        ),
        aliasMap: new Map(),
        tableCalcNames: new Set(),
        nextFilterId: () => {
            filterIdCounter += 1;
            return `pgwire_${filterIdCounter}`;
        },
    };

    // SELECT list
    const dimensions: string[] = [];
    const metrics: string[] = [];
    const tableCalculations: TableCalculation[] = [];
    const columns: PgWireColumn[] = [];
    const selectedSources = new Set<string>();

    const addField = (resolved: ResolvedColumn, outputName: string) => {
        if (resolved.kind === 'dimension') {
            if (!dimensions.includes(resolved.source)) {
                dimensions.push(resolved.source);
            }
        } else if (resolved.kind === 'metric') {
            if (!metrics.includes(resolved.source)) {
                metrics.push(resolved.source);
            }
        }
        selectedSources.add(resolved.source);
        columns.push({
            name: outputName,
            source: resolved.source,
            kind: resolved.kind,
            type: resolved.type,
        });
    };

    const selectColumns: SelectedColumn[] = select.columns ?? [];
    if (selectColumns.length === 0) {
        throw new SqlCompileError('SELECT list cannot be empty');
    }

    const handleSelectedColumn = (col: SelectedColumn): void => {
        const { expr } = col;
        // SELECT * or SELECT table.*
        if (expr.type === 'ref' && expr.name === '*') {
            if (expr.table && !ctx.fromNames.has(expr.table.name)) {
                throw new SqlCompileError(
                    `Unknown table "${expr.table.name}" in select list`,
                );
            }
            for (const field of table.fields) {
                addField(
                    {
                        source: field.fieldId,
                        kind: field.kind,
                        type: field.type,
                    },
                    field.fieldId,
                );
            }
            return;
        }
        if (expr.type === 'ref') {
            const resolved = resolveRefOrThrow(ctx, expr);
            if (resolved.kind === 'table_calculation') {
                throw new SqlCompileError(
                    `"${expr.name}" is already defined in this SELECT list`,
                );
            }
            const outputName = col.alias?.name ?? resolved.source;
            addField(resolved, outputName);
            if (col.alias) {
                ctx.aliasMap.set(col.alias.name, resolved);
            }
            return;
        }
        // any other expression becomes a table calculation and requires an alias
        if (!col.alias) {
            throw new SqlCompileError(
                `Expressions in SELECT must have an alias: ${toSql.expr(expr)}`,
                'Add "AS name" after the expression',
            );
        }
        const calcName = col.alias.name;
        if (ctx.fieldMap.has(calcName)) {
            throw new SqlCompileError(
                `Alias "${calcName}" conflicts with an existing column name`,
                'Choose a different alias',
            );
        }
        if (ctx.tableCalcNames.has(calcName) || ctx.aliasMap.has(calcName)) {
            throw new SqlCompileError(
                `Duplicate alias "${calcName}" in SELECT list`,
            );
        }
        const calcSql = exprToTableCalcSql(ctx, expr, selectedSources);
        tableCalculations.push({
            name: calcName,
            displayName: calcName,
            sql: calcSql,
        });
        ctx.tableCalcNames.add(calcName);
        const resolved: ResolvedColumn = {
            source: calcName,
            kind: 'table_calculation',
            type: null,
        };
        ctx.aliasMap.set(calcName, resolved);
        columns.push({
            name: calcName,
            source: calcName,
            kind: 'table_calculation',
            type: null,
        });
    };
    selectColumns.forEach(handleSelectedColumn);

    if (dimensions.length === 0 && metrics.length === 0) {
        throw new SqlCompileError(
            'Select at least one dimension or metric',
            'Table calculations must be combined with at least one field',
        );
    }

    // WHERE: split conjuncts into dimension / metric / table calculation filters
    const dimensionFilters: FilterGroupItem[] = [];
    const metricFilters: FilterGroupItem[] = [];
    const tableCalcFilters: FilterGroupItem[] = [];

    if (select.where) {
        for (const conjunct of flattenAnd(select.where)) {
            if (!isTautology(conjunct)) {
                const compiled = compileFilterExpr(ctx, conjunct);
                const kind = asSingleKind(compiled, 'WHERE');
                if (kind === 'dimension') dimensionFilters.push(compiled.item);
                else if (kind === 'metric') metricFilters.push(compiled.item);
                else tableCalcFilters.push(compiled.item);
            }
        }
    }

    // HAVING: metric filters only
    if (select.having) {
        for (const conjunct of flattenAnd(select.having)) {
            if (!isTautology(conjunct)) {
                const compiled = compileFilterExpr(ctx, conjunct);
                const kind = asSingleKind(compiled, 'HAVING');
                if (kind !== 'metric') {
                    throw new SqlCompileError(
                        'HAVING can only filter on metrics',
                        'Move dimension filters to the WHERE clause',
                    );
                }
                metricFilters.push(compiled.item);
            }
        }
    }

    const filters: Filters = {};
    const dimensionGroup = groupItems(ctx, dimensionFilters);
    if (dimensionGroup) filters.dimensions = dimensionGroup;
    const metricGroup = groupItems(ctx, metricFilters);
    if (metricGroup) filters.metrics = metricGroup;
    const tableCalcGroup = groupItems(ctx, tableCalcFilters);
    if (tableCalcGroup) filters.tableCalculations = tableCalcGroup;

    // GROUP BY: validate it matches the selected dimensions (grouping is implicit)
    if (select.groupBy && select.groupBy.length > 0) {
        const grouped = new Set<string>();
        for (const groupExpr of select.groupBy) {
            let resolved: ResolvedColumn;
            if (groupExpr.type === 'integer') {
                const ordinal = groupExpr.value;
                if (ordinal < 1 || ordinal > columns.length) {
                    throw new SqlCompileError(
                        `GROUP BY position ${ordinal} is not in the select list`,
                    );
                }
                const column = columns[ordinal - 1];
                resolved = {
                    source: column.source,
                    kind: column.kind,
                    type: column.type,
                };
            } else if (groupExpr.type === 'ref') {
                resolved = resolveRefOrThrow(ctx, groupExpr);
            } else {
                throw new SqlCompileError(
                    'GROUP BY only supports column names or positions',
                );
            }
            if (resolved.kind !== 'dimension') {
                throw new SqlCompileError(
                    `Cannot GROUP BY "${resolved.source}" - only dimensions can be grouped`,
                );
            }
            if (!dimensions.includes(resolved.source)) {
                throw new SqlCompileError(
                    `GROUP BY column "${resolved.source}" must be in the SELECT list`,
                );
            }
            grouped.add(resolved.source);
        }
        const missing = dimensions.filter((d) => !grouped.has(d));
        if (missing.length > 0) {
            throw new SqlCompileError(
                `Selected dimensions must appear in GROUP BY: ${missing.join(', ')}`,
                'Lightdash always groups by all selected dimensions; either list them all or omit GROUP BY entirely',
            );
        }
    }

    // ORDER BY
    const sorts: SortField[] = [];
    for (const orderBy of select.orderBy ?? []) {
        let source: string;
        if (orderBy.by.type === 'integer') {
            const ordinal = orderBy.by.value;
            if (ordinal < 1 || ordinal > columns.length) {
                throw new SqlCompileError(
                    `ORDER BY position ${ordinal} is not in the select list`,
                );
            }
            source = columns[ordinal - 1].source;
        } else if (orderBy.by.type === 'ref') {
            const resolved = resolveRefOrThrow(ctx, orderBy.by);
            source = resolved.source;
        } else {
            throw new SqlCompileError(
                'ORDER BY only supports column names or positions',
            );
        }
        if (!selectedSources.has(source) && !ctx.tableCalcNames.has(source)) {
            throw new SqlCompileError(
                `ORDER BY column "${source}" must be in the SELECT list`,
            );
        }
        sorts.push({
            fieldId: source,
            descending: orderBy.order === 'DESC',
            ...(orderBy.nulls ? { nullsFirst: orderBy.nulls === 'FIRST' } : {}),
        });
    }

    // LIMIT / OFFSET
    let limit = PGWIRE_DEFAULT_LIMIT;
    if (select.limit) {
        if (select.limit.offset) {
            const offsetValue =
                select.limit.offset.type === 'integer'
                    ? select.limit.offset.value
                    : undefined;
            if (offsetValue !== 0) {
                throw new SqlCompileError('OFFSET is not supported');
            }
        }
        if (select.limit.limit) {
            if (select.limit.limit.type !== 'integer') {
                throw new SqlCompileError('LIMIT must be an integer literal');
            }
            limit = select.limit.limit.value;
        }
    }

    const metricQuery: MetricQuery = {
        exploreName: table.name,
        dimensions,
        metrics,
        filters,
        sorts,
        limit,
        tableCalculations,
    };

    return { table, metricQuery, columns };
};
