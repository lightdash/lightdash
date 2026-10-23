import { DimensionType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildSqlAiKnownTables,
    getActiveSqlAiPrompt,
    getSqlAiPrompt,
    getSqlWithoutLine,
    isSqlAiResponseStale,
} from './sqlAiPrompt';

describe('getSqlAiPrompt', () => {
    it('reads the text of a comment line', () => {
        expect(getSqlAiPrompt('-- revenue by month')).toBe('revenue by month');
        expect(getSqlAiPrompt('    --top 10 customers  ')).toBe(
            'top 10 customers',
        );
    });

    it('ignores SQL and empty comments', () => {
        expect(getSqlAiPrompt('SELECT 1 -- trailing')).toBeNull();
        expect(getSqlAiPrompt('--')).toBeNull();
        expect(getSqlAiPrompt('--   ')).toBeNull();
        expect(getSqlAiPrompt('')).toBeNull();
    });
});

describe('getSqlWithoutLine', () => {
    it('drops the prompt line and keeps the rest of the query', () => {
        expect(
            getSqlWithoutLine('SELECT *\nFROM orders\n-- only paid', 3),
        ).toBe('SELECT *\nFROM orders');
    });

    it('returns null when only the prompt is left', () => {
        expect(getSqlWithoutLine('\n-- revenue by month\n', 2)).toBeNull();
    });
});

describe('getActiveSqlAiPrompt', () => {
    const sql = 'SELECT *\nFROM orders\n-- only paid';

    it('reads the prompt on the cursor line with the rest of the query', () => {
        expect(
            getActiveSqlAiPrompt({ sql, lineNumber: 3, hasSelection: false }),
        ).toEqual({
            lineNumber: 3,
            prompt: 'only paid',
            currentSql: 'SELECT *\nFROM orders',
        });
    });

    it('leaves Tab to indent when text is selected', () => {
        expect(
            getActiveSqlAiPrompt({ sql, lineNumber: 3, hasSelection: true }),
        ).toBeNull();
    });

    it('ignores lines that are not comments', () => {
        expect(
            getActiveSqlAiPrompt({ sql, lineNumber: 2, hasSelection: false }),
        ).toBeNull();
    });
});

describe('isSqlAiResponseStale', () => {
    const project = { kind: 'project' } as const;
    const connection = {
        kind: 'connection',
        warehouseConnectionUuid: 'c1',
        listedDatabase: 'analytics',
        database: 'analytics',
    } as const;

    it('applies a response when nothing changed', () => {
        expect(
            isSqlAiResponseStale(
                { versionId: 4, target: connection },
                { versionId: 4, target: { ...connection } },
            ),
        ).toBe(false);
    });

    it('drops a response after the query was edited', () => {
        expect(
            isSqlAiResponseStale(
                { versionId: 4, target: project },
                { versionId: 5, target: project },
            ),
        ).toBe(true);
    });

    it('drops a response after the warehouse changed', () => {
        expect(
            isSqlAiResponseStale(
                { versionId: 4, target: connection },
                { versionId: 4, target: project },
            ),
        ).toBe(true);
        expect(
            isSqlAiResponseStale({ versionId: 4, target: connection }, null),
        ).toBe(true);
    });
});

describe('buildSqlAiKnownTables', () => {
    it('lists only tables with loaded columns', () => {
        const tables = buildSqlAiKnownTables({
            tableFieldsData: [{ name: 'amount', type: DimensionType.NUMBER }],
            detectedTablesFieldData: [
                {
                    name: 'first_name',
                    type: DimensionType.STRING,
                    table: 'customers',
                    schema: 'jaffle',
                },
                {
                    name: 'id',
                    type: DimensionType.NUMBER,
                    table: 'payments',
                    schema: 'stripe',
                },
            ],
            currentTable: 'orders',
            currentSchema: 'jaffle',
        });

        expect(tables).toEqual([
            {
                schema: 'jaffle',
                table: 'orders',
                columns: [{ name: 'amount', type: DimensionType.NUMBER }],
            },
            {
                schema: 'jaffle',
                table: 'customers',
                columns: [{ name: 'first_name', type: DimensionType.STRING }],
            },
            {
                schema: 'stripe',
                table: 'payments',
                columns: [{ name: 'id', type: DimensionType.NUMBER }],
            },
        ]);
    });
});
