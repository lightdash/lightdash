import { SnowflakeSqlBuilder } from '@lightdash/warehouses';
import {
    replaceParameters,
    replaceParametersAsString,
    unsafeReplaceParametersAsRaw,
} from './parameters';

const mockSqlBuilder = new SnowflakeSqlBuilder();

describe('replaceParameters', () => {
    it('should replace lightdash parameter placeholders with values', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = { status: ['active', 'pending'] };
        const quoteChar = "'";
        const wrapChar = '(';

        const result = replaceParameters(
            sql,
            parameters,
            mockSqlBuilder.escapeString,
            quoteChar,
            wrapChar,
        );

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

        const result = replaceParameters(
            sql,
            parameters,
            mockSqlBuilder.escapeString,
            quoteChar,
            wrapChar,
        );

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

        const result = replaceParameters(
            sql,
            parameters,
            mockSqlBuilder.escapeString,
            quoteChar,
            wrapChar,
        );

        expect(result.missingReferences.has('status')).toBe(true);
        expect(result.replacedSql).toBe(
            '(SELECT * FROM users WHERE status = ${lightdash.parameters.status})',
        );
    });

    it('should handle empty quote character', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = { status: ['active', 'pending'] };
        const wrapChar = '(';

        const result = replaceParameters(
            sql,
            parameters,
            mockSqlBuilder.escapeString,
            '',
            wrapChar,
        );

        expect(result.replacedSql).toBe(
            '(SELECT * FROM users WHERE status = active, pending)',
        );
    });

    it('should use sqlBuilder to escape parameters when provided', () => {
        const sql =
            'SELECT * FROM users WHERE name = ${lightdash.parameters.name}';
        const parameters = { name: "O'Reilly" };
        const quoteChar = "'";
        const wrapChar = '';

        const result = replaceParameters(
            sql,
            parameters,
            mockSqlBuilder.escapeString,
            quoteChar,
            wrapChar,
        );

        // SnowflakeSqlBuilder doubles single quotes
        expect(result.replacedSql).toBe(
            "SELECT * FROM users WHERE name = 'O''Reilly'",
        );
    });
});

describe('replaceParametersAsString', () => {
    it('should escape single quote in string parameter to prevent SQL injection', () => {
        const sql =
            'SELECT * FROM users WHERE name = ${lightdash.parameters.name}';
        const parameters = { name: "O'Reilly" };

        const result = replaceParametersAsString(
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

        const result = replaceParametersAsString(
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
