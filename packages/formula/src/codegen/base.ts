import type {
    ASTNode,
    BinaryOpNode,
    UnaryOpNode,
    FunctionCallNode,
    ColumnRefNode,
    NumberLiteralNode,
    StringLiteralNode,
    BooleanLiteralNode,
    ComparisonNode,
    LogicalNode,
    CompileOptions,
    WindowClauseNode,
} from '../types';

export abstract class BaseSqlGenerator {
    constructor(protected options: CompileOptions) {}

    generate(node: ASTNode): string {
        switch (node.type) {
            case 'BinaryOp':
                return this.generateBinaryOp(node);
            case 'UnaryOp':
                return this.generateUnaryOp(node);
            case 'FunctionCall':
                return this.generateFunctionCall(node);
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
                throw new Error('WindowClause should not be generated directly');
            default: {
                const _exhaustive: never = node;
                throw new Error(`Unknown node type: ${(node as any).type}`);
            }
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
            default: {
                const _exhaustive: never = node.op;
                throw new Error(`Unknown operator: ${node.op}`);
            }
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
            default: {
                const _exhaustive: never = node.op;
                throw new Error(`Unknown unary op: ${node.op}`);
            }
        }
    }

    protected generateFunctionCall(node: FunctionCallNode): string {
        const name = node.name.toUpperCase();
        const args = node.args.map((a) => this.generate(a));

        // Dispatch to specific function handlers
        const handler = this.getFunctionHandler(name);
        if (handler) {
            return handler(args, node);
        }

        // SECURITY: Unknown functions must be rejected — never pass through to SQL.
        // Passing through would allow users to call arbitrary warehouse functions
        // (e.g. pg_sleep, read_csv_auto, dblink) bypassing the semantic layer.
        throw new Error(
            `Unknown function: ${name}. Allowed functions: ${Object.keys(this.getAllowedFunctionNames()).join(', ')}`,
        );
    }

    protected getAllowedFunctionNames(): Record<string, true> {
        const handlers = this.getFunctionHandler;
        // Build from the handler registry keys
        const names: Record<string, true> = {};
        for (const name of [
            'IF', 'ABS', 'ROUND', 'CEIL', 'CEILING', 'FLOOR', 'MIN', 'MAX',
            'CONCAT', 'LEN', 'LENGTH', 'TRIM', 'LOWER', 'UPPER',
            'TODAY', 'NOW', 'YEAR', 'MONTH', 'DAY',
            'COALESCE', 'ISNULL',
            'SUM', 'AVERAGE', 'AVG', 'COUNT',
            'SUMIF', 'COUNTIF', 'AVERAGEIF',
            'RUNNING_TOTAL', 'ROW_NUMBER', 'LAG', 'LEAD',
            'RANK', 'DENSE_RANK', 'NTILE', 'FIRST', 'LAST', 'MOVING_SUM', 'MOVING_AVG',
        ]) {
            names[name] = true;
        }
        return names;
    }

    protected getFunctionHandler(
        name: string,
    ): ((args: string[], node: FunctionCallNode) => string) | null {
        const handlers: Record<
            string,
            (args: string[], node: FunctionCallNode) => string
        > = {
            // Logical
            IF: (a) => `CASE WHEN ${a[0]} THEN ${a[1]} ELSE ${a[2] ?? 'NULL'} END`,

            // Math
            ABS: (a) => `ABS(${a[0]})`,
            ROUND: (a) => `ROUND(${a[0]}${a[1] !== undefined ? `, ${a[1]}` : ''})`,
            CEIL: (a) => `CEIL(${a[0]})`,
            CEILING: (a) => `CEIL(${a[0]})`,
            FLOOR: (a) => `FLOOR(${a[0]})`,
            MIN: (a) => a.length === 1 ? `MIN(${a[0]})` : `LEAST(${a.join(', ')})`,
            MAX: (a) => a.length === 1 ? `MAX(${a[0]})` : `GREATEST(${a.join(', ')})`,

            // String
            CONCAT: (a) => this.generateConcat(a),
            LEN: (a) => this.generateLength(a[0]),
            LENGTH: (a) => this.generateLength(a[0]),
            TRIM: (a) => `TRIM(${a[0]})`,
            LOWER: (a) => `LOWER(${a[0]})`,
            UPPER: (a) => `UPPER(${a[0]})`,

            // Date
            TODAY: () => this.generateToday(),
            NOW: () => this.generateNow(),
            YEAR: (a) => this.generateExtract('YEAR', a[0]),
            MONTH: (a) => this.generateExtract('MONTH', a[0]),
            DAY: (a) => this.generateExtract('DAY', a[0]),

            // Null
            COALESCE: (a) => `COALESCE(${a.join(', ')})`,
            ISNULL: (a) => `(${a[0]} IS NULL)`,

            // Aggregates
            SUM: (a) => `SUM(${a[0]})`,
            AVERAGE: (a) => `AVG(${a[0]})`,
            AVG: (a) => `AVG(${a[0]})`,
            COUNT: (a) => a.length === 0 ? 'COUNT(*)' : `COUNT(${a[0]})`,

            // Conditional aggregates
            SUMIF: (a, node) => `SUM(CASE WHEN ${this.generate(node.args[1])} THEN ${a[0]} END)`,
            COUNTIF: (a, node) => `COUNT(CASE WHEN ${this.generate(node.args[0])} THEN 1 END)`,
            AVERAGEIF: (a, node) => `AVG(CASE WHEN ${this.generate(node.args[1])} THEN ${a[0]} END)`,

            // Window functions
            RUNNING_TOTAL: (a, node) => this.generateWindowFunction('SUM', [a[0]], node, 'ROWS UNBOUNDED PRECEDING'),
            ROW_NUMBER: (_a, node) => this.generateWindowFunction('ROW_NUMBER', [], node),
            LAG: (a, node) => this.generateWindowFunction('LAG', a, node),
            LEAD: (a, node) => this.generateWindowFunction('LEAD', a, node),
            RANK: (_a, node) => this.generateWindowFunction('RANK', [], node),
            DENSE_RANK: (_a, node) => this.generateWindowFunction('DENSE_RANK', [], node),
            NTILE: (a, node) => this.generateWindowFunction('NTILE', [a[0]], node),
            FIRST: (a, node) => this.generateWindowFunction('FIRST_VALUE', [a[0]], node),
            LAST: (a, node) => this.generateWindowFunction('LAST_VALUE', [a[0]], node, 'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING'),
            MOVING_SUM: (a, node) => {
                const preceding = (node.args[1] as NumberLiteralNode).value;
                return this.generateWindowFunction('SUM', [a[0]], node, `ROWS BETWEEN ${preceding} PRECEDING AND CURRENT ROW`);
            },
            MOVING_AVG: (a, node) => {
                const preceding = (node.args[1] as NumberLiteralNode).value;
                return this.generateWindowFunction('AVG', [a[0]], node, `ROWS BETWEEN ${preceding} PRECEDING AND CURRENT ROW`);
            },
        };

        return handlers[name] ?? null;
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
        // Escape single quotes for SQL
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
        node: FunctionCallNode,
        frameClause?: string,
    ): string {
        const funcCall = funcArgs.length > 0 ? `${sqlFunc}(${funcArgs.join(', ')})` : `${sqlFunc}()`;
        const overParts: string[] = [];

        const wc = node.windowClause;
        if (wc?.partitionBy) {
            overParts.push(`PARTITION BY ${this.generate(wc.partitionBy)}`);
        }
        if (wc?.orderBy) {
            const dir = wc.orderBy.direction ? ` ${wc.orderBy.direction}` : '';
            overParts.push(`ORDER BY ${this.generate(wc.orderBy.column)}${dir}`);
        }

        const framePart = frameClause ? ` ${frameClause}` : '';

        return `${funcCall} OVER (${overParts.join(' ')}${framePart})`;
    }
}
