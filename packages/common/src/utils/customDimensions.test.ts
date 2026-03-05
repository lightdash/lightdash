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

describe('getCustomGroupSelectSql', () => {
    const baseDimensionSql = '"orders"."payment_method"';

    it('generates CASE WHEN for basic groups', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [
                { name: 'Cards', values: ['credit_card', 'gift_card'] },
                { name: 'Other Methods', values: ['bank_transfer'] },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(
            `WHEN ${baseDimensionSql} IN ('credit_card', 'gift_card') THEN 'Cards'`,
        );
        expect(result).toContain(
            `WHEN ${baseDimensionSql} IN ('bank_transfer') THEN 'Other Methods'`,
        );
        expect(result).toContain(`WHEN ${baseDimensionSql} IS NULL THEN NULL`);
        expect(result).toContain(`ELSE 'Other'`);
    });

    it('filters out empty groups', () => {
        const result = getCustomGroupSelectSql({
            binGroups: [
                { name: 'Cards', values: ['credit_card'] },
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
                binGroups: [{ name: 'Names', values: ["O'Brien"] }],
                baseDimensionSql,
                warehouseSqlBuilder: backslashEscapeBuilder,
            });

            expect(result).toContain(`'O\\'Brien'`);
        });

        it('escapes backslashes in values', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: 'Paths', values: ['C:\\Users'] }],
                baseDimensionSql,
                warehouseSqlBuilder: backslashEscapeBuilder,
            });

            expect(result).toContain(`'C:\\\\Users'`);
        });

        it('escapes single quotes in group names', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: "Manager's Pick", values: ['item1'] }],
                baseDimensionSql,
                warehouseSqlBuilder: backslashEscapeBuilder,
            });

            expect(result).toContain(`THEN 'Manager\\'s Pick'`);
        });
    });

    describe('escaping with single-quote escape char (Postgres/Trino/Athena/ClickHouse)', () => {
        it('escapes single quotes in values by doubling', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: 'Names', values: ["O'Brien"] }],
                baseDimensionSql,
                warehouseSqlBuilder: singleQuoteEscapeBuilder,
            });

            expect(result).toContain(`'O''Brien'`);
            expect(result).not.toContain(`''''`);
        });

        it('escapes single quotes in group names by doubling', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: "Manager's Pick", values: ['item1'] }],
                baseDimensionSql,
                warehouseSqlBuilder: singleQuoteEscapeBuilder,
            });

            expect(result).toContain(`THEN 'Manager''s Pick'`);
            expect(result).not.toContain(`''''`);
        });

        it('handles multiple quotes in a single value', () => {
            const result = getCustomGroupSelectSql({
                binGroups: [{ name: 'Test', values: ["it's a 'test'"] }],
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
                { name: 'Cards', values: ['credit_card', 'gift_card'] },
                { name: 'Bank', values: ['bank_transfer'] },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain(
            `WHEN ${baseDimensionSql} IN ('credit_card', 'gift_card') THEN 0`,
        );
        expect(result).toContain(
            `WHEN ${baseDimensionSql} IN ('bank_transfer') THEN 1`,
        );
        expect(result).toContain(`WHEN ${baseDimensionSql} IS NULL THEN NULL`);
    });

    it('sorts "Other" last with index equal to group count', () => {
        const result = getCustomGroupOrderSql({
            binGroups: [
                { name: 'A', values: ['a'] },
                { name: 'B', values: ['b'] },
                { name: 'C', values: ['c'] },
            ],
            baseDimensionSql,
            warehouseSqlBuilder: backslashEscapeBuilder,
        });

        expect(result).toContain('ELSE 3');
    });

    it('skips empty groups in index calculation', () => {
        const result = getCustomGroupOrderSql({
            binGroups: [
                { name: 'A', values: ['a'] },
                { name: 'Empty', values: [] },
                { name: 'B', values: ['b'] },
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
            binGroups: [{ name: 'Test', values: ["O'Brien"] }],
            baseDimensionSql,
            warehouseSqlBuilder: singleQuoteEscapeBuilder,
        });

        expect(result).toContain(`'O''Brien'`);
        expect(result).not.toContain(`''''`);
    });
});
