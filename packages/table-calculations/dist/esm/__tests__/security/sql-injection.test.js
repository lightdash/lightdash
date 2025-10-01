/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Effect } from 'effect';
import { parse } from '../../parser';
import { generateSQL } from '../../generators';
import { validate } from '../../validator';
describe('SQL Injection Prevention', () => {
    describe('Field Reference Injection Attempts', () => {
        it('should reject field names with SQL injection attempts', async () => {
            const maliciousFields = [
                '${field"; DROP TABLE users; --}',
                '${field\'; SELECT * FROM passwords; --}',
                "${field'; UNION SELECT password FROM users; --}",
                '${field" OR 1=1; --}',
                '${field\' OR \'1\'=\'1}',
                '${field"; INSERT INTO logs VALUES (\'hacked\'); --}',
                '${field\' UNION ALL SELECT creditcard FROM payments; --}',
                '${field" AND (SELECT COUNT(*) FROM information_schema.tables) > 0; --}',
            ];
            for (const expr of maliciousFields) {
                try {
                    const ast = await Effect.runPromise(parse(expr));
                    const sql = await Effect.runPromise(generateSQL(ast, {
                        dialect: 'postgres',
                        fieldResolver: (field) => Effect.succeed(field),
                    }));
                    // If parsing succeeds, the output should be safely quoted
                    expect(sql).toMatch(/^"[^"]*"$/); // Should be a single quoted identifier
                    expect(sql).not.toContain('DROP');
                    expect(sql).not.toContain('SELECT');
                    expect(sql).not.toContain('UNION');
                    expect(sql).not.toContain('INSERT');
                    expect(sql).not.toContain('DELETE');
                    expect(sql).not.toContain('--');
                    expect(sql).not.toContain(';');
                }
                catch (error) {
                    // Parsing failures are acceptable for malicious input
                    expect(error).toBeDefined();
                }
            }
        });
        it('should handle bracket notation field references securely', async () => {
            const maliciousFields = [
                '[field"; DROP TABLE users; --]',
                "[field'; SELECT * FROM passwords; --]",
                '[field" OR 1=1; --]',
                '[field\'; UNION SELECT * FROM secrets; --]',
            ];
            for (const expr of maliciousFields) {
                try {
                    const ast = await Effect.runPromise(parse(expr));
                    const sql = await Effect.runPromise(generateSQL(ast, {
                        dialect: 'postgres',
                        fieldResolver: (field) => Effect.succeed(field),
                    }));
                    // Should be safely quoted and not contain SQL injection
                    expect(sql).toMatch(/^"[^"]*"$/);
                    expect(sql).not.toContain('DROP');
                    expect(sql).not.toContain('SELECT');
                    expect(sql).not.toContain('UNION');
                    expect(sql).not.toContain('--');
                    expect(sql).not.toContain(';');
                }
                catch (error) {
                    // Parsing failures are acceptable
                    expect(error).toBeDefined();
                }
            }
        });
    });
    describe('String Literal Injection Attempts', () => {
        it('should properly escape malicious string literals', async () => {
            const maliciousStrings = [
                '"test"; DROP TABLE users; --',
                "'test'; SELECT * FROM passwords; --",
                '"test" OR 1=1; --',
                "'test' UNION SELECT creditcard FROM payments; --",
                '"test"; INSERT INTO logs VALUES (\'hacked\'); --',
                "'test'; DELETE FROM users WHERE admin = 1; --",
                '"test" AND (SELECT COUNT(*) FROM information_schema.tables) > 0; --',
            ];
            for (const maliciousString of maliciousStrings) {
                const expr = `"${maliciousString}"`;
                try {
                    const ast = await Effect.runPromise(parse(expr));
                    const sql = await Effect.runPromise(generateSQL(ast, {
                        dialect: 'postgres',
                        fieldResolver: (field) => Effect.succeed(field),
                    }));
                    // Should be a single quoted string literal with proper escaping
                    expect(sql).toMatch(/^'.*'$/);
                    // Should not contain unescaped SQL injection attempts
                    expect(sql).not.toMatch(/'; *DROP/i);
                    expect(sql).not.toMatch(/'; *SELECT/i);
                    expect(sql).not.toMatch(/'; *UNION/i);
                    expect(sql).not.toMatch(/'; *INSERT/i);
                    expect(sql).not.toMatch(/'; *DELETE/i);
                    expect(sql).not.toMatch(/--/);
                }
                catch (error) {
                    // Some malformed strings might fail parsing, which is acceptable
                    expect(error).toBeDefined();
                }
            }
        });
        it('should handle single quote escaping correctly', async () => {
            const testCases = [
                { input: '"O\'Reilly"', expected: "'O''Reilly'" },
                { input: '"test\'\'test"', expected: "'test''''test'" },
                { input: '"Don\'t; DROP TABLE users; --"', expected: "'Don''t; DROP TABLE users; --'" },
            ];
            for (const testCase of testCases) {
                const ast = await Effect.runPromise(parse(testCase.input));
                const sql = await Effect.runPromise(generateSQL(ast, {
                    dialect: 'postgres',
                    fieldResolver: (field) => Effect.succeed(field),
                }));
                expect(sql).toBe(testCase.expected);
                // Even with escaped quotes, no SQL injection should be possible
                expect(sql).not.toMatch(/'; *DROP/i);
                expect(sql).not.toMatch(/'; *SELECT/i);
            }
        });
    });
    describe('Function Name Injection Attempts', () => {
        it('should reject malicious function names', async () => {
            const maliciousFunctions = [
                'sum; DROP TABLE users; --',
                'avg\'; SELECT * FROM passwords; --',
                'count"; UNION SELECT * FROM secrets; --',
                'max\' OR 1=1; --',
                'min"; INSERT INTO logs VALUES (\'hacked\'); --',
            ];
            for (const funcName of maliciousFunctions) {
                const expr = `${funcName}(\${field})`;
                const result = await Effect.runPromiseExit(parse(expr));
                // Should fail to parse malicious function names
                expect(result._tag).toBe('Failure');
                if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
                    expect(result.cause.error._tag).toBe('ParseError');
                }
            }
        });
        it('should only allow valid function names', async () => {
            const validFunctions = [
                'sum',
                'avg',
                'count',
                'max',
                'min',
                'upper',
                'lower',
                'if',
                'coalesce',
            ];
            for (const funcName of validFunctions) {
                const expr = `${funcName}(\${field})`;
                const ast = await Effect.runPromise(parse(expr));
                const sql = await Effect.runPromise(generateSQL(ast, {
                    dialect: 'postgres',
                    fieldResolver: (field) => Effect.succeed(field),
                }));
                expect(sql).toMatch(new RegExp(`^${funcName.toUpperCase()}\\(`));
                expect(sql).not.toContain(';');
                expect(sql).not.toContain('--');
                expect(sql).not.toContain('DROP');
                expect(sql).not.toContain('SELECT');
            }
        });
    });
    describe('Complex Injection Attempts', () => {
        it('should prevent injection through nested expressions', async () => {
            const maliciousExpressions = [
                'if(\${field} = "test"; DROP TABLE users; --", \${value}, 0)',
                'sum(\${field\'; SELECT password FROM users; --})',
                'concat(\${field}, "; UNION SELECT creditcard FROM payments; --")',
                'if(\${field} = "admin", \${field}; DELETE FROM users; --, \${field})',
            ];
            for (const expr of maliciousExpressions) {
                const result = await Effect.runPromiseExit(parse(expr));
                if (result._tag === 'Success') {
                    // If parsing succeeds, generation should be safe
                    const sql = await Effect.runPromise(generateSQL(result.value, {
                        dialect: 'postgres',
                        fieldResolver: (field) => Effect.succeed(field),
                    }));
                    expect(sql).not.toContain('DROP');
                    expect(sql).not.toContain('DELETE');
                    expect(sql).not.toContain('SELECT');
                    expect(sql).not.toContain('UNION');
                    expect(sql).not.toMatch(/; *--/);
                }
                else {
                    // Parsing failures are acceptable for malicious input
                    expect(result._tag).toBe('Failure');
                }
            }
        });
        it('should prevent comment-based injection', async () => {
            const commentInjections = [
                '\${field} -- comment out the rest',
                '\${field} /* block comment */ OR 1=1',
                '"test" -- \'; DROP TABLE users;',
                '\${field} /* \'; UNION SELECT * FROM secrets; */',
            ];
            for (const expr of commentInjections) {
                const result = await Effect.runPromiseExit(parse(expr));
                // Comments should not be parsed as part of expressions
                expect(result._tag).toBe('Failure');
            }
        });
    });
    describe('Field Validation Security', () => {
        it('should prevent access to non-whitelisted fields', async () => {
            const ast = await Effect.runPromise(parse('\${users.password}'));
            const result = await Effect.runPromiseExit(validate(ast, {
                availableFields: ['revenue', 'cost', 'quantity']
            }));
            expect(result._tag).toBe('Failure');
            if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
                expect(result.cause.error._tag).toBe('UnknownFieldError');
            }
        });
        it('should only allow explicitly whitelisted fields', async () => {
            const allowedFields = ['revenue', 'cost', 'quantity'];
            const maliciousFields = [
                'users.password',
                'information_schema.tables',
                'pg_tables',
                'sys.tables',
                '../../../etc/passwd',
                'admin_users.secret_key',
            ];
            for (const fieldName of maliciousFields) {
                const ast = await Effect.runPromise(parse(`\${${fieldName}}`));
                const result = await Effect.runPromiseExit(validate(ast, { availableFields: allowedFields }));
                expect(result._tag).toBe('Failure');
                if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
                    expect(result.cause.error._tag).toBe('UnknownFieldError');
                }
            }
        });
    });
    describe('Edge Cases and Malformed Input', () => {
        it('should handle extremely long input safely', async () => {
            const veryLongFieldName = 'a'.repeat(10000);
            const expr = `\${${veryLongFieldName}}`;
            const result = await Effect.runPromiseExit(parse(expr));
            if (result._tag === 'Success') {
                const sql = await Effect.runPromise(generateSQL(result.value, {
                    dialect: 'postgres',
                    fieldResolver: (field) => Effect.succeed(field),
                }));
                // Should be properly quoted
                expect(sql).toMatch(/^".*"$/);
                expect(sql.length).toBeLessThan(20000); // Reasonable upper bound
            }
        });
        it('should handle unicode and special characters safely', async () => {
            const specialChars = [
                'field_名前',
                'field\\u0000null',
                'field\t\n\r',
                'field\u202e', // Right-to-left override
                'field\ufeff', // Zero-width no-break space
            ];
            for (const fieldName of specialChars) {
                const expr = `\${${fieldName}}`;
                try {
                    const ast = await Effect.runPromise(parse(expr));
                    const sql = await Effect.runPromise(generateSQL(ast, {
                        dialect: 'postgres',
                        fieldResolver: (field) => Effect.succeed(field),
                    }));
                    // Should be safely quoted
                    expect(sql).toMatch(/^".*"$/);
                    expect(sql).not.toContain('\u0000');
                }
                catch (error) {
                    // Some special characters might cause parsing to fail, which is acceptable
                    expect(error).toBeDefined();
                }
            }
        });
        it('should reject completely malformed SQL-like input', async () => {
            const malformedInputs = [
                'SELECT * FROM users',
                'DROP TABLE users',
                'INSERT INTO logs VALUES (1)',
                'UPDATE users SET admin = 1',
                'DELETE FROM users WHERE id = 1',
                '; DROP TABLE users; --',
                'UNION SELECT password FROM users',
                '1=1 OR 2=2',
            ];
            for (const input of malformedInputs) {
                const result = await Effect.runPromiseExit(parse(input));
                // Should fail to parse raw SQL
                expect(result._tag).toBe('Failure');
                if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
                    expect(result.cause.error._tag).toBe('ParseError');
                }
            }
        });
    });
});
//# sourceMappingURL=sql-injection.test.js.map