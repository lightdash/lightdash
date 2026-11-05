import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { inferSqlEditorPreferences } from './sqlEditorPreferences';

describe('inferSqlEditorPreferences', () => {
    it('quotes and preserves case when nothing has been typed', () => {
        expect(
            inferSqlEditorPreferences('', '"', WarehouseTypes.POSTGRES),
        ).toEqual({
            quotePreference: 'always',
            casePreference: 'preserve',
            qualification: 'schema',
        });
    });

    it('uppercases on Snowflake by default', () => {
        expect(
            inferSqlEditorPreferences(
                'select 1',
                '"',
                WarehouseTypes.SNOWFLAKE,
            ),
        ).toEqual({
            quotePreference: 'always',
            casePreference: 'uppercase',
            qualification: 'schema',
        });
    });

    it('stops quoting when the query references tables bare', () => {
        expect(
            inferSqlEditorPreferences(
                'select * from jaffle.orders o join jaffle.customers c on o.id = c.id',
                '"',
                WarehouseTypes.POSTGRES,
            ),
        ).toMatchObject({ quotePreference: 'never' });
    });

    it('keeps quoting when the query quotes its tables', () => {
        expect(
            inferSqlEditorPreferences(
                'SELECT * FROM "postgres"."jaffle"."orders"',
                '"',
                WarehouseTypes.POSTGRES,
            ),
        ).toMatchObject({ quotePreference: 'always' });
    });

    it('follows the majority when styles are mixed', () => {
        expect(
            inferSqlEditorPreferences(
                'select * from a join b on 1=1 join "c" on 1=1',
                '"',
                WarehouseTypes.POSTGRES,
            ),
        ).toMatchObject({ quotePreference: 'never' });
    });

    it('ignores strings and comments', () => {
        expect(
            inferSqlEditorPreferences(
                `-- from "legacy"."table"
                 select 'from "x"' from orders /* join "y" */`,
                '"',
                WarehouseTypes.POSTGRES,
            ),
        ).toMatchObject({ quotePreference: 'never' });
    });

    it('matches lowercase identifiers on Snowflake', () => {
        expect(
            inferSqlEditorPreferences(
                'select * from analytics.orders',
                '"',
                WarehouseTypes.SNOWFLAKE,
            ),
        ).toEqual({
            quotePreference: 'never',
            casePreference: 'lowercase',
            qualification: 'schema',
        });
    });

    it('matches uppercase quoted identifiers on Snowflake', () => {
        expect(
            inferSqlEditorPreferences(
                'SELECT * FROM "ANALYTICS"."ORDERS"',
                '"',
                WarehouseTypes.SNOWFLAKE,
            ),
        ).toEqual({
            quotePreference: 'always',
            casePreference: 'uppercase',
            qualification: 'schema',
        });
    });

    it('never changes case outside Snowflake', () => {
        expect(
            inferSqlEditorPreferences(
                'SELECT * FROM `PROJECT`.`DATASET`.`ORDERS`',
                '`',
                WarehouseTypes.BIGQUERY,
            ),
        ).toEqual({
            quotePreference: 'always',
            casePreference: 'preserve',
            qualification: 'full',
        });
    });

    it('qualifies as deeply as the query does', () => {
        const depth = (sql: string) =>
            inferSqlEditorPreferences(sql, '"', WarehouseTypes.POSTGRES)
                .qualification;
        expect(depth('select * from orders')).toBe('schema');
        expect(depth('select * from jaffle.orders')).toBe('schema');
        expect(depth('select * from "postgres"."jaffle"."orders"')).toBe(
            'full',
        );
        expect(
            depth(
                'select * from a.b.c join jaffle.customers c on 1=1 join x on 1=1',
            ),
        ).toBe('schema');
    });

    it('reads a dotted path inside one backtick pair as its parts', () => {
        expect(
            inferSqlEditorPreferences(
                'select * from `project.dataset.orders`',
                '`',
                WarehouseTypes.BIGQUERY,
            ).qualification,
        ).toBe('full');
    });

    it('handles backtick quoting', () => {
        expect(
            inferSqlEditorPreferences(
                'select * from `project.dataset.orders`',
                '`',
                WarehouseTypes.BIGQUERY,
            ),
        ).toMatchObject({ quotePreference: 'always' });
    });
});
