import {
    CustomDimensionType,
    FilterOperator,
    getCustomMetricType,
    MetricType,
    timeFrameConfigs,
    TimeFrames,
    type AdditionalMetric,
    type CustomSqlDimension,
    type DimensionType,
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
    type ExprCast,
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
    /** underlying catalog field; null for table calculations and derived metrics */
    field: PgWireField | null;
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

const castTargetName = (cast: ExprCast): string =>
    'name' in cast.to && typeof cast.to.name === 'string'
        ? cast.to.name.toLowerCase()
        : '';

const isDateTypeName = (name: string): boolean =>
    name === 'date' || name.startsWith('timestamp');

const NUMERIC_TYPE_NAMES = new Set([
    'int',
    'int2',
    'int4',
    'int8',
    'integer',
    'smallint',
    'bigint',
    'numeric',
    'decimal',
    'real',
    'float',
    'float4',
    'float8',
    'double precision',
]);

/** EXTRACT / DATE_PART fields that read as a Lightdash time frame of the same dimension */
const EXTRACT_PART_FRAMES: Record<string, TimeFrames> = {
    year: TimeFrames.YEAR_NUM,
    quarter: TimeFrames.QUARTER_NUM,
    month: TimeFrames.MONTH_NUM,
    week: TimeFrames.WEEK_NUM,
    day: TimeFrames.DAY_OF_MONTH_NUM,
    doy: TimeFrames.DAY_OF_YEAR_NUM,
    hour: TimeFrames.HOUR_OF_DAY_NUM,
    minute: TimeFrames.MINUTE_OF_HOUR_NUM,
};

const DATE_TRUNC_PART_FRAMES: Record<string, TimeFrames> = {
    year: TimeFrames.YEAR,
    quarter: TimeFrames.QUARTER,
    month: TimeFrames.MONTH,
    week: TimeFrames.WEEK,
    day: TimeFrames.DAY,
    hour: TimeFrames.HOUR,
    minute: TimeFrames.MINUTE,
    second: TimeFrames.SECOND,
    milliseconds: TimeFrames.MILLISECOND,
};

/** frames that need a time of day, so a DATE dimension cannot provide them */
const TIME_OF_DAY_FRAMES = new Set<TimeFrames>([
    TimeFrames.HOUR,
    TimeFrames.MINUTE,
    TimeFrames.SECOND,
    TimeFrames.MILLISECOND,
    TimeFrames.HOUR_OF_DAY_NUM,
    TimeFrames.MINUTE_OF_HOUR_NUM,
]);

type DatePartExpr = {
    frame: TimeFrames;
    ref: ExprRef;
};

type DatePartFunction = 'extract' | 'date_trunc';

const DATE_PART_FRAMES: Record<DatePartFunction, Record<string, TimeFrames>> = {
    extract: EXTRACT_PART_FRAMES,
    date_trunc: DATE_TRUNC_PART_FRAMES,
};

/**
 * `[CAST(]EXTRACT(part FROM col[::TIMESTAMP])[ AS INT)]`, `DATE_PART('part', col)`
 * and `DATE_TRUNC('part', col)[::DATE]`: BI tools derive date parts from a date
 * column this way. They read as the column's Lightdash time frame, so the
 * warehouse computes them at the query grain instead of a table calculation.
 */
const datePartExpr = (expr: Expr): DatePartExpr | null => {
    const inner = expr.type === 'cast' ? expr.operand : expr;
    let part: string;
    let source: Expr;
    let fn: DatePartFunction;
    if (inner.type === 'extract') {
        part = inner.field.name.toLowerCase();
        source = inner.from;
        fn = 'extract';
    } else if (
        inner.type === 'call' &&
        !inner.over &&
        inner.args.length === 2 &&
        inner.args[0].type === 'string'
    ) {
        const name = inner.function.name.toLowerCase();
        if (name !== 'date_part' && name !== 'date_trunc') return null;
        part = inner.args[0].value.toLowerCase();
        [, source] = inner.args;
        fn = name === 'date_trunc' ? 'date_trunc' : 'extract';
    } else {
        return null;
    }
    // an outer cast is only dropped when it keeps the value domain
    if (expr.type === 'cast') {
        const to = castTargetName(expr);
        const keepsDomain =
            fn === 'date_trunc'
                ? isDateTypeName(to)
                : NUMERIC_TYPE_NAMES.has(to);
        if (!keepsDomain) return null;
    }
    if (source.type === 'cast' && isDateTypeName(castTargetName(source))) {
        source = source.operand;
    }
    if (source.type !== 'ref' || source.name === '*') return null;
    if (fn === 'extract' && (part === 'dow' || part === 'isodow')) {
        throw new SqlCompileError(
            `EXTRACT(${part.toUpperCase()}) is not supported`,
            "Postgres numbers weekdays 0-6 from Sunday while Lightdash uses 1-7 from the project start of week; select the dimension's day-of-week interval column instead",
        );
    }
    const frame = DATE_PART_FRAMES[fn][part];
    return frame ? { frame, ref: source } : null;
};

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
                field,
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

/** WHERE 1=0 and friends: the schema-probe idiom connectors use to read a table's shape */
const isContradiction = (expr: Expr): boolean => {
    if (expr.type === 'boolean' && expr.value === false) return true;
    if (
        expr.type === 'binary' &&
        (expr.op === '=' || expr.op === '!=') &&
        isLiteralExpr(expr.left) &&
        isLiteralExpr(expr.right)
    ) {
        const equal = literalValue(expr.left) === literalValue(expr.right);
        return expr.op === '=' ? !equal : equal;
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
function compileSelect(
    select: SelectFromStatement,
    catalog: PgWireTable[],
): PgWireCompiledQuery {
    /**
     * Connectors probe a table's shape as `SELECT * FROM (query) alias [WHERE 1=0]
     * [LIMIT n]`. When the wrapper adds nothing but a constant predicate or a
     * limit, compile the inner query and fold the wrapper into it.
     */
    const unwrapTrivialSubquery = (): PgWireCompiledQuery | null => {
        const [from] = select.from ?? [];
        if (
            !from ||
            (select.from ?? []).length !== 1 ||
            from.type !== 'statement' ||
            from.statement.type !== 'select' ||
            from.join
        ) {
            return null;
        }
        const selectsStar =
            (select.columns ?? []).length === 1 &&
            select.columns?.[0].expr.type === 'ref' &&
            select.columns[0].expr.name === '*';
        const whereConjuncts = select.where ? flattenAnd(select.where) : [];
        const wrapperIsTrivial =
            selectsStar &&
            !select.orderBy?.length &&
            !select.groupBy?.length &&
            !select.having &&
            !select.distinct &&
            whereConjuncts.every(
                (conjunct) =>
                    isTautology(conjunct) || isContradiction(conjunct),
            );
        if (!wrapperIsTrivial) {
            return null;
        }
        const inner = compileSelect(from.statement, catalog);
        const outerLimit =
            select.limit?.limit?.type === 'integer'
                ? select.limit.limit.value
                : undefined;
        const limit =
            outerLimit === undefined
                ? inner.metricQuery.limit
                : Math.min(inner.metricQuery.limit, outerLimit);
        return {
            ...inner,
            metricQuery: { ...inner.metricQuery, limit },
            alwaysEmpty:
                inner.alwaysEmpty ||
                limit === 0 ||
                whereConjuncts.some(isContradiction),
        };
    };
    /**
     * `count(*)`, `count(1)` and `count()`: row counts, which connectors ask for
     * when registering a dataset. They compile to a system COUNT(*) metric, so a
     * bare count is the table's row count and a grouped one counts rows per group.
     */
    const isCountStar = (expr: Expr): boolean => {
        if (
            expr.type !== 'call' ||
            expr.function.name.toLowerCase() !== 'count' ||
            expr.distinct === 'distinct' ||
            expr.over
        ) {
            return false;
        }
        if (expr.args.length === 0) {
            return true;
        }
        if (expr.args.length !== 1) {
            return false;
        }
        const [arg] = expr.args;
        return (
            (arg.type === 'ref' && arg.name === '*') ||
            arg.type === 'integer' ||
            arg.type === 'numeric' ||
            arg.type === 'string' ||
            arg.type === 'boolean'
        );
    };

    const ROW_COUNT_METRIC_NAME = 'pgwire_row_count';

    /**
     * BI tools re-aggregate every measure they chart (`SUM(metric) AS metric`).
     * Metrics are already aggregated at the query's grain, so an aggregate over a
     * metric column means "this metric": the outer aggregate is dropped, the way
     * semantic-layer SQL APIs conventionally treat measures.
     */
    const AGGREGATE_PASSTHROUGH_FUNCTIONS = new Set([
        'sum',
        'min',
        'max',
        'avg',
    ]);

    const passthroughMetricRef = (expr: Expr): ExprRef | null => {
        if (
            expr.type !== 'call' ||
            !AGGREGATE_PASSTHROUGH_FUNCTIONS.has(
                expr.function.name.toLowerCase(),
            ) ||
            expr.distinct === 'distinct' ||
            expr.over ||
            expr.args.length !== 1
        ) {
            return null;
        }
        const [arg] = expr.args;
        return arg.type === 'ref' && arg.name !== '*' ? arg : null;
    };

    /**
     * BI tools also aggregate raw dimension columns: Looker Studio probes date
     * ranges with MIN(DATE(col)) and charts numeric dimensions as SUM(col).
     * These compile to ad-hoc additional metrics over the dimension, the same
     * way custom metrics are built from dimensions in the explorer.
     */
    const DIMENSION_AGGREGATE_TYPES: Record<string, MetricType> = {
        sum: MetricType.SUM,
        min: MetricType.MIN,
        max: MetricType.MAX,
        avg: MetricType.AVERAGE,
        count: MetricType.COUNT,
        median: MetricType.MEDIAN,
    };

    type DimensionAggregateArg = {
        ref: ExprRef;
        castTo: 'date' | 'timestamp' | null;
    };

    /** MIN/MAX commute with monotonic date conversions, so DATE(col) and date casts unwrap */
    const unwrapAggregateArg = (
        fn: string,
        arg: Expr,
    ): DimensionAggregateArg | null => {
        if (arg.type === 'ref' && arg.name !== '*') {
            return { ref: arg, castTo: null };
        }
        if (fn !== 'min' && fn !== 'max') return null;
        if (
            arg.type === 'call' &&
            arg.function.name.toLowerCase() === 'date' &&
            arg.args.length === 1 &&
            arg.args[0].type === 'ref'
        ) {
            return { ref: arg.args[0], castTo: 'date' };
        }
        if (arg.type === 'cast' && arg.operand.type === 'ref') {
            const to = castTargetName(arg);
            if (to === 'date') return { ref: arg.operand, castTo: 'date' };
            if (to.startsWith('timestamp')) {
                return { ref: arg.operand, castTo: 'timestamp' };
            }
        }
        return null;
    };

    /** Postgres-style default output name for an unaliased expression, unique within the statement */
    const autoNameBase = (expr: Expr): string => {
        switch (expr.type) {
            case 'call':
                return expr.function.name.toLowerCase();
            case 'extract':
                return 'extract';
            case 'cast':
                return expr.operand.type === 'call' ||
                    expr.operand.type === 'extract'
                    ? autoNameBase(expr.operand)
                    : '?column?';
            default:
                return '?column?';
        }
    };

    const autoName = (ctx: CompilerContext, expr: Expr): string => {
        const base = autoNameBase(expr);
        let name = base;
        for (
            let n = 2;
            ctx.fieldMap.has(name) ||
            ctx.tableCalcNames.has(name) ||
            ctx.aliasMap.has(name);
            n += 1
        ) {
            name = `${base}_${n}`;
        }
        return name;
    };

    const unwrapped = unwrapTrivialSubquery();
    if (unwrapped) {
        return unwrapped;
    }

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
    const additionalMetrics: AdditionalMetric[] = [];
    const rowCountFieldId = `${table.name}_${ROW_COUNT_METRIC_NAME}`;
    const tableCalculations: TableCalculation[] = [];
    const customDimensions: CustomSqlDimension[] = [];
    const columns: PgWireColumn[] = [];
    const selectedSources = new Set<string>();
    /** SELECT expressions by SQL text, so ORDER BY / GROUP BY can repeat them */
    const selectExprColumns = new Map<string, PgWireColumn>();

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

    /** Compile an aggregate over a dimension column into an additional metric */
    const tryDimensionAggregate = (col: SelectedColumn): boolean => {
        const { expr } = col;
        if (expr.type !== 'call' || expr.over || expr.args.length !== 1) {
            return false;
        }
        const fn = expr.function.name.toLowerCase();
        if (!(fn in DIMENSION_AGGREGATE_TYPES)) return false;
        const distinct = expr.distinct === 'distinct';
        if (distinct && fn !== 'count') return false;
        const arg = unwrapAggregateArg(fn, expr.args[0]);
        if (!arg) return false;
        const resolved = resolveRef(ctx, arg.ref);
        if (!resolved?.field || resolved.kind !== 'dimension') return false;
        const { field } = resolved;
        const metricType = distinct
            ? MetricType.COUNT_DISTINCT
            : DIMENSION_AGGREGATE_TYPES[fn];
        const allowedTypes = getCustomMetricType(field.type as DimensionType);
        if (!allowedTypes.includes(metricType)) {
            throw new SqlCompileError(
                `Aggregate function "${fn}" is not supported for ${field.type} dimension "${field.fieldId}"`,
                `Supported aggregates for this column: ${allowedTypes.join(', ')}`,
            );
        }
        // identity conversions (DATE over a date dimension) add nothing
        const castTo = arg.castTo === field.type ? null : arg.castTo;
        const dimensionRef = `\${${field.table}.${field.name}}`;
        const metricName = castTo
            ? `${field.name}_pgwire_${metricType}_${castTo}`
            : `${field.name}_pgwire_${metricType}`;
        const fieldId = `${field.table}_${metricName}`;
        if (!metrics.includes(fieldId)) {
            additionalMetrics.push({
                name: metricName,
                table: field.table,
                sql: castTo
                    ? `CAST(${dimensionRef} AS ${castTo.toUpperCase()})`
                    : dimensionRef,
                type: metricType,
                ...(castTo ? {} : { baseDimensionName: field.name }),
            });
            metrics.push(fieldId);
        }
        // MIN/MAX preserve the dimension's value domain; others are numeric
        const outputType =
            metricType === MetricType.MIN || metricType === MetricType.MAX
                ? (castTo ?? field.type)
                : metricType;
        selectedSources.add(fieldId);
        columns.push({
            name: col.alias?.name ?? autoName(ctx, expr),
            source: fieldId,
            kind: 'metric',
            type: outputType,
        });
        if (col.alias) {
            ctx.aliasMap.set(col.alias.name, {
                source: fieldId,
                kind: 'metric',
                type: outputType,
                field: null,
            });
        }
        return true;
    };

    /**
     * Compile a date part of a date/timestamp dimension to its time frame: the
     * explore's own interval dimension when it has one, else a custom SQL
     * dimension from the same time-frame SQL the model compiler uses. The
     * project's start of week is not applied, so a synthesised WEEK follows
     * the warehouse default like the SQL the client wrote.
     */
    const tryDatePart = (col: SelectedColumn): boolean => {
        const part = datePartExpr(col.expr);
        if (!part) return false;
        const resolved = resolveRefOrThrow(ctx, part.ref);
        const { field } = resolved;
        if (
            !field ||
            field.kind !== 'dimension' ||
            (field.type !== 'date' && field.type !== 'timestamp')
        ) {
            throw new SqlCompileError(
                `"${resolved.source}" is not a date or timestamp dimension`,
                'Date parts can only be taken from date or timestamp columns',
            );
        }
        if (field.type === 'date' && TIME_OF_DAY_FRAMES.has(part.frame)) {
            throw new SqlCompileError(
                `Date dimension "${field.fieldId}" has no time component`,
                'Hours and minutes can only be taken from timestamp columns',
            );
        }
        const baseDimensionName =
            field.timeInterval?.baseDimensionName ?? field.name;
        const existing = table.fields.find(
            (f) =>
                f.kind === 'dimension' &&
                f.table === field.table &&
                f.timeInterval?.baseDimensionName === baseDimensionName &&
                f.timeInterval.frame === part.frame,
        );
        let column: ResolvedColumn;
        if (existing) {
            column = {
                source: existing.fieldId,
                kind: 'dimension',
                type: existing.type,
                field: existing,
            };
        } else {
            const config = timeFrameConfigs[part.frame];
            const fieldType = field.type as DimensionType;
            const name = `${field.name}_pgwire_${part.frame.toLowerCase()}`;
            const id = `${field.table}_${name}`;
            const dimensionType = config.getDimensionType(fieldType);
            if (!customDimensions.some((d) => d.id === id)) {
                customDimensions.push({
                    id,
                    name,
                    table: field.table,
                    type: CustomDimensionType.SQL,
                    sql: config.getSql(
                        table.targetDatabase,
                        part.frame,
                        `\${${field.table}.${field.name}}`,
                        fieldType,
                    ),
                    dimensionType,
                });
            }
            column = {
                source: id,
                kind: 'dimension',
                type: dimensionType,
                field: null,
            };
        }
        addField(column, col.alias?.name ?? autoName(ctx, col.expr));
        if (col.alias) {
            ctx.aliasMap.set(col.alias.name, column);
        }
        return true;
    };

    const handleSelectedColumn = (col: SelectedColumn): void => {
        const { expr } = col;
        // count(*): a system COUNT(*) metric on the explore's base table
        if (isCountStar(expr)) {
            if (!metrics.includes(rowCountFieldId)) {
                additionalMetrics.push({
                    name: ROW_COUNT_METRIC_NAME,
                    table: table.name,
                    sql: '*',
                    type: MetricType.COUNT,
                });
                metrics.push(rowCountFieldId);
            }
            columns.push({
                name: col.alias?.name ?? 'count',
                source: rowCountFieldId,
                kind: 'metric',
                type: 'count',
            });
            return;
        }
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
                        field,
                    },
                    field.fieldId,
                );
            }
            return;
        }
        // SUM(metric) and friends: the metric itself, at this query's grain
        const aggregatedRef = passthroughMetricRef(expr);
        if (aggregatedRef) {
            const resolved = resolveRefOrThrow(ctx, aggregatedRef);
            if (resolved.kind === 'metric') {
                const outputName = col.alias?.name ?? resolved.source;
                addField(resolved, outputName);
                if (col.alias) {
                    ctx.aliasMap.set(col.alias.name, resolved);
                }
                return;
            }
            // aggregates over dimension columns become additional metrics below
        }
        if (tryDimensionAggregate(col) || tryDatePart(col)) {
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
        // a bare aggregate that did not pass through gets the aggregation
        // explanation, not a confusing alias-conflict or table-calc error
        if (
            expr.type === 'call' &&
            AGGREGATE_FUNCTIONS.has(expr.function.name.toLowerCase()) &&
            !expr.over
        ) {
            throw new SqlCompileError(
                `Aggregate function "${expr.function.name.toLowerCase()}" is not supported here`,
                'Metrics are already aggregated at the query grain: SUM, MIN, MAX and AVG directly over a metric column are treated as the metric itself. SUM/MIN/MAX/AVG/COUNT/COUNT DISTINCT/MEDIAN over a single dimension column compile to ad-hoc metrics; other aggregate shapes are not supported.',
            );
        }
        // any other expression becomes a table calculation; name it like
        // Postgres when no alias is given (function name, else ?column?)
        const calcName = col.alias?.name ?? autoName(ctx, expr);
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
            field: null,
        };
        ctx.aliasMap.set(calcName, resolved);
        columns.push({
            name: calcName,
            source: calcName,
            kind: 'table_calculation',
            type: null,
        });
    };
    selectColumns.forEach((col) => {
        const before = columns.length;
        handleSelectedColumn(col);
        // SELECT * adds many columns and has no single expression to repeat
        if (columns.length === before + 1) {
            selectExprColumns.set(toSql.expr(col.expr), columns[before]);
        }
    });

    const resolvedFromColumn = (column: PgWireColumn): ResolvedColumn => ({
        source: column.source,
        kind: column.kind,
        type: column.type,
        field: null,
    });

    const requireSelectExpr = (
        expr: Expr,
        clause: 'GROUP BY' | 'ORDER BY',
    ): PgWireColumn => {
        const column = selectExprColumns.get(toSql.expr(expr));
        if (!column) {
            throw new SqlCompileError(
                `${clause} expression must appear in the SELECT list`,
                `Only column names, positions and expressions repeated from the SELECT list can be used in ${clause}`,
            );
        }
        return column;
    };

    // constants-only probes (SELECT 1 FROM t) still need a field to query by;
    // carry the first dimension without exposing it as an output column
    if (
        dimensions.length === 0 &&
        metrics.length === 0 &&
        tableCalculations.length > 0
    ) {
        const carrier = table.fields.find((f) => f.kind === 'dimension');
        if (carrier) {
            dimensions.push(carrier.fieldId);
        }
    }

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

    let alwaysEmpty = false;
    if (select.where) {
        for (const conjunct of flattenAnd(select.where)) {
            if (isContradiction(conjunct)) {
                alwaysEmpty = true;
            } else if (!isTautology(conjunct)) {
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
                resolved = resolvedFromColumn(columns[ordinal - 1]);
            } else if (groupExpr.type === 'ref') {
                resolved = resolveRefOrThrow(ctx, groupExpr);
            } else {
                resolved = resolvedFromColumn(
                    requireSelectExpr(groupExpr, 'GROUP BY'),
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
            source = requireSelectExpr(orderBy.by, 'ORDER BY').source;
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
        ...(additionalMetrics.length > 0 ? { additionalMetrics } : {}),
        ...(customDimensions.length > 0 ? { customDimensions } : {}),
    };

    return {
        table,
        metricQuery,
        columns,
        alwaysEmpty: alwaysEmpty || limit === 0,
    };
}

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
    return compileSelect(statement as SelectFromStatement, catalog);
};
