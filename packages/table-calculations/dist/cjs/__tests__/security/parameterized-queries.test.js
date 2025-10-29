"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
const effect_1 = require("effect");
const parser_1 = require("../../parser");
const generators_1 = require("../../generators");
const validator_1 = require("../../validator");
describe('Parameterized Query Security', () => {
    describe('Field Reference Parameterization', () => {
        it('should use parameter placeholders for field references', async () => {
            const maliciousFieldName = 'field"; DROP TABLE users; --';
            const parameterizedFieldResolver = (fieldName) => {
                return effect_1.Effect.succeed({
                    placeholder: '?',
                    value: fieldName,
                    type: 'identifier'
                });
            };
            const program = (0, effect_1.pipe)((0, parser_1.parse)(`[${maliciousFieldName}]`), effect_1.Effect.flatMap((ast) => (0, generators_1.generateParameterizedSQL)(ast, {
                dialect: 'postgres',
                parameterizedFieldResolver,
            })));
            const result = await effect_1.Effect.runPromise(program);
            // SQL should contain only a parameter placeholder
            expect(result.sql).toBe('?');
            // Parameters should contain the field name safely
            expect(result.parameters).toHaveLength(1);
            expect(result.parameters[0]).toEqual({
                placeholder: '?',
                value: maliciousFieldName,
                type: 'identifier'
            });
            // No SQL injection keywords should appear in the generated SQL
            expect(result.sql).not.toContain('DROP');
            expect(result.sql).not.toContain('TABLE');
            expect(result.sql).not.toContain('--');
        });
        it('should handle complex expressions with multiple field references', async () => {
            const maliciousFields = [
                'field1"; DROP TABLE users; --',
                'field2\'; SELECT * FROM passwords; --'
            ];
            let parameterIndex = 0;
            const parameterizedFieldResolver = (fieldName) => {
                parameterIndex++;
                return effect_1.Effect.succeed({
                    placeholder: `$${parameterIndex}`,
                    value: fieldName,
                    type: 'identifier'
                });
            };
            const program = (0, effect_1.pipe)((0, parser_1.parse)(`[${maliciousFields[0]}] + [${maliciousFields[1]}]`), effect_1.Effect.flatMap((ast) => (0, generators_1.generateParameterizedSQL)(ast, {
                dialect: 'postgres',
                parameterizedFieldResolver,
            })));
            const result = await effect_1.Effect.runPromise(program);
            // SQL should contain parameter placeholders and operators only
            expect(result.sql).toBe('($1 + $2)');
            // Parameters should contain both field names safely
            expect(result.parameters).toHaveLength(2);
            expect(result.parameters[0].value).toBe(maliciousFields[0]);
            expect(result.parameters[1].value).toBe(maliciousFields[1]);
            // No SQL injection keywords should appear in the generated SQL
            expect(result.sql).not.toContain('DROP');
            expect(result.sql).not.toContain('SELECT');
            expect(result.sql).not.toContain('--');
        });
    });
    describe('Function Calls with Parameterized Fields', () => {
        it('should parameterize field references within function calls', async () => {
            const maliciousFieldName = 'revenue"; DROP TABLE accounts; --';
            const parameterizedFieldResolver = (fieldName) => {
                return effect_1.Effect.succeed({
                    placeholder: '?',
                    value: fieldName,
                    type: 'identifier'
                });
            };
            const program = (0, effect_1.pipe)((0, parser_1.parse)(`sum([${maliciousFieldName}])`), effect_1.Effect.flatMap((ast) => (0, generators_1.generateParameterizedSQL)(ast, {
                dialect: 'postgres',
                parameterizedFieldResolver,
            })));
            const result = await effect_1.Effect.runPromise(program);
            // Function call should use parameter placeholder
            expect(result.sql).toBe('SUM(?)');
            expect(result.parameters).toHaveLength(1);
            expect(result.parameters[0].value).toBe(maliciousFieldName);
            // No injection attempts should be in the SQL
            expect(result.sql).not.toContain('DROP');
            expect(result.sql).not.toContain('accounts');
            expect(result.sql).not.toContain('--');
        });
    });
    describe('Conditional Expressions with Parameterization', () => {
        it('should parameterize field references in conditional expressions', async () => {
            const maliciousFields = [
                'status"; DROP TABLE logs; --',
                'amount\'; DELETE FROM transactions; --',
                'default_value"; INSERT INTO backdoor VALUES (1); --'
            ];
            let parameterIndex = 0;
            const parameterizedFieldResolver = (fieldName) => {
                parameterIndex++;
                return effect_1.Effect.succeed({
                    placeholder: `$${parameterIndex}`,
                    value: fieldName,
                    type: 'identifier'
                });
            };
            const program = (0, effect_1.pipe)((0, parser_1.parse)(`if([${maliciousFields[0]}] = "active", [${maliciousFields[1]}], [${maliciousFields[2]}])`), effect_1.Effect.flatMap((ast) => (0, generators_1.generateParameterizedSQL)(ast, {
                dialect: 'postgres',
                parameterizedFieldResolver,
            })));
            const result = await effect_1.Effect.runPromise(program);
            // Should use parameter placeholders in CASE statement
            expect(result.sql).toContain('CASE WHEN ($1 = \'active\') THEN $2 ELSE $3 END');
            expect(result.parameters).toHaveLength(3);
            // All malicious field names should be safely stored as parameters
            expect(result.parameters[0].value).toBe(maliciousFields[0]);
            expect(result.parameters[1].value).toBe(maliciousFields[1]);
            expect(result.parameters[2].value).toBe(maliciousFields[2]);
            // No injection attempts should be in the SQL
            expect(result.sql).not.toContain('DROP');
            expect(result.sql).not.toContain('DELETE');
            expect(result.sql).not.toContain('INSERT');
            expect(result.sql).not.toContain('backdoor');
            expect(result.sql).not.toContain('--');
        });
    });
    describe('Backwards Compatibility', () => {
        it('should fall back to standard field resolution when parameterized is not available', async () => {
            const standardFieldResolver = (fieldName) => {
                return effect_1.Effect.succeed(`safe_${fieldName}`);
            };
            const program = (0, effect_1.pipe)((0, parser_1.parse)('\${user_id}'), effect_1.Effect.flatMap((ast) => (0, generators_1.generateParameterizedSQL)(ast, {
                dialect: 'postgres',
                fieldResolver: standardFieldResolver,
                // No parameterizedFieldResolver provided
            })));
            const result = await effect_1.Effect.runPromise(program);
            // Should fall back to standard resolution with quoted identifier
            expect(result.sql).toBe('"safe_user_id"');
            expect(result.parameters).toHaveLength(0);
        });
    });
    describe('Parameter Types', () => {
        it('should support different parameter types for different databases', async () => {
            const testCases = [
                { dialect: 'postgres', expectedPlaceholder: '$1' },
                { dialect: 'duckdb', expectedPlaceholder: '?' },
            ];
            for (const testCase of testCases) {
                const parameterizedFieldResolver = (fieldName) => {
                    return effect_1.Effect.succeed({
                        placeholder: testCase.expectedPlaceholder,
                        value: fieldName,
                        type: 'identifier'
                    });
                };
                const program = (0, effect_1.pipe)((0, parser_1.parse)('\${revenue}'), effect_1.Effect.flatMap((ast) => (0, generators_1.generateParameterizedSQL)(ast, {
                    dialect: testCase.dialect,
                    parameterizedFieldResolver,
                })));
                const result = await effect_1.Effect.runPromise(program);
                expect(result.sql).toBe(testCase.expectedPlaceholder);
                expect(result.parameters[0].placeholder).toBe(testCase.expectedPlaceholder);
            }
        });
    });
    describe('Validation Integration', () => {
        it('should validate field names before parameterization', async () => {
            const maliciousField = 'unknown_dangerous_field';
            const parameterizedFieldResolver = (fieldName) => {
                return effect_1.Effect.succeed({
                    placeholder: '?',
                    value: fieldName,
                    type: 'identifier'
                });
            };
            const program = (0, effect_1.pipe)((0, parser_1.parse)(`\${${maliciousField}}`), effect_1.Effect.flatMap((ast) => (0, validator_1.validate)(ast, { availableFields: ['revenue', 'cost'] })), effect_1.Effect.flatMap((ast) => (0, generators_1.generateParameterizedSQL)(ast, {
                dialect: 'postgres',
                parameterizedFieldResolver,
            })));
            const result = await effect_1.Effect.runPromiseExit(program);
            // Should fail validation before reaching parameterization
            expect(result._tag).toBe('Failure');
            if (result._tag === 'Failure' && result.cause._tag === 'Fail') {
                expect(result.cause.error._tag).toBe('UnknownFieldError');
            }
        });
    });
});
//# sourceMappingURL=parameterized-queries.test.js.map