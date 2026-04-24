import { isAggregateCall } from '../ast';
import type {
    ASTNode,
    BinaryOpNode,
    BooleanLiteralNode,
    ColumnRefNode,
    ComparisonNode,
    CompileOptions,
    ConditionalAggregateNode,
    CountIfNode,
    DateFnNode,
    DateUnit,
    IfNode,
    LogicalNode,
    NumberLiteralNode,
    OneOrTwoArgFnNode,
    SingleArgFnNode,
    StringLiteralNode,
    UnaryOpNode,
    VariadicFnNode,
    WeekDay,
    WindowClauseNode,
    WindowFnNode,
    ZeroArgFnNode,
    ZeroOrOneArgFnNode,
} from '../types';
import { assertUnreachable } from '../utils';
import type { DialectConfig } from './dialects';

// Generic AST-to-SQL generator. All dialect-specific behaviour lives in
// the DialectConfig passed to the constructor — there are no subclasses.
// Fields the config doesn't set fall back to ANSI-standard defaults.
export class SqlGenerator {
    constructor(
        protected options: CompileOptions,
        protected dialect: DialectConfig,
    ) {}

    // Public entry point. Dispatches to the node-specific generator, then
    // hands aggregate output to the caller-supplied `renderAggregate` callback
    // (if any) so the caller decides how to embed the aggregate in their SQL
    // context — e.g. window-wrap for post-aggregation SELECTs, pass through
    // for GROUP BY contexts. Every recursive call from child arms goes back
    // through `generate()`, so the hook is applied once per aggregate node
    // anywhere in the tree.
    generate(node: ASTNode): string {
        const sql = this.generateNode(node);
        if (isAggregateCall(node) && this.options.renderAggregate) {
            return this.options.renderAggregate(sql);
        }
        return sql;
    }

    protected generateNode(node: ASTNode): string {
        switch (node.type) {
            case 'BinaryOp':
                return this.generateBinaryOp(node);
            case 'UnaryOp':
                return this.generateUnaryOp(node);
            case 'If':
                return this.generateIf(node);
            case 'ConditionalAggregate':
                return this.generateConditionalAggregate(node);
            case 'CountIf':
                return this.generateCountIf(node);
            case 'ZeroArgFn':
                return this.generateZeroArgFn(node);
            case 'SingleArgFn':
                return this.generateSingleArgFn(node);
            case 'OneOrTwoArgFn':
                return this.generateOneOrTwoArgFn(node);
            case 'ZeroOrOneArgFn':
                return this.generateZeroOrOneArgFn(node);
            case 'VariadicFn':
                return this.generateVariadicFn(node);
            case 'WindowFn':
                return this.generateWindowFn(node);
            case 'DateFn':
                return this.generateDateFn(node);
            case 'ColumnRef':
                return this.generateColumnRef(node);
            case 'NumberLiteral':
                return this.generateNumberLiteral(node);
            case 'StringLiteral':
                return this.generateStringLiteral(node);
            case 'BooleanLiteral':
                return this.generateBooleanLiteral(node);
            case 'Comparison':
                return this.generateComparison(node);
            case 'Logical':
                return this.generateLogical(node);
            case 'WindowClause':
                throw new Error(
                    'WindowClause should not be generated directly',
                );
            default:
                return assertUnreachable(
                    node,
                    `Unknown node type: ${(node as Record<string, unknown>).type}`,
                );
        }
    }

    protected generateBinaryOp(node: BinaryOpNode): string {
        const left = this.generate(node.left);
        const right = this.generate(node.right);

        switch (node.op) {
            case '+':
            case '-':
            case '*':
                return `(${left} ${node.op} ${right})`;
            case '/':
                return `(${left} / NULLIF(${right}, 0))`;
            case '^':
                return `POWER(${left}, ${right})`;
            case '%':
                return this.generateModulo(left, right);
            default:
                return assertUnreachable(
                    node.op,
                    `Unknown operator: ${node.op}`,
                );
        }
    }

    protected generateUnaryOp(node: UnaryOpNode): string {
        const operand = this.generate(node.operand);
        switch (node.op) {
            case '-':
                return `(-(${operand}))`;
            case 'NOT':
                return `(NOT ${operand})`;
            default:
                return assertUnreachable(
                    node.op,
                    `Unknown unary op: ${node.op}`,
                );
        }
    }

    protected generateIf(node: IfNode): string {
        const condition = this.generate(node.condition);
        const then = this.generate(node.then);
        const else_ = node.else ? this.generate(node.else) : 'NULL';
        return `CASE WHEN ${condition} THEN ${then} ELSE ${else_} END`;
    }

    protected generateConditionalAggregate(
        node: ConditionalAggregateNode,
    ): string {
        const value = this.generate(node.value);
        const condition = this.generate(node.condition);
        switch (node.name) {
            case 'SUMIF':
                return `SUM(CASE WHEN ${condition} THEN ${value} END)`;
            case 'AVERAGEIF':
                return `AVG(CASE WHEN ${condition} THEN ${value} END)`;
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown conditional aggregate: ${node.name}`,
                );
        }
    }

    protected generateCountIf(node: CountIfNode): string {
        const condition = this.generate(node.condition);
        return `COUNT(CASE WHEN ${condition} THEN 1 END)`;
    }

    protected generateZeroArgFn(node: ZeroArgFnNode): string {
        switch (node.name) {
            case 'TODAY':
                return this.generateToday();
            case 'NOW':
                return this.generateNow();
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown zero-arg function: ${node.name}`,
                );
        }
    }

    protected generateSingleArgFn(node: SingleArgFnNode): string {
        const arg = this.generate(node.arg);
        switch (node.name) {
            case 'ABS':
                return `ABS(${arg})`;
            case 'CEIL':
            case 'CEILING':
                return `CEIL(${arg})`;
            case 'FLOOR':
                return `FLOOR(${arg})`;
            case 'LEN':
            case 'LENGTH':
                return this.generateLength(arg);
            case 'TRIM':
                return `TRIM(${arg})`;
            case 'LOWER':
                return `LOWER(${arg})`;
            case 'UPPER':
                return `UPPER(${arg})`;
            case 'YEAR':
                return this.generateExtract('YEAR', arg);
            case 'MONTH':
                return this.generateExtract('MONTH', arg);
            case 'DAY':
                return this.generateExtract('DAY', arg);
            case 'LAST_DAY':
                return this.generateLastDay(arg);
            case 'ISNULL':
                return `(${arg} IS NULL)`;
            case 'SUM':
                return `SUM(${arg})`;
            case 'AVERAGE':
            case 'AVG':
                return this.generateAvg(arg);
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown single-arg function: ${node.name}`,
                );
        }
    }

    protected generateOneOrTwoArgFn(node: OneOrTwoArgFnNode): string {
        const args = node.args.map((a) => this.generate(a));
        switch (node.name) {
            case 'ROUND':
                if (this.dialect.generateRound) {
                    return this.dialect.generateRound(args[0], args[1]);
                }
                return `ROUND(${args[0]}${args[1] !== undefined ? `, ${args[1]}` : ''})`;
            case 'MIN':
                return args.length === 1
                    ? `MIN(${args[0]})`
                    : `LEAST(${args.join(', ')})`;
            case 'MAX':
                return args.length === 1
                    ? `MAX(${args[0]})`
                    : `GREATEST(${args.join(', ')})`;
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown one-or-two-arg function: ${node.name}`,
                );
        }
    }

    protected generateZeroOrOneArgFn(node: ZeroOrOneArgFnNode): string {
        switch (node.name) {
            case 'COUNT':
                return node.arg
                    ? `COUNT(${this.generate(node.arg)})`
                    : 'COUNT(*)';
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown zero-or-one-arg function: ${node.name}`,
                );
        }
    }

    protected generateVariadicFn(node: VariadicFnNode): string {
        const args = node.args.map((a) => this.generate(a));
        switch (node.name) {
            case 'CONCAT':
                return this.generateConcat(args);
            case 'COALESCE':
                return `COALESCE(${args.join(', ')})`;
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown variadic function: ${node.name}`,
                );
        }
    }

    protected generateWindowFn(node: WindowFnNode): string {
        const args = node.args.map((a) => this.generate(a));
        switch (node.name) {
            case 'ROW_NUMBER':
                return this.generateWindowFunction('ROW_NUMBER', [], node);
            case 'RANK':
                return this.generateWindowFunction('RANK', [], node);
            case 'DENSE_RANK':
                return this.generateWindowFunction('DENSE_RANK', [], node);
            case 'RUNNING_TOTAL':
                return this.generateWindowFunction(
                    'SUM',
                    [args[0]],
                    node,
                    'ROWS UNBOUNDED PRECEDING',
                );
            case 'NTILE':
                return this.generateWindowFunction('NTILE', [args[0]], node);
            // FIRST_VALUE and LAST_VALUE both get an explicit
            // `UNBOUNDED PRECEDING..UNBOUNDED FOLLOWING` frame. For
            // LAST_VALUE it's required — the ANSI default frame ends at
            // CURRENT ROW, so without this LAST_VALUE returns the current
            // row (not the last). For FIRST_VALUE it's a semantic no-op
            // (the first row of the partition is the first row regardless
            // of the frame's upper bound) but required on Redshift, which
            // rejects aggregate-style windows with ORDER BY and no frame.
            case 'FIRST':
            case 'LAST': {
                const sqlFn =
                    node.name === 'FIRST' ? 'FIRST_VALUE' : 'LAST_VALUE';
                return this.generateWindowFunction(
                    sqlFn,
                    [args[0]],
                    node,
                    'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING',
                );
            }
            case 'LAG':
            case 'LEAD':
                return this.dispatchLagLead(node.name, args, node);
            // TODO: unsafe cast — MOVING_SUM/MOVING_AVG assume second arg is a NumberLiteral
            // but the grammar accepts any Expression. Fix by adding a grammar rule that
            // enforces NumberLiteral in the second position (same pattern as BooleanExpression).
            case 'MOVING_SUM': {
                const preceding = (node.args[1] as NumberLiteralNode).value;
                return this.generateWindowFunction(
                    'SUM',
                    [args[0]],
                    node,
                    `ROWS BETWEEN ${preceding} PRECEDING AND CURRENT ROW`,
                );
            }
            case 'MOVING_AVG': {
                const preceding = (node.args[1] as NumberLiteralNode).value;
                // Route through generateAvg so dialects that need to
                // preserve precision across the AVG division (Redshift)
                // can inject a cast on the value argument.
                return this.appendOverClause(
                    this.generateAvg(args[0]),
                    node,
                    `ROWS BETWEEN ${preceding} PRECEDING AND CURRENT ROW`,
                );
            }
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown window function: ${node.name}`,
                );
        }
    }

    protected generateColumnRef(node: ColumnRefNode): string {
        const column = this.options.columns[node.name];
        if (!column) {
            throw new Error(
                `Unknown column reference: ${node.name}. Available columns: ${Object.keys(this.options.columns).join(', ')}`,
            );
        }
        return this.quoteIdentifier(column);
    }

    protected generateNumberLiteral(node: NumberLiteralNode): string {
        return String(node.value);
    }

    protected generateBooleanLiteral(node: BooleanLiteralNode): string {
        return node.value ? 'TRUE' : 'FALSE';
    }

    protected generateComparison(node: ComparisonNode): string {
        const left = this.generate(node.left);
        const right = this.generate(node.right);
        return `(${left} ${node.op} ${right})`;
    }

    protected generateLogical(node: LogicalNode): string {
        const left = this.generate(node.left);
        const right = this.generate(node.right);
        return `(${left} ${node.op} ${right})`;
    }

    // --- Dialect-configurable emission ---
    // These methods consult the DialectConfig and fall back to ANSI-standard
    // defaults when the dialect doesn't override.

    protected quoteIdentifier(name: string): string {
        return this.dialect.quoteIdentifier(name);
    }

    protected generateStringLiteral(node: StringLiteralNode): string {
        if (this.dialect.generateStringLiteral) {
            return this.dialect.generateStringLiteral(node);
        }
        const escaped = node.value.replace(/'/g, "''");
        return `'${escaped}'`;
    }

    protected generateModulo(left: string, right: string): string {
        return (
            this.dialect.generateModulo?.(left, right) ??
            `MOD(${left}, ${right})`
        );
    }

    // LAG / LEAD dispatch: hand off to the dialect's `generateLagLead` if
    // present, otherwise use the ANSI-compatible default (bare LAG/LEAD
    // with default frame, variadic args). The dialect callback receives
    // an `emitWindow` bound to this node's window clause so dialects don't
    // have to own PARTITION BY / ORDER BY plumbing.
    protected dispatchLagLead(
        sqlFunc: 'LAG' | 'LEAD',
        args: string[],
        node: { windowClause?: WindowClauseNode | null },
    ): string {
        const emitWindow = (
            fn: string,
            funcArgs: string[],
            frameClause?: string,
        ) => this.generateWindowFunction(fn, funcArgs, node, frameClause);

        if (this.dialect.generateLagLead) {
            return this.dialect.generateLagLead({
                sqlFunc,
                args,
                emitWindow,
            });
        }
        return emitWindow(sqlFunc, args);
    }

    // --- ANSI defaults shared across all dialects today ---
    // Promote to DialectConfig fields when a real dialect first diverges.

    protected generateConcat(args: string[]): string {
        if (this.dialect.generateConcat) {
            return this.dialect.generateConcat(args);
        }
        return `CONCAT(${args.join(', ')})`;
    }

    protected generateAvg(arg: string): string {
        if (this.dialect.generateAvg) {
            return this.dialect.generateAvg(arg);
        }
        return `AVG(${arg})`;
    }

    protected generateLength(expr: string): string {
        return `LENGTH(${expr})`;
    }

    protected generateToday(): string {
        return 'CURRENT_DATE';
    }

    protected generateNow(): string {
        return 'CURRENT_TIMESTAMP';
    }

    protected generateExtract(part: string, expr: string): string {
        return `EXTRACT(${part} FROM ${expr})`;
    }

    protected generateLastDay(arg: string): string {
        return this.dialect.generateLastDay?.(arg) ?? `LAST_DAY(${arg})`;
    }

    protected generateDateFn(node: DateFnNode): string {
        switch (node.name) {
            case 'DATE_TRUNC':
                return this.generateDateTrunc(
                    node.unit,
                    this.generate(node.args[0]),
                );
            case 'DATE_ADD':
                return this.generateDateAdd(
                    node.unit,
                    this.generate(node.args[0]),
                    this.generate(node.args[1]),
                );
            default:
                return assertUnreachable(
                    node.name,
                    `Unknown date function: ${node.name}`,
                );
        }
    }

    protected generateDateTrunc(unit: DateUnit, arg: string): string {
        const weekStartDay = this.options.weekStartDay ?? 0;
        return (
            this.dialect.generateDateTrunc?.(unit, arg, weekStartDay) ??
            this.defaultDateTrunc(unit, arg, weekStartDay)
        );
    }

    // ANSI-style `DATE_TRUNC('unit', d)` with INTERVAL-based week-start offset
    // for non-Monday starts. Matches
    // `packages/common/src/utils/timeFrames.ts` `postgresConfig`. Used as the
    // default for Postgres, Redshift, Snowflake, and DuckDB. BigQuery /
    // Databricks / ClickHouse override entirely.
    protected defaultDateTrunc(
        unit: DateUnit,
        arg: string,
        weekStartDay: WeekDay,
    ): string {
        if (unit === 'week' && weekStartDay !== 0) {
            const diff = `${weekStartDay} days`;
            return `(DATE_TRUNC('week', (${arg} - INTERVAL '${diff}')) + INTERVAL '${diff}')`;
        }
        return `DATE_TRUNC('${unit}', ${arg})`;
    }

    protected generateDateAdd(unit: DateUnit, date: string, n: string): string {
        return (
            this.dialect.generateDateAdd?.(unit, date, n) ??
            this.defaultDateAdd(unit, date, n)
        );
    }

    // Postgres/Redshift/DuckDB: `(d + (n) * INTERVAL '1 <unit>')`. Works
    // across all five units and propagates NULL naturally. BigQuery,
    // Snowflake, Databricks, ClickHouse override with their native forms.
    protected defaultDateAdd(unit: DateUnit, date: string, n: string): string {
        return `(${date} + (${n}) * INTERVAL '1 ${unit}')`;
    }

    // Attach an OVER (…) clause to a pre-built function-call string. Lets
    // callers that need per-function argument transforms (e.g. AVG's
    // precision-preserving cast on Redshift) build the call via their own
    // emitter and still share the PARTITION BY / ORDER BY / frame plumbing.
    //
    // When the formula has no explicit ORDER BY in its OVER clause we fall
    // back to `options.defaultOrderBy` (if set). That option carries the
    // containing query's visual sort order, so `LAG(x)` without an explicit
    // ORDER BY picks the row the user sees immediately above the current
    // one in the rendered table. It also makes BigQuery and Snowflake
    // accept `LAG`/`LEAD`/`ROW_NUMBER`/... which reject an OVER clause with
    // no ORDER BY. An explicit ORDER BY in the formula always wins.
    protected appendOverClause(
        funcCall: string,
        node: { windowClause?: WindowClauseNode | null },
        frameClause?: string,
    ): string {
        const overParts: string[] = [];

        const wc = node.windowClause;
        if (wc?.partitionBy) {
            overParts.push(`PARTITION BY ${this.generate(wc.partitionBy)}`);
        }
        if (wc?.orderBy) {
            const dir = wc.orderBy.direction ? ` ${wc.orderBy.direction}` : '';
            overParts.push(
                `ORDER BY ${this.generate(wc.orderBy.column)}${dir}`,
            );
        } else {
            const defaultOrder = this.options.defaultOrderBy;
            if (defaultOrder && defaultOrder.length > 0) {
                const cols = defaultOrder
                    .map((entry) => {
                        const dir = entry.direction
                            ? ` ${entry.direction}`
                            : '';
                        return `${this.quoteIdentifier(entry.column)}${dir}`;
                    })
                    .join(', ');
                overParts.push(`ORDER BY ${cols}`);
            }
        }

        const framePart = frameClause ? ` ${frameClause}` : '';
        return `${funcCall} OVER (${overParts.join(' ')}${framePart})`;
    }

    protected generateWindowFunction(
        sqlFunc: string,
        funcArgs: string[],
        node: { windowClause?: WindowClauseNode | null },
        frameClause?: string,
    ): string {
        const funcCall =
            funcArgs.length > 0
                ? `${sqlFunc}(${funcArgs.join(', ')})`
                : `${sqlFunc}()`;
        return this.appendOverClause(funcCall, node, frameClause);
    }
}
