import { PartitionType, WarehouseTableType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildTableRows,
    catalogHasViews,
    filterTablesBySchema,
    isActiveSchema,
    type SchemaTables,
} from './tableRows';

const partitionColumn = {
    field: 'created_at',
    partitionType: PartitionType.DATE,
};

const tablesBySchema: SchemaTables[] = [
    {
        database: 'warehouse',
        schema: 'jaffle',
        tables: {
            customers: {},
            orders: { partitionColumn },
            payments: { tableType: WarehouseTableType.VIEW },
        },
    },
    { database: 'warehouse', schema: 'staging', tables: { stg_orders: {} } },
];

const twoDatabases: SchemaTables[] = [
    { database: 'dev', schema: 'main', tables: { orders: {} } },
    { database: 'prod', schema: 'main', tables: { orders: {} } },
];

describe('buildTableRows', () => {
    it('emits only headers for collapsed schemas', () => {
        const rows = buildTableRows(tablesBySchema, () => false, false);

        expect(rows).toEqual([
            {
                type: 'schema',
                id: 'schema:warehouse.jaffle',
                database: 'warehouse',
                schema: 'jaffle',
                databaseLabel: null,
                isExpanded: false,
                tableCount: 3,
            },
            {
                type: 'schema',
                id: 'schema:warehouse.staging',
                database: 'warehouse',
                schema: 'staging',
                databaseLabel: null,
                isExpanded: false,
                tableCount: 1,
            },
        ]);
    });

    it('interleaves every table under an expanded schema', () => {
        const rows = buildTableRows(
            tablesBySchema,
            (_, { schema }) => schema === 'jaffle',
            false,
        );

        expect(rows.map((row) => row.id)).toEqual([
            'schema:warehouse.jaffle',
            'table:warehouse.jaffle.customers',
            'table:warehouse.jaffle.orders',
            'table:warehouse.jaffle.payments',
            'schema:warehouse.staging',
        ]);
        expect(rows[2]).toEqual({
            type: 'table',
            id: 'table:warehouse.jaffle.orders',
            database: 'warehouse',
            schema: 'jaffle',
            table: 'orders',
            partitionColumn,
            tableType: undefined,
        });
        expect(rows[3]).toMatchObject({
            table: 'payments',
            tableType: WarehouseTableType.VIEW,
        });
    });

    it('gives same-named schemas in different databases their own rows', () => {
        const rows = buildTableRows(twoDatabases, () => true, true);

        expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
        expect(rows.map((row) => row.id)).toEqual([
            'schema:dev.main',
            'table:dev.main.orders',
            'schema:prod.main',
            'table:prod.main.orders',
        ]);
    });

    it('expands one schema without expanding its namesake', () => {
        const rows = buildTableRows(
            twoDatabases,
            (schemaRowId) => schemaRowId === 'schema:prod.main',
            true,
        );

        expect(rows).toMatchObject([
            { type: 'schema', database: 'dev', isExpanded: false },
            { type: 'schema', database: 'prod', isExpanded: true },
            { type: 'table', database: 'prod', table: 'orders' },
        ]);
    });

    it('labels schemas with their database only when asked to', () => {
        const labels = (showDatabase: boolean) =>
            buildTableRows(twoDatabases, () => false, showDatabase).map((row) =>
                row.type === 'schema' ? row.databaseLabel : null,
            );

        expect(labels(true)).toEqual(['dev', 'prod']);
        expect(labels(false)).toEqual([null, null]);
    });

    it('leaves a database without a name unlabelled', () => {
        const rows = buildTableRows(
            [{ database: '', schema: 'main', tables: { orders: {} } }],
            () => false,
            true,
        );

        expect(rows).toMatchObject([{ type: 'schema', databaseLabel: null }]);
    });
});

describe('isActiveSchema', () => {
    const prodMain = { database: 'prod', schema: 'main' };

    it('matches the schema in the active database', () => {
        expect(
            isActiveSchema(prodMain, {
                activeDatabase: 'prod',
                activeSchema: 'main',
            }),
        ).toBe(true);
    });

    it('does not match a same-named schema in another database', () => {
        expect(
            isActiveSchema(prodMain, {
                activeDatabase: 'dev',
                activeSchema: 'main',
            }),
        ).toBe(false);
    });

    it('matches by schema alone when no database is stored', () => {
        const active = { activeDatabase: undefined, activeSchema: 'main' };

        expect(isActiveSchema(prodMain, active)).toBe(true);
        expect(
            isActiveSchema({ database: 'prod', schema: 'staging' }, active),
        ).toBe(false);
    });
});

describe('filterTablesBySchema', () => {
    it('keeps matching tables and drops schemas without matches', () => {
        const filtered = filterTablesBySchema(tablesBySchema, 'orders', null);

        expect(filtered).toEqual([
            {
                database: 'warehouse',
                schema: 'jaffle',
                tables: { orders: { partitionColumn } },
            },
            {
                database: 'warehouse',
                schema: 'staging',
                tables: { stg_orders: {} },
            },
        ]);
    });

    it('returns nothing when no table matches', () => {
        expect(filterTablesBySchema(tablesBySchema, 'zzz', null)).toEqual([]);
    });

    it('keeps only views, treating untyped rows as tables', () => {
        expect(filterTablesBySchema(tablesBySchema, '', 'views')).toEqual([
            {
                database: 'warehouse',
                schema: 'jaffle',
                tables: { payments: { tableType: WarehouseTableType.VIEW } },
            },
        ]);
        expect(filterTablesBySchema(tablesBySchema, '', 'tables')).toEqual([
            {
                database: 'warehouse',
                schema: 'jaffle',
                tables: { customers: {}, orders: { partitionColumn } },
            },
            {
                database: 'warehouse',
                schema: 'staging',
                tables: { stg_orders: {} },
            },
        ]);
    });

    it('combines the type filter with the search', () => {
        expect(filterTablesBySchema(tablesBySchema, 'orders', 'views')).toEqual(
            [],
        );
        expect(
            filterTablesBySchema(tablesBySchema, 'payments', 'views'),
        ).toEqual([
            {
                database: 'warehouse',
                schema: 'jaffle',
                tables: { payments: { tableType: WarehouseTableType.VIEW } },
            },
        ]);
    });
});

describe('catalogHasViews', () => {
    it('is true only when some table is a view or materialized view', () => {
        expect(catalogHasViews(tablesBySchema)).toBe(true);
        expect(
            catalogHasViews([
                {
                    database: 'warehouse',
                    schema: 'raw',
                    tables: { a: {}, b: {} },
                },
            ]),
        ).toBe(false);
    });
});
