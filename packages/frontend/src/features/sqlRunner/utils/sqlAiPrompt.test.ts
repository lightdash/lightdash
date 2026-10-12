import { DimensionType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildSqlAiTables,
    getSqlAiPrompt,
    getSqlAiPromptTablePaths,
    getSqlWithoutLine,
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

describe('getSqlAiPromptTablePaths', () => {
    it('offers singular and plural names from prompt lines only', () => {
        expect(
            getSqlAiPromptTablePaths(
                'SELECT * FROM payments\n-- Orders per customer',
            ),
        ).toEqual([
            ['orders'],
            ['order'],
            ['per'],
            ['pers'],
            ['customer'],
            ['customers'],
        ]);
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

describe('buildSqlAiTables', () => {
    it('lists catalog tables and attaches loaded columns', () => {
        const tables = buildSqlAiTables({
            transformedData: {
                database: 'db',
                tablesBySchema: [
                    { schema: 'jaffle', tables: { orders: {}, customers: {} } },
                ],
            },
            isTablesDataLoading: false,
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
