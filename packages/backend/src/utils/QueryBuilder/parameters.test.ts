import { replaceParameters } from './parameters';

describe('replaceParameters', () => {
    it('should replace lightdash parameter placeholders with values', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = { status: ['active', 'pending'] };
        const quoteChar = "'";
        const wrapChar = '(';

        const result = replaceParameters(sql, parameters, quoteChar, wrapChar);

        expect(result).toBe(
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

        expect(result).toBe('SELECT * FROM orders WHERE region = "US", "EU"');
    });

    it('should throw error when parameter is missing', () => {
        const sql =
            'SELECT * FROM users WHERE status = ${lightdash.parameters.status}';
        const parameters = {};
        const quoteChar = "'";
        const wrapChar = '(';

        expect(() =>
            replaceParameters(sql, parameters, quoteChar, wrapChar),
        ).toThrow(
            'Missing parameter "status": "SELECT * FROM users WHERE status = ${lightdash.parameters.status}"',
        );
    });
});
