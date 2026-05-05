import type {
    ConditionalAggFnName,
    DateFnAstName,
    FunctionName,
    MovingWindowFnName,
    OneOrTwoArgFnName,
    SingleArgFnName,
    ThreeArgFnName,
    TwoArgFnName,
    VariadicFnName,
    WindowFnName,
    ZeroArgFnName,
    ZeroOrOneArgFnName,
} from './functions';

export type Dialect =
    | 'postgres'
    | 'redshift'
    | 'bigquery'
    | 'snowflake'
    | 'duckdb'
    | 'databricks'
    | 'clickhouse'
    | 'athena'
    | 'trino';

// Whitelisted units accepted by date functions (DATE_TRUNC today; DATE_ADD,
// DATE_SUB, DATE_DIFF in follow-up PRs). Validated at parse time so bad units
// fail fast with a clear message rather than producing invalid SQL.
export type DateUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

// Numeric 0..6 matching `@lightdash/common`'s `WeekDay` enum
// (MONDAY=0..SUNDAY=6). The formula package is dependency-free by design, so
// callers translate the common enum to this numeric ordinal themselves.
// Kept in the same shape so that translation is the identity function.
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CompileOptions {
    dialect: Dialect;
    columns: Record<string, string>;
    // Invoked with the bare SQL emitted for each aggregate call (SUM, SUMIF,
    // COUNT, 1-arg MIN/MAX, AVG, AVERAGEIF, COUNTIF). Callers whose SQL lands
    // in a context where bare aggregates are illegal (e.g. a post-aggregation
    // SELECT alongside non-aggregate columns) can return `${inner} OVER ()`.
    // Callers that compose their own GROUP BY around the output leave this
    // unset. The formula package has no opinion on embedding context.
    renderAggregate?: (innerSql: string) => string;
    // Fallback ORDER BY for window functions (LAG/LEAD, ROW_NUMBER, FIRST/LAST,
    // RUNNING_TOTAL, MOVING_*, NTILE, RANK/DENSE_RANK) whose formula has no
    // explicit ORDER BY in its OVER clause. Lets the caller inject the
    // containing query's visual sort order so `LAG(x)` picks the row the user
    // sees immediately above the current one in the rendered table — and so
    // BigQuery/Snowflake don't reject `OVER ()` where they require an
    // analytic ORDER BY. Columns are raw SQL identifiers and the compiler
    // quotes them with the dialect's quoting rules.
    defaultOrderBy?: ReadonlyArray<{
        column: string;
        direction?: 'ASC' | 'DESC';
    }>;
    // Day the week starts on when `DATE_TRUNC("week", d)` is evaluated. When
    // omitted, defaults to Monday (ISO 8601) — matching the native week
    // boundary on Postgres, Redshift, Snowflake, DuckDB, Databricks and
    // ClickHouse. Backend callers should forward the project's `startOfWeek`.
    weekStartDay?: WeekDay;
}

// WindowClauseNode is intentionally not in this union — it only ever appears as
// a child of WindowFnNode and is never dispatched on its own.
export type ASTNode =
    | BinaryOpNode
    | UnaryOpNode
    | IfNode
    | ConditionalAggregateNode
    | CountIfNode
    | CountDistinctNode
    | ZeroArgFnNode
    | SingleArgFnNode
    | OneOrTwoArgFnNode
    | TwoArgFnNode
    | ThreeArgFnNode
    | ZeroOrOneArgFnNode
    | VariadicFnNode
    | WindowFnNode
    | MovingWindowFnNode
    | DateFnNode
    | ColumnRefNode
    | NumberLiteralNode
    | StringLiteralNode
    | BooleanLiteralNode
    | ComparisonNode
    | LogicalNode;

export interface BinaryOpNode {
    type: 'BinaryOp';
    op: '+' | '-' | '*' | '/' | '^' | '%';
    left: ASTNode;
    right: ASTNode;
}

export interface UnaryOpNode {
    type: 'UnaryOp';
    op: '-' | 'NOT';
    operand: ASTNode;
}

export interface IfNode {
    type: 'If';
    condition: ASTNode;
    then: ASTNode;
    else: ASTNode | null;
}

export interface ConditionalAggregateNode {
    type: 'ConditionalAggregate';
    name: ConditionalAggFnName;
    value: ASTNode;
    condition: ASTNode;
}

export interface CountIfNode {
    type: 'CountIf';
    condition: ASTNode;
}

export interface CountDistinctNode {
    type: 'CountDistinct';
    arg: ASTNode;
}

export interface ZeroArgFnNode {
    type: 'ZeroArgFn';
    name: ZeroArgFnName;
}

export interface SingleArgFnNode {
    type: 'SingleArgFn';
    name: SingleArgFnName;
    arg: ASTNode;
}

export interface OneOrTwoArgFnNode {
    type: 'OneOrTwoArgFn';
    name: OneOrTwoArgFnName;
    args: [ASTNode] | [ASTNode, ASTNode];
}

export interface TwoArgFnNode {
    type: 'TwoArgFn';
    name: TwoArgFnName;
    args: [ASTNode, ASTNode];
}

export interface ThreeArgFnNode {
    type: 'ThreeArgFn';
    name: ThreeArgFnName;
    args: [ASTNode, ASTNode, ASTNode];
}

export interface ZeroOrOneArgFnNode {
    type: 'ZeroOrOneArgFn';
    name: ZeroOrOneArgFnName;
    arg: ASTNode | null;
}

export interface VariadicFnNode {
    type: 'VariadicFn';
    name: VariadicFnName;
    args: ASTNode[];
}

export interface WindowFnNode {
    type: 'WindowFn';
    name: WindowFnName;
    args: ASTNode[];
    windowClause: WindowClauseNode | null;
}

// `preceding` is a parse-time positive integer, lifted off `args` like DateFn.unit.
export interface MovingWindowFnNode {
    type: 'MovingWindowFn';
    name: MovingWindowFnName;
    arg: ASTNode;
    preceding: number;
    windowClause: WindowClauseNode | null;
}

// Date functions whose unit argument is a whitelisted literal rather than an
// arbitrary expression. The `unit` is lifted out of `args` because it's a
// compile-time constant string that drives both validation and per-dialect
// emission. `args` carries the remaining expression arguments:
//   - DATE_TRUNC: [date]
//   - DATE_ADD:   [date, n]           (DATE_SUB desugars to DATE_ADD with -n)
export interface DateFnNode {
    type: 'DateFn';
    name: DateFnAstName;
    unit: DateUnit;
    args: ASTNode[];
}

export interface ColumnRefNode {
    type: 'ColumnRef';
    name: string;
}

export interface NumberLiteralNode {
    type: 'NumberLiteral';
    value: number;
}

export interface StringLiteralNode {
    type: 'StringLiteral';
    value: string;
}

export interface BooleanLiteralNode {
    type: 'BooleanLiteral';
    value: boolean;
}

export interface ComparisonNode {
    type: 'Comparison';
    op: '=' | '<>' | '>' | '<' | '>=' | '<=';
    left: ASTNode;
    right: ASTNode;
}

export interface LogicalNode {
    type: 'Logical';
    op: 'AND' | 'OR';
    left: ASTNode;
    right: ASTNode;
}

export interface WindowClauseNode {
    type: 'WindowClause';
    orderBy?: { column: ASTNode; direction?: 'ASC' | 'DESC' };
    partitionBy?: ASTNode;
}

export type FunctionCategory =
    | 'math'
    | 'string'
    | 'date'
    | 'logical'
    | 'aggregate'
    | 'window'
    | 'null'
    | 'type';

export interface FunctionDefinition {
    name: FunctionName;
    description: string;
    minArgs: number;
    maxArgs: number;
    category: FunctionCategory;
}
