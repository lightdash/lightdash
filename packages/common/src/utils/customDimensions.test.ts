import { GroupValueMatchType, type GroupValueRule } from '../types/field';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import {
    getCustomGroupOrderSql,
    getCustomGroupSelectSql,
} from './customDimensions';

const makeWarehouseSqlBuilder = (
    quoteChar: string,
    escapeChar: string,
): WarehouseSqlBuilder =>
    ({
        getStringQuoteChar: () => quoteChar,
        getEscapeStringQuoteChar: () => escapeChar,
    }) as unknown as WarehouseSqlBuilder;

const backslashEscapeBuilder = makeWarehouseSqlBuilder("'", '\\');
const singleQuoteEscapeBuilder = makeWarehouseSqlBuilder("'", "'");

const exact = (value: string): GroupValueRule => ({
    matchType: GroupValueMatchType.EXACT,
    value,
});
const startsWith = (value: string): GroupValueRule => ({
    matchType: GroupValueMatchType.STARTS_WITH,
    value,
});
const endsWith = (value: string): GroupValueRule => ({
    matchType: GroupValueMatchType.ENDS_WITH,
    value,
});
const includes = (value: string): GroupValueRule => ({
    matchType: GroupValueMatchType.INCLUDES,
    value,
});

describe('getCustomGroupSelectSql', () => {
    const baseDimensionSql = '"orders"."payment_method"';

    it('generates CASE WHEN for exact match groups', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [
                {
                    name: 'Cards',
                    values: [exact('credit_card'), exact('gift_card')],
                },
                {
                    name: 'Other Methods',
                    values: [exact('bank_transfer')],
                },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(
            `WHEN ${baseDimensionSql} IN ('credit_card', 'gift_card') THEN 'Cards'`,
        );
        expect(result).toContain(
            `WHEN ${baseDimensionSql} = 'bank_transfer' THEN 'Other Methods'`,
        );
        expect(result).toContain(`WHEN ${baseDimensionSql} IS NULL THEN NULL`);
        expect(result).toContain(`ELSE 'Other'`);
    });

    it('generates LIKE for starts_with with escaped underscore', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [{ name: 'Prod', values: [startsWith('prod_')] }],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(`LIKE 'prod\\\\_%'`);
        expect(result).toContain(`ESCAPE '\\\\'`);
    });

    it('generates LIKE for ends_with match type with ESCAPE clause', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [{ name: 'Gmail', values: [endsWith('@gmail.com')] }],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(`LIKE '%@gmail.com'`);
        expect(result).toContain(`ESCAPE '\\\\'`);
    });

    it('generates LIKE for includes match type with ESCAPE clause', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [{ name: 'Has Test', values: [includes('test')] }],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(`LIKE '%test%'`);
        expect(result).toContain(`ESCAPE '\\\\'`);
    });

    it('escapes LIKE wildcards % and _ in pattern match values', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [{ name: 'Discount', values: [includes('50%')] }],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(`%50\\\\%%`);
    });

    it('combines exact matches into IN and pattern matches with OR', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [
                {
                    name: 'Mixed',
                    values: [exact('US'), exact('CA'), endsWith('.com')],
                },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(`${baseDimensionSql} IN ('US', 'CA')`);
        expect(result).toContain(
            `${baseDimensionSql} LIKE '%.com' ESCAPE '\\\\'`,
        );
    });

    it('filters out empty groups', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [
                { name: 'Cards', values: [exact('credit_card')] },
                { name: 'Empty Group', values: [] },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(`THEN 'Cards'`);
        expect(result).not.toContain('Empty Group');
    });

    it('handles all empty groups', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [{ name: 'Empty', values: [] }],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(`WHEN ${baseDimensionSql} IS NULL THEN NULL`);
        expect(result).toContain(`ELSE 'Other'`);
        expect(result).not.toContain('Empty');
    });

    describe('escaping with backslash escape char (BigQuery/Snowflake/Databricks)', () => {
        it('escapes single quotes in values', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: 'Names', values: [exact("O'Brien")] }],
                baseDimensionSql,
                warehouseSqlBuilder: backslashEscapeBuilder,
            });

            expect(result).toContain(`'O\\'Brien'`);
        });

        it('escapes backslashes in values', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: 'Paths', values: [exact('C:\\Users')] }],
                baseDimensionSql,
                warehouseSqlBuilder: backslashEscapeBuilder,
            });

            expect(result).toContain(`'C:\\\\Users'`);
        });

        it('escapes single quotes in group names', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [
                    { name: "Manager's Pick", values: [exact('item1')] },
                ],
                baseDimensionSql,
                warehouseSqlBuilder: backslashEscapeBuilder,
            });

            expect(result).toContain(`THEN 'Manager\\'s Pick'`);
        });
    });

    describe('escaping with single-quote escape char (Postgres/Trino/Athena/ClickHouse)', () => {
        it('escapes single quotes in values by doubling', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: 'Names', values: [exact("O'Brien")] }],
                baseDimensionSql,
                warehouseSqlBuilder: singleQuoteEscapeBuilder,
            });

            expect(result).toContain(`'O''Brien'`);
            expect(result).not.toContain(`''''`);
        });

        it('escapes single quotes in group names by doubling', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [
                    { name: "Manager's Pick", values: [exact('item1')] },
                ],
                baseDimensionSql,
                warehouseSqlBuilder: singleQuoteEscapeBuilder,
            });

            expect(result).toContain(`THEN 'Manager''s Pick'`);
            expect(result).not.toContain(`''''`);
        });

        it('handles multiple quotes in a single value', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: 'Test', values: [exact("it's a 'test'")] }],
                baseDimensionSql,
                warehouseSqlBuilder: singleQuoteEscapeBuilder,
            });

            expect(result).toContain(`'it''s a ''test'''`);
        });
    });
});

describe('getCustomGroupOrderSql', () => {
    const baseDimensionSql = '"orders"."payment_method"';

    it('returns numeric indexes for groups', () => {
        const result = getCustomGroupOrderSql({
            binGroups: [
                {
                    name: 'Cards',
                    values: [exact('credit_card'), exact('gift_card')],
                },
                { name: 'Bank', values: [exact('bank_transfer')] },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(
            `WHEN ${baseDimensionSql} IN ('credit_card', 'gift_card') THEN 0`,
        );
        expect(result).toContain(
            `WHEN ${baseDimensionSql} = 'bank_transfer' THEN 1`,
        );
        expect(result).toContain(`WHEN ${baseDimensionSql} IS NULL THEN NULL`);
    });

    it('sorts "Other" last with index equal to group count', () => {
        const result = getCustomGroupOrderSql({
            binGroups: [
                { name: 'A', values: [exact('a')] },
                { name: 'B', values: [exact('b')] },
                { name: 'C', values: [exact('c')] },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain('ELSE 3');
    });

    it('skips empty groups in index calculation', () => {
        const result = getCustomGroupOrderSql({
            binGroups: [
                { name: 'A', values: [exact('a')] },
                { name: 'Empty', values: [] },
                { name: 'B', values: [exact('b')] },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain('THEN 0');
        expect(result).toContain('THEN 1');
        expect(result).toContain('ELSE 2');
        expect(result).not.toContain('Empty');
    });

    it('escapes values correctly with single-quote escape char', () => {
        const result = getCustomGroupOrderSql({
            binGroups: [{ name: 'Test', values: [exact("O'Brien")] }],
            baseDimensionSql,
            warehouseSqlBuilder: singleQuoteEscapeBuilder,
        });

        expect(result).toContain(`'O''Brien'`);
        expect(result).not.toContain(`''''`);
    });
});
