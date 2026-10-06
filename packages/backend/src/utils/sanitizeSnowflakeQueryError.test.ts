import { sanitizeSnowflakeQueryError } from './sanitizeSnowflakeQueryError';

describe('sanitizeSnowflakeQueryError', () => {
    const firstQueryId = '01b2c3d4-0000-1234-0000-000000000abc';
    const secondQueryId = '01abcdef-1111-2222-3333-444444444444';

    it('keeps SQL compilation detail and removes the query ID', () => {
        const message = `SQL compilation error: invalid identifier 'MISSING_COLUMN'; query ID: ${firstQueryId}`;

        const result = sanitizeSnowflakeQueryError(message);

        expect(result).toBe(
            "SQL compilation error: invalid identifier 'MISSING_COLUMN'; query ID: [query id removed]",
        );
        expect(result).not.toContain(firstQueryId);
    });

    it('leaves a message without a query ID unchanged', () => {
        const message =
            "SQL compilation error: invalid identifier 'MISSING_COLUMN'";

        expect(sanitizeSnowflakeQueryError(message)).toBe(message);
    });

    it('removes every query ID in a message', () => {
        const message = `Queries ${firstQueryId} and ${secondQueryId} failed`;

        const result = sanitizeSnowflakeQueryError(message);

        expect(result).toBe(
            'Queries [query id removed] and [query id removed] failed',
        );
        expect(result).not.toContain(firstQueryId);
        expect(result).not.toContain(secondQueryId);
    });

    it('keeps a non-Snowflake error around an ID-shaped UUID', () => {
        expect(
            sanitizeSnowflakeQueryError(`Request ${firstQueryId} timed out`),
        ).toBe('Request [query id removed] timed out');
    });

    it('keeps null unchanged', () => {
        expect(sanitizeSnowflakeQueryError(null)).toBeNull();
    });
});
