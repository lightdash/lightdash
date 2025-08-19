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
});
