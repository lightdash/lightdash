import type { ParametersValuesMap } from '@lightdash/common';
import { warehouseClientMock } from './MetricQueryBuilder.mock';
import {
    safeReplaceParameters,
    safeReplaceParametersWithSqlBuilder,
    safeReplaceParametersWithTypes,
    unsafeReplaceParametersAsRaw,
} from './parameters';

const mockSqlBuilder = warehouseClientMock;

describe('replaceParameters', () => {
    it('should replace lightdash parameter placeholders with values', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameterValuesMap = { status: ['active', 'pending'] };
        const quoteChar = "'";
        const wrapChar = '(';

        const result = safeReplaceParameters({
            sql,
            parameterValuesMap,
            escapeString: mockSqlBuilder.escapeString,
            quoteChar,
            wrapChar,
        });

        expect(result.replacedSql).toBe(
            "(SELECT * FROM users WHERE status = 'active', 'pending')",
        );
    });

    it('should handle short alias format (ld.parameters)', () => {
        const sql =
            'SELECT * FROM orders WHERE region = ${ld.parameters.region}';
        const parameters = { region: ['US', 'EU'] };
        const quoteChar = '"';
        const wrapChar = '';

        const result = safeReplaceParameters({
            sql,
            parameterValuesMap: parameters,
            escapeString: mockSqlBuilder.escapeString,
            quoteChar,
            wrapChar,
        });

        expect(result.replacedSql).toBe(
            'SELECT * FROM orders WHERE region = "US", "EU"',
        );
    });

    it('should add missing parameter to missingReferences', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = {};
        const quoteChar = "'";
        const wrapChar = '(';

        const result = safeReplaceParameters({
            sql,
            parameterValuesMap: parameters,
            escapeString: mockSqlBuilder.escapeString,
            quoteChar,
            wrapChar,
        });

        expect(result.missingReferences.has('status')).toBe(true);
        expect(result.replacedSql).toBe(
            '(SELECT * FROM users WHERE status = ${lightdash.parameters.status})',
        );
    });

    it('should handle empty quote character using unsafeReplaceParametersAsRaw', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = { status: ['active', 'pending'] };

        const result = unsafeReplaceParametersAsRaw(
            sql,
            parameters,
            mockSqlBuilder,
        );

        expect(result.replacedSql).toBe(
            'SELECT * FROM users WHERE status = active, pending',
        );
    });

    it('should use sqlBuilder to escape parameters when provided', () => {
        const sql =
            'SELECT * FROM users WHERE name = ${lightdash.parameters.name}';
        const parameters = { name: "O'Reilly" };

        const result = safeReplaceParametersWithSqlBuilder(
            sql,
            parameters,
            mockSqlBuilder,
        );

        // SnowflakeSqlBuilder doubles single quotes
        expect(result.replacedSql).toBe(
            "SELECT * FROM users WHERE name = 'O''Reilly'",
        );
    });
});

describe('safeReplaceParametersWithSqlBuilder', () => {
    it('should escape single quote in string parameter to prevent SQL injection', () => {
        const sql =
            'SELECT * FROM users WHERE name = ${lightdash.parameters.name}';
        const parameters = { name: "O'Reilly" };

        const result = safeReplaceParametersWithSqlBuilder(
            sql,
            parameters,
            mockSqlBuilder,
        );

        // SnowflakeSqlBuilder doubles single quotes
        expect(result.replacedSql).toBe(
            "SELECT * FROM users WHERE name = 'O''Reilly'",
        );
    });

    it('should escape SQL injection attempt in array parameter', () => {
        const sql =
            'SELECT * FROM users WHERE status IN (${lightdash.parameters.status})';
        const parameters = {
            status: ['active', "pending'; DROP TABLE users; --"],
        };

        const result = safeReplaceParametersWithSqlBuilder(
            sql,
            parameters,
            mockSqlBuilder,
        );

        // SnowflakeSqlBuilder doubles single quotes and removes SQL comments
        expect(result.replacedSql).toBe(
            "SELECT * FROM users WHERE status IN ('active', 'pending''; DROP TABLE users; ')",
        );
    });
});

describe('unsafeReplaceParametersAsRaw', () => {
    it('should properly escape parameters when using unsafeReplaceParametersAsRaw', () => {
        const sql = 'SELECT * FROM users WHERE id = ${lightdash.parameters.id}';
        const parameters = { id: '1; DROP TABLE users; --' };

        const result = unsafeReplaceParametersAsRaw(
            sql,
            parameters,
            mockSqlBuilder,
        );

        // SnowflakeSqlBuilder removes SQL comments even when not using quotes
        expect(result.replacedSql).toBe(
            'SELECT * FROM users WHERE id = 1; DROP TABLE users; ',
        );
    });
});

describe('safeReplaceParametersWithTypes', () => {
    it('should not wrap number parameters in quotes', () => {
        const sql =
            'SELECT * FROM users WHERE id = ${lightdash.parameters.user_id}';
        const parameters = { user_id: 123 };
        const parameterDefinitions = {
            user_id: {
                label: 'User ID',
                type: 'number' as const,
            },
        };

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe('SELECT * FROM users WHERE id = 123');
    });

    it('should handle number arrays without quotes', () => {
        const sql =
            'SELECT * FROM users WHERE id IN (${lightdash.parameters.user_ids})';
        const parameters = { user_ids: [1, 2, 3] };
        const parameterDefinitions = {
            user_ids: {
                label: 'User IDs',
                type: 'number' as const,
                multiple: true,
            },
        };

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe(
            'SELECT * FROM users WHERE id IN (1, 2, 3)',
        );
    });

    it('should still wrap string parameters in quotes', () => {
        const sql =
            'SELECT * FROM users WHERE name = ${lightdash.parameters.user_name}';
        const parameters = { user_name: "O'Reilly" };
        const parameterDefinitions = {
            user_name: {
                label: 'User Name',
                type: 'string' as const,
            },
        };

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe(
            "SELECT * FROM users WHERE name = 'O''Reilly'",
        );
    });

    it('should default to string type when no definition provided', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = { status: 'active' };
        const parameterDefinitions = undefined;

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe(
            "SELECT * FROM users WHERE status = 'active'",
        );
    });

    it('should handle mixed parameter types in same query', () => {
        const sql =
            'SELECT * FROM users WHERE id = ${lightdash.parameters.user_id} AND status = ${lightdash.parameters.status}';
        const parameters = { user_id: 42, status: 'active' };
        const parameterDefinitions = {
            user_id: {
                label: 'User ID',
                type: 'number' as const,
            },
            status: {
                label: 'Status',
                type: 'string' as const,
            },
        };

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe(
            "SELECT * FROM users WHERE id = 42 AND status = 'active'",
        );
    });

    it('should convert string numbers to numbers for number parameters', () => {
        const sql =
            'SELECT * FROM users WHERE id = ${lightdash.parameters.user_id}';
        const parameters = { user_id: '123' }; // String that should be converted to number
        const parameterDefinitions = {
            user_id: {
                label: 'User ID',
                type: 'number' as const,
            },
        };

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe('SELECT * FROM users WHERE id = 123');
    });

    it('should throw error for invalid number parameter values', () => {
        const sql =
            'SELECT * FROM users WHERE id = ${lightdash.parameters.user_id}';
        const parameterDefinitions = {
            user_id: {
                label: 'User ID',
                type: 'number' as const,
            },
        };

        // Test SQL injection attempt
        const sqlInjectionParams = { user_id: '1; DROP TABLE users; --' };
        expect(() => {
            safeReplaceParametersWithTypes({
                sql,
                parameterValuesMap: sqlInjectionParams,
                parameterDefinitions,
                sqlBuilder: mockSqlBuilder,
            });
        }).toThrow(
            'Invalid number parameter: "1; DROP TABLE users; --" is not a valid number',
        );

        // Test invalid string
        const invalidStringParams = { user_id: 'not_a_number' };
        expect(() => {
            safeReplaceParametersWithTypes({
                sql,
                parameterValuesMap: invalidStringParams,
                parameterDefinitions,
                sqlBuilder: mockSqlBuilder,
            });
        }).toThrow(
            'Invalid number parameter: "not_a_number" is not a valid number',
        );

        // Test NaN
        const nanParams = { user_id: NaN };
        expect(() => {
            safeReplaceParametersWithTypes({
                sql,
                parameterValuesMap: nanParams,
                parameterDefinitions,
                sqlBuilder: mockSqlBuilder,
            });
        }).toThrow('Invalid number parameter: "NaN" is not a valid number');

        // Test Infinity
        const infinityParams = { user_id: Infinity };
        expect(() => {
            safeReplaceParametersWithTypes({
                sql,
                parameterValuesMap: infinityParams,
                parameterDefinitions,
                sqlBuilder: mockSqlBuilder,
            });
        }).toThrow(
            'Invalid number parameter: "Infinity" is not a valid number',
        );
    });

    it('should throw error for invalid number array parameter values', () => {
        const sql =
            'SELECT * FROM users WHERE id IN (${lightdash.parameters.user_ids})';
        const parameterDefinitions = {
            user_ids: {
                label: 'User IDs',
                type: 'number' as const,
                multiple: true,
            },
        };

        // Test array with SQL injection attempt
        const sqlInjectionParams = {
            user_ids: [1, '2; DROP TABLE users; --', 3],
        } as ParametersValuesMap;
        expect(() => {
            safeReplaceParametersWithTypes({
                sql,
                parameterValuesMap: sqlInjectionParams,
                parameterDefinitions,
                sqlBuilder: mockSqlBuilder,
            });
        }).toThrow(
            'Invalid number parameter: "2; DROP TABLE users; --" is not a valid number',
        );

        // Test array with invalid values
        const invalidParams = {
            user_ids: [1, 'invalid', 3],
        } as ParametersValuesMap;
        expect(() => {
            safeReplaceParametersWithTypes({
                sql,
                parameterValuesMap: invalidParams,
                parameterDefinitions,
                sqlBuilder: mockSqlBuilder,
            });
        }).toThrow('Invalid number parameter: "invalid" is not a valid number');
    });

    it('should wrap date parameters with CAST to DATE', () => {
        const sql =
            'SELECT * FROM orders WHERE order_date >= ${lightdash.parameters.start_date}';
        const parameters = { start_date: '2025-08-06' };
        const parameterDefinitions = {
            start_date: {
                label: 'Start Date',
                type: 'date' as const,
            },
        };

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe(
            "SELECT * FROM orders WHERE order_date >= CAST('2025-08-06' AS DATE)",
        );
    });

    it('should reject date parameters with SQL injection attempts', () => {
        const sql =
            'SELECT * FROM orders WHERE order_date = ${lightdash.parameters.order_date}';
        const parameters = {
            order_date: "2025-08-06'; DROP TABLE orders; --",
        };
        const parameterDefinitions = {
            order_date: {
                label: 'Order Date',
                type: 'date' as const,
            },
        };

        // SQL injection attempts should be rejected by date validation
        expect(() => {
            safeReplaceParametersWithTypes({
                sql,
                parameterValuesMap: parameters,
                parameterDefinitions,
                sqlBuilder: mockSqlBuilder,
            });
        }).toThrow(
            'Invalid date parameter: "2025-08-06\'; DROP TABLE orders; --" is not a valid ISO 8601 date (YYYY-MM-DD)',
        );
    });

    it.each([
        { description: 'invalid date format', testDate: '08/06/2025' },
        { description: 'not-a-date', testDate: 'invalid date string' },
        { description: 'impossible date', testDate: '2025-02-30' },
    ])(
        'should throw error for $description: $testDate',
        ({ description, testDate }) => {
            const sql =
                'SELECT * FROM orders WHERE order_date = ${lightdash.parameters.order_date}';
            const parameterDefinitions = {
                order_date: {
                    label: 'Order Date',
                    type: 'date' as const,
                },
            };

            // Test invalid date format
            const invalidFormatParams = { order_date: testDate };
            expect(() => {
                safeReplaceParametersWithTypes({
                    sql,
                    parameterValuesMap: invalidFormatParams,
                    parameterDefinitions,
                    sqlBuilder: mockSqlBuilder,
                });
            }).toThrow(
                `Invalid date parameter: "${testDate}" is not a valid ISO 8601 date (YYYY-MM-DD)`,
            );
        },
    );

    it('should handle mixed parameter types including dates', () => {
        const sql =
            'SELECT * FROM orders WHERE user_id = ${lightdash.parameters.user_id} AND order_date >= ${lightdash.parameters.start_date} AND status = ${lightdash.parameters.status}';
        const parameters = {
            user_id: 42,
            start_date: '2025-01-01',
            status: 'active',
        };
        const parameterDefinitions = {
            user_id: {
                label: 'User ID',
                type: 'number' as const,
            },
            start_date: {
                label: 'Start Date',
                type: 'date' as const,
            },
            status: {
                label: 'Status',
                type: 'string' as const,
            },
        };

        const result = safeReplaceParametersWithTypes({
            sql,
            parameterValuesMap: parameters,
            parameterDefinitions,
            sqlBuilder: mockSqlBuilder,
        });

        expect(result.replacedSql).toBe(
            "SELECT * FROM orders WHERE user_id = 42 AND order_date >= CAST('2025-01-01' AS DATE) AND status = 'active'",
        );
    });
});
