/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Effect, pipe } from 'effect';
import { parse } from '../../parser';
import { generateSQL } from '../../generators';
import { validate } from '../../validator';
describe('Table Calculations E2E', () => {
    describe('Basic arithmetic', () => {
        it('should generate SQL for simple addition', async () => {
            const program = pipe(parse('${revenue} + ${cost}'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('("revenue" + "cost")');
        });
        it('should handle operator precedence correctly', async () => {
            const program = pipe(parse('${a} + ${b} * ${c}'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('("a" + ("b" * "c"))');
        });
        it('should handle string concatenation', async () => {
            const program = pipe(parse('${first_name} & " " & ${last_name}'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('(("first_name" || \' \') || "last_name")');
        });
    });
    describe('Functions', () => {
        it('should generate SQL for SUM function', async () => {
            const program = pipe(parse('sum(${sales})'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('SUM("sales")');
        });
        it('should generate SQL for nested functions', async () => {
            const program = pipe(parse('round(avg(${price}), 2)'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('ROUND(AVG("price"), 2)');
        });
    });
    describe('Window functions', () => {
        it('should generate SQL for cumulative sum', async () => {
            const program = pipe(parse('cumsum(${amount})'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('SUM("amount") OVER (ORDER BY 1 ROWS UNBOUNDED PRECEDING)');
        });
        it('should generate SQL for rank function', async () => {
            const program = pipe(parse('rank()'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('RANK() OVER ()');
        });
        it('should generate SQL for lag function', async () => {
            const program = pipe(parse('lag(${value}, 1)'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('LAG("value", 1) OVER ()');
        });
    });
    describe('Conditional expressions', () => {
        it('should generate SQL for IF statement', async () => {
            const program = pipe(parse('if(${status} = "active", ${amount} * 1.1, ${amount})'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('CASE WHEN ("status" = \'active\') THEN ("amount" * 1.1) ELSE "amount" END');
        });
        it('should handle nested IF statements', async () => {
            const program = pipe(parse('if(${a} > 100, "high", if(${a} > 50, "medium", "low"))'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toContain('CASE WHEN');
            expect(result).toContain('high');
            expect(result).toContain('medium');
            expect(result).toContain('low');
        });
    });
    describe('Logical operators', () => {
        it('should handle AND operator', async () => {
            const program = pipe(parse('${a} > 10 and ${b} < 20'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('(("a" > 10) AND ("b" < 20))');
        });
        it('should handle OR operator', async () => {
            const program = pipe(parse('${status} = "active" or ${status} = "pending"'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('(("status" = \'active\') OR ("status" = \'pending\'))');
        });
        it('should handle NOT operator', async () => {
            const program = pipe(parse('not ${is_deleted}'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('NOT ("is_deleted")');
        });
    });
    describe('Error handling', () => {
        it('should handle parse errors gracefully', async () => {
            const program = pipe(parse('invalid {{ syntax'), Effect.catchTag('ParseError', (error) => Effect.succeed(`Parse failed: ${error.message}`)));
            const result = await Effect.runPromise(program);
            expect(result).toContain('Parse failed');
        });
        it('should validate unknown fields', async () => {
            const program = pipe(parse('sum(${unknown_field})'), Effect.flatMap((ast) => validate(ast, { availableFields: ['revenue', 'cost'] })));
            const result = await Effect.runPromiseExit(program);
            expect(result._tag).toBe('Failure');
            if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
                expect(result.cause.error._tag).toBe('UnknownFieldError');
                const error = result.cause.error;
                expect(error.fieldName).toBe('unknown_field');
            }
        });
        it('should handle unsupported functions', async () => {
            const program = pipe(parse('unknown_function(${field})'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromiseExit(program);
            expect(result._tag).toBe('Failure');
            if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
                expect(result.cause.error._tag).toBe('UnsupportedFunctionError');
            }
        });
    });
    describe('BigQuery dialect', () => {
        it('should use backticks for field quoting', async () => {
            const program = pipe(parse('${revenue} - ${cost}'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'bigquery',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('(`revenue` - `cost`)');
        });
    });
    describe('DuckDB dialect', () => {
        it('should use double quotes for field quoting', async () => {
            const program = pipe(parse('${revenue} - ${cost}'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'duckdb',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('("revenue" - "cost")');
        });
        it('should support DuckDB-specific statistical functions', async () => {
            const program = pipe(parse('median(${price})'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'duckdb',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('MEDIAN("price")');
        });
        it('should support DuckDB window functions', async () => {
            const program = pipe(parse('ntile(4)'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'duckdb',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('NTILE(4) OVER ()');
        });
        it('should support cumulative count function', async () => {
            const program = pipe(parse('cumcount(${customer_id})'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'duckdb',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('COUNT("customer_id") OVER (ORDER BY 1 ROWS UNBOUNDED PRECEDING)');
        });
        it('should handle complex statistical expressions', async () => {
            const program = pipe(parse('stddev(${amount}) / avg(${amount})'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'duckdb',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('(STDDEV("amount") / AVG("amount"))');
        });
    });
    describe('Complex expressions', () => {
        it('should handle percent of total calculation', async () => {
            const program = pipe(parse('${sales} / sum(${sales}) * 100'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toBe('(("sales" / SUM("sales")) * 100)');
        });
        it('should handle year-over-year growth', async () => {
            const program = pipe(parse('(${revenue} - lag(${revenue}, 12)) / lag(${revenue}, 12) * 100'), Effect.flatMap((ast) => generateSQL(ast, {
                dialect: 'postgres',
                fieldResolver: (field) => Effect.succeed(field),
            })));
            const result = await Effect.runPromise(program);
            expect(result).toContain('LAG("revenue", 12)');
            expect(result).toContain('* 100');
        });
    });
});
//# sourceMappingURL=e2e.test.js.map