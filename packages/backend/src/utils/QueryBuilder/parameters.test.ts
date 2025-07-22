import { replaceParameters } from './parameters';

describe('replaceParameters', () => {
    it('should replace lightdash parameter placeholders with values', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = { status: ['active', 'pending'] };
        const quoteChar = "'";
        const wrapChar = '(';

        const result = replaceParameters(sql, parameters, quoteChar, wrapChar);

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

        const result = replaceParameters(sql, parameters, quoteChar, wrapChar);

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

        const result = replaceParameters(sql, parameters, quoteChar, wrapChar);

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

        const result = replaceParameters(sql, parameters, '', wrapChar);

        expect(result.replacedSql).toBe(
            '(SELECT * FROM users WHERE status = active, pending)',
        );
    });
});
