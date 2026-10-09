import { PartitionType, WarehouseTableType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    ALL_SCHEMAS_SECTION_ID,
    buildRecentRows,
    buildTableRows,
    catalogHasDevSchemas,
    catalogHasViews,
    DEV_SCHEMAS_GROUP_ID,
    filterTablesBySchema,
    isActiveSchema,
    RECENT_SECTION_ID,
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
                depth: 0,
            },
            {
                type: 'schema',
                id: 'schema:warehouse.staging',
                database: 'warehouse',
                schema: 'staging',
                databaseLabel: null,
                isExpanded: false,
                tableCount: 1,
                depth: 0,
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
            depth: 0,
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

const withDevSchemas: SchemaTables[] = [
    ...tablesBySchema,
    {
        database: 'warehouse',
        schema: 'dbt_cloud_pr_1045437_829',
        tables: { orders: {} },
    },
    {
        database: 'warehouse',
        schema: 'dbt_cloud_pr_1045437_830',
        tables: { orders: {}, customers: {} },
    },
];

describe('buildTableRows with dev schema grouping', () => {
    it('folds dev schemas into one collapsed node after the others', () => {
        const rows = buildTableRows(withDevSchemas, () => false, false, {
            isGroupExpanded: false,
        });

        expect(rows.map((row) => row.id)).toEqual([
            'schema:warehouse.jaffle',
            'schema:warehouse.staging',
            DEV_SCHEMAS_GROUP_ID,
        ]);
        expect(rows[2]).toMatchObject({
            type: 'group',
            label: 'dev & pr schemas',
            isExpanded: false,
            schemaCount: 2,
        });
    });

    it('indents dev schemas and their tables inside the expanded group', () => {
        const rows = buildTableRows(
            withDevSchemas,
            (_, { schema }) => schema === 'dbt_cloud_pr_1045437_830',
            false,
            { isGroupExpanded: true },
        );

        expect(rows.slice(2)).toMatchObject([
            { type: 'group', isExpanded: true },
            { type: 'schema', schema: 'dbt_cloud_pr_1045437_829', depth: 1 },
            { type: 'schema', schema: 'dbt_cloud_pr_1045437_830', depth: 1 },
            { type: 'table', table: 'orders', depth: 1 },
            { type: 'table', table: 'customers', depth: 1 },
        ]);
        expect(rows.slice(0, 2)).toMatchObject([
            { type: 'schema', depth: 0 },
            { type: 'schema', depth: 0 },
        ]);
    });

    it('emits no group when nothing matches the dev pattern', () => {
        const rows = buildTableRows(tablesBySchema, () => false, false, {
            isGroupExpanded: true,
        });

        expect(rows.map((row) => row.type)).toEqual(['schema', 'schema']);
    });

    it('reports whether a catalog has dev schemas', () => {
        expect(catalogHasDevSchemas(withDevSchemas)).toBe(true);
        expect(catalogHasDevSchemas(tablesBySchema)).toBe(false);
    });
});

describe('buildRecentRows', () => {
    it('wraps recent tables in their own section before the schema list', () => {
        const rows = buildRecentRows(
            [
                { database: 'warehouse', schema: 'jaffle', table: 'orders' },
                { database: 'warehouse', schema: 'jaffle', table: 'payments' },
            ],
            tablesBySchema,
        );

        expect(rows).toEqual([
            { type: 'section', id: RECENT_SECTION_ID, label: 'Recent' },
            {
                type: 'recent',
                id: 'recent:warehouse.jaffle.orders',
                database: 'warehouse',
                schema: 'jaffle',
                table: 'orders',
                partitionColumn,
                tableType: undefined,
            },
            {
                type: 'recent',
                id: 'recent:warehouse.jaffle.payments',
                database: 'warehouse',
                schema: 'jaffle',
                table: 'payments',
                partitionColumn: undefined,
                tableType: WarehouseTableType.VIEW,
            },
            {
                type: 'section',
                id: ALL_SCHEMAS_SECTION_ID,
                label: 'All schemas',
            },
        ]);
    });

    it('drops tables that are no longer in the catalog', () => {
        const rows = buildRecentRows(
            [{ database: 'warehouse', schema: 'jaffle', table: 'gone' }],
            tablesBySchema,
        );

        expect(rows).toEqual([]);
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

    it('keeps every table of a schema whose name matches', () => {
        expect(filterTablesBySchema(tablesBySchema, 'JAFF', null)).toEqual([
            tablesBySchema[0],
        ]);
        expect(filterTablesBySchema(tablesBySchema, ' staging ', null)).toEqual(
            [tablesBySchema[1]],
        );
    });

    it('keeps every schema of a database whose name matches', () => {
        expect(filterTablesBySchema(twoDatabases, 'prod', null)).toEqual([
            twoDatabases[1],
        ]);
    });

    it('still applies the type filter to a matching schema', () => {
        expect(filterTablesBySchema(tablesBySchema, 'jaffle', 'views')).toEqual(
            [
                {
                    database: 'warehouse',
                    schema: 'jaffle',
                    tables: {
                        payments: { tableType: WarehouseTableType.VIEW },
                    },
                },
            ],
        );
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
