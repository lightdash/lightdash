import { PartitionType, WarehouseTableType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildTableRows,
    catalogHasViews,
    filterTablesBySchema,
    type SchemaTables,
} from './tableRows';

const partitionColumn = {
    field: 'created_at',
    partitionType: PartitionType.DATE,
};

const tablesBySchema: SchemaTables[] = [
    {
        schema: 'jaffle',
        tables: {
            customers: {},
            orders: { partitionColumn },
            payments: { tableType: WarehouseTableType.VIEW },
        },
    },
    { schema: 'staging', tables: { stg_orders: {} } },
];

describe('buildTableRows', () => {
    it('emits only headers for collapsed schemas', () => {
        const rows = buildTableRows(tablesBySchema, () => false);

        expect(rows).toEqual([
            {
                type: 'schema',
                id: 'schema:jaffle',
                schema: 'jaffle',
                isExpanded: false,
                tableCount: 3,
            },
            {
                type: 'schema',
                id: 'schema:staging',
                schema: 'staging',
                isExpanded: false,
                tableCount: 1,
            },
        ]);
    });

    it('interleaves every table under an expanded schema', () => {
        const rows = buildTableRows(
            tablesBySchema,
            (schema) => schema === 'jaffle',
        );

        expect(rows.map((row) => row.id)).toEqual([
            'schema:jaffle',
            'table:jaffle.customers',
            'table:jaffle.orders',
            'table:jaffle.payments',
            'schema:staging',
        ]);
        expect(rows[2]).toEqual({
            type: 'table',
            id: 'table:jaffle.orders',
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
});

describe('filterTablesBySchema', () => {
    it('keeps matching tables and drops schemas without matches', () => {
        const filtered = filterTablesBySchema(tablesBySchema, 'orders', null);

        expect(filtered).toEqual([
            { schema: 'jaffle', tables: { orders: { partitionColumn } } },
            { schema: 'staging', tables: { stg_orders: {} } },
        ]);
    });

    it('returns nothing when no table matches', () => {
        expect(filterTablesBySchema(tablesBySchema, 'zzz', null)).toEqual([]);
    });

    it('keeps only views, treating untyped rows as tables', () => {
        expect(filterTablesBySchema(tablesBySchema, '', 'views')).toEqual([
            {
                schema: 'jaffle',
                tables: { payments: { tableType: WarehouseTableType.VIEW } },
            },
        ]);
        expect(filterTablesBySchema(tablesBySchema, '', 'tables')).toEqual([
            {
                schema: 'jaffle',
                tables: { customers: {}, orders: { partitionColumn } },
            },
            { schema: 'staging', tables: { stg_orders: {} } },
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
            catalogHasViews([{ schema: 'raw', tables: { a: {}, b: {} } }]),
        ).toBe(false);
    });
});
