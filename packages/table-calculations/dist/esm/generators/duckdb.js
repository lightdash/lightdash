/* eslint-disable class-methods-use-this, func-names */
import { Effect, pipe } from 'effect';
import { SQLGenerationError, UnsupportedFunctionError, } from '../errors';
import { BaseSQLGenerator, FieldResolver, SQLDialect, } from './base';
export class DuckDBGenerator extends BaseSQLGenerator {
    constructor() {
        super(...arguments);
        this.dialect = 'duckdb';
        this.generateBinaryOperator = (node, context) => {
            const self = this;
            return Effect.gen(function* () {
                const left = yield* self.generateNode(node.left, context);
                const right = yield* self.generateNode(node.right, context);
                const operatorMap = {
                    and: 'AND',
                    or: 'OR',
                    '=': '=',
                    '!=': '!=',
                    '<>': '<>',
                    '&': '||', // String concatenation in DuckDB
                };
                const op = operatorMap[node.operator] || node.operator;
                return `(${left} ${op} ${right})`;
            });
        };
        this.generateFunctionCall = (node, context) => {
            const self = this;
            return Effect.gen(function* () {
                const funcName = node.name.toLowerCase();
                if (!self.supportsFunction(funcName)) {
                    return yield* Effect.fail(new UnsupportedFunctionError({
                        functionName: funcName,
                        dialect: self.dialect,
                    }));
                }
                // Handle window functions
                if (self.isWindowFunction(funcName)) {
                    return yield* self.generateWindowFunction(node, context);
                }
                // Generate arguments
                const args = yield* Effect.all(node.args.map((arg) => self.generateNode(arg, context)));
                // Map Excel-like functions to DuckDB SQL
                const functionMap = {
                    sum: 'SUM',
                    avg: 'AVG',
                    average: 'AVG',
                    count: 'COUNT',
                    counta: 'COUNT',
                    min: 'MIN',
                    max: 'MAX',
                    abs: 'ABS',
                    round: 'ROUND',
                    floor: 'FLOOR',
                    ceiling: 'CEIL',
                    upper: 'UPPER',
                    lower: 'LOWER',
                    trim: 'TRIM',
                    len: 'LENGTH',
                    length: 'LENGTH',
                    concatenate: 'CONCAT',
                    concat: 'CONCAT',
                    coalesce: 'COALESCE',
                    isnull: 'IS NULL',
                    ifnull: 'COALESCE',
                    // DuckDB specific functions
                    median: 'MEDIAN',
                    mode: 'MODE',
                    quantile: 'QUANTILE',
                    approx_count_distinct: 'APPROX_COUNT_DISTINCT',
                    stddev: 'STDDEV',
                    variance: 'VARIANCE',
                    regexp_matches: 'REGEXP_MATCHES',
                    regexp_replace: 'REGEXP_REPLACE',
                };
                const sqlFunc = functionMap[funcName] || funcName.toUpperCase();
                // Special handling for certain functions
                if (funcName === 'isnull' && args.length === 1) {
                    return `(${args[0]} IS NULL)`;
                }
                return `${sqlFunc}(${args.join(', ')})`;
            });
        };
        this.generateWindowFunction = (node, context) => {
            const self = this;
            return Effect.gen(function* () {
                const funcName = node.name.toLowerCase();
                const args = yield* Effect.all(node.args.map((arg) => self.generateNode(arg, context)));
                const windowFunctionMap = {
                    cumsum: 'SUM',
                    cumavg: 'AVG',
                    cummax: 'MAX',
                    cummin: 'MIN',
                    cumcount: 'COUNT',
                    row: 'ROW_NUMBER',
                    rank: 'RANK',
                    dense_rank: 'DENSE_RANK',
                    percent_rank: 'PERCENT_RANK',
                    lag: 'LAG',
                    lead: 'LEAD',
                    first: 'FIRST_VALUE',
                    last: 'LAST_VALUE',
                    // DuckDB specific window functions
                    ntile: 'NTILE',
                    cume_dist: 'CUME_DIST',
                };
                const sqlFunc = windowFunctionMap[funcName] || funcName.toUpperCase();
                const argList = args.length > 0 ? `${args.join(', ')}` : '';
                const funcCall = argList ? `${sqlFunc}(${argList})` : `${sqlFunc}()`;
                // Build OVER clause
                let overClause = 'OVER (';
                if (context.windowPartition && context.windowPartition.length > 0) {
                    overClause += `PARTITION BY ${context.windowPartition.join(', ')} `;
                }
                if (context.windowOrder && context.windowOrder.length > 0) {
                    overClause += `ORDER BY ${context.windowOrder.join(', ')} `;
                }
                else if (funcName.startsWith('cum')) {
                    // Cumulative functions need an order
                    overClause += `ORDER BY 1 `;
                }
                // Add frame clause for cumulative functions
                if (funcName.startsWith('cum')) {
                    overClause += 'ROWS UNBOUNDED PRECEDING';
                }
                overClause = `${overClause.trim()})`;
                return `${funcCall} ${overClause}`;
            });
        };
        this.generateFieldReference = (node, context) => {
            const self = this;
            return Effect.gen(function* () {
                const fieldResolver = yield* FieldResolver;
                const dialect = yield* SQLDialect;
                // Use parameterized field resolution if available and context supports it
                if (context.useParameterizedQueries && fieldResolver.resolveParameterized) {
                    const parameter = yield* fieldResolver.resolveParameterized(node.fieldName);
                    if (context.parameters) {
                        context.parameters.push(parameter);
                    }
                    return parameter.placeholder;
                }
                // Fall back to standard field resolution
                const resolvedField = yield* fieldResolver.resolve(node.fieldName);
                return dialect.quoteIdentifier(resolvedField);
            });
        };
        this.generateConditional = (node, context) => {
            const self = this;
            return Effect.gen(function* () {
                const condition = yield* self.generateNode(node.condition, context);
                const trueValue = yield* self.generateNode(node.trueValue, context);
                const falseValue = yield* self.generateNode(node.falseValue, context);
                return `CASE WHEN ${condition} THEN ${trueValue} ELSE ${falseValue} END`;
            });
        };
    }
    generate(ast, context = {}) {
        return this.generateNode(ast, context);
    }
    generateParameterized(ast, context = {}) {
        const parameters = [];
        const contextWithParams = { ...context, parameters, useParameterizedQueries: true };
        return pipe(this.generateNode(ast, contextWithParams), Effect.map((sql) => ({ sql, parameters })));
    }
    generateNode(node, context) {
        switch (node.type) {
            case 'binary_operator':
                return this.generateBinaryOperator(node, context);
            case 'unary_operator':
                return this.generateUnaryOperator(node, context);
            case 'function_call':
                return this.generateFunctionCall(node, context);
            case 'field_reference':
                return this.generateFieldReference(node, context);
            case 'literal':
                return Effect.succeed(this.generateLiteral(node));
            case 'conditional':
                return this.generateConditional(node, context);
            default:
                return Effect.fail(new SQLGenerationError({
                    message: `Unknown node type`,
                    node,
                    dialect: this.dialect,
                }));
        }
    }
    generateUnaryOperator(node, context) {
        return pipe(this.generateNode(node.operand, context), Effect.map((operand) => {
            if (node.operator === 'not') {
                return `NOT (${operand})`;
            }
            return `${node.operator}${operand}`;
        }));
    }
    generateLiteral(node) {
        if (node.dataType === 'string') {
            // Escape single quotes in string literals
            const escaped = String(node.value).replace(/'/g, "''");
            return `'${escaped}'`;
        }
        if (node.dataType === 'null') {
            return 'NULL';
        }
        if (node.dataType === 'boolean') {
            return node.value ? 'TRUE' : 'FALSE';
        }
        return String(node.value);
    }
    supportsFunction(functionName) {
        const supported = new Set([
            // Standard math functions
            'sum',
            'avg',
            'average',
            'count',
            'counta',
            'min',
            'max',
            'abs',
            'round',
            'floor',
            'ceiling',
            'sqrt',
            'power',
            'mod',
            'ln',
            'log',
            'exp',
            'sin',
            'cos',
            'tan',
            'asin',
            'acos',
            'atan',
            'degrees',
            'radians',
            'pi',
            // Statistical functions (DuckDB specialty)
            'median',
            'mode',
            'quantile',
            'stddev',
            'variance',
            'corr',
            'covar_pop',
            'covar_samp',
            'approx_count_distinct',
            // Window functions
            'cumsum',
            'cumavg',
            'cummax',
            'cummin',
            'cumcount',
            'lag',
            'lead',
            'first',
            'last',
            'row',
            'rank',
            'dense_rank',
            'percent_rank',
            'ntile',
            'cume_dist',
            // String functions
            'upper',
            'lower',
            'trim',
            'len',
            'length',
            'left',
            'right',
            'substring',
            'substr',
            'concatenate',
            'concat',
            'replace',
            'regexp_matches',
            'regexp_replace',
            'split_part',
            // Date/time functions
            'date_part',
            'date_trunc',
            'extract',
            'age',
            'current_date',
            'current_timestamp',
            'now',
            // Logical functions
            'if',
            'isnull',
            'ifnull',
            'coalesce',
            'nullif',
            'greatest',
            'least',
            // Type conversion
            'cast',
            'try_cast',
            // Array functions (DuckDB feature)
            'array_length',
            'unnest',
            'list_contains',
            'list_extract',
        ]);
        return supported.has(functionName.toLowerCase());
    }
    isWindowFunction(functionName) {
        const windowFuncs = new Set([
            'cumsum',
            'cumavg',
            'cummax',
            'cummin',
            'cumcount',
            'lag',
            'lead',
            'first',
            'last',
            'row',
            'rank',
            'dense_rank',
            'percent_rank',
            'ntile',
            'cume_dist',
        ]);
        return windowFuncs.has(functionName.toLowerCase());
    }
}
//# sourceMappingURL=duckdb.js.map