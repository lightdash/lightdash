import type {
    ASTNode,
    BinaryOpNode,
    BooleanLiteralNode,
    ColumnRefNode,
    ComparisonNode,
    CompileOptions,
    ConditionalAggregateNode,
    CountIfNode,
    IfNode,
    LogicalNode,
    NumberLiteralNode,
    OneOrTwoArgFnNode,
    SingleArgFnNode,
    StringLiteralNode,
    UnaryOpNode,
    VariadicFnNode,
    WindowClauseNode,
    WindowFnNode,
    ZeroArgFnNode,
    ZeroOrOneArgFnNode,
} from '../types';
import { assertUnreachable } from '../utils';

export abstract class BaseSqlGenerator {
    constructor(protected options: CompileOptions) {}

    generate(node: ASTNode): string {
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

    protected wrapAggregate(sql: string): string {
        return this.options.aggregateContext === 'window'
            ? `${sql} OVER ()`
            : sql;
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

    protected generateModulo(left: string, right: string): string {
        return `MOD(${left}, ${right})`;
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
            case 'ISNULL':
                return `(${arg} IS NULL)`;
            case 'SUM':
                return this.wrapAggregate(`SUM(${arg})`);
            case 'AVERAGE':
            case 'AVG':
                return `AVG(${arg})`;
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
            case 'FIRST':
                return this.generateWindowFunction(
                    'FIRST_VALUE',
                    [args[0]],
                    node,
                );
            case 'LAST':
                return this.generateWindowFunction(
                    'LAST_VALUE',
                    [args[0]],
                    node,
                    'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING',
                );
            case 'LAG':
                return this.generateWindowFunction('LAG', args, node);
            case 'LEAD':
                return this.generateWindowFunction('LEAD', args, node);
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
                return this.generateWindowFunction(
                    'AVG',
                    [args[0]],
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

    protected generateStringLiteral(node: StringLiteralNode): string {
        const escaped = node.value.replace(/'/g, "''");
        return `'${escaped}'`;
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

    // Dialect-specific methods to override
    protected abstract quoteIdentifier(name: string): string;

    protected generateConcat(args: string[]): string {
        return `CONCAT(${args.join(', ')})`;
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
        }

        const framePart = frameClause ? ` ${frameClause}` : '';

        return `${funcCall} OVER (${overParts.join(' ')}${framePart})`;
    }
}
