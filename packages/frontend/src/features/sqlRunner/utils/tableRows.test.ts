import { PartitionType, WarehouseTableType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildTableRows,
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
        const filtered = filterTablesBySchema(tablesBySchema, 'orders');

        expect(filtered).toEqual([
            { schema: 'jaffle', tables: { orders: { partitionColumn } } },
            { schema: 'staging', tables: { stg_orders: {} } },
        ]);
    });

    it('returns nothing when no table matches', () => {
        expect(filterTablesBySchema(tablesBySchema, 'zzz')).toEqual([]);
    });
});
