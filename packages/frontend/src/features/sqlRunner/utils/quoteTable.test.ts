import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { quoteTable, quoteTableForQuery } from './quoteTable';

const table = {
    database: 'models-project',
    schema: 'jaffle',
    table: 'orders',
};

describe('quoteTableForQuery', () => {
    it('keeps the BigQuery model project even with a single catalog database', () => {
        expect(
            quoteTableForQuery(table, '`', false, WarehouseTypes.BIGQUERY),
        ).toBe('`models-project`.`jaffle`.`orders`');
    });

    it('keeps the BigQuery model project with several catalog databases', () => {
        expect(
            quoteTableForQuery(table, '`', true, WarehouseTypes.BIGQUERY),
        ).toBe('`models-project`.`jaffle`.`orders`');
    });

    it('uses schema.table for a single Snowflake database', () => {
        expect(
            quoteTableForQuery(table, '"', false, WarehouseTypes.SNOWFLAKE),
        ).toBe('"jaffle"."orders"');
    });

    it('qualifies same-named tables across multiple databases', () => {
        expect(
            quoteTableForQuery(table, '"', true, WarehouseTypes.SNOWFLAKE),
        ).toBe('"models-project"."jaffle"."orders"');
    });

    it('omits empty database identifiers', () => {
        expect(
            quoteTableForQuery(
                { ...table, database: '' },
                '"',
                true,
                WarehouseTypes.POSTGRES,
            ),
        ).toBe('"jaffle"."orders"');
    });
});

describe('quoteTable', () => {
    it('always copies the fully qualified table name', () => {
        expect(quoteTable(table, '`')).toBe(
            '`models-project`.`jaffle`.`orders`',
        );
    });
});
