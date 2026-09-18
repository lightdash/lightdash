import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import { RedshiftWarehouseClient } from './RedshiftWarehouseClient';

const credentials: CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'localhost',
    user: 'analytics',
    password: 'password',
    port: 5439,
    dbname: 'warehouse',
    schema: 'public',
    authenticationType: RedshiftAuthenticationType.PASSWORD,
};

const redshiftVersion = {
    rows: [
        { version: 'PostgreSQL 8.0.2 on i686-pc-linux-gnu, Redshift 1.0.77' },
    ],
    fields: {},
};

describe('RedshiftWarehouseClient', () => {
    it('keeps catalog filters in the Redshift query', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce({
                rows: [{ version: 'PostgreSQL 8.0.2' }],
                fields: {},
            })
            .mockResolvedValueOnce({ rows: [], fields: {} });

        await warehouse.getCatalog([
            { database: 'warehouse', schema: 'public', table: 'orders' },
        ]);

        const catalogQuery = runQuery.mock.calls[1][0];
        expect(catalogQuery).toContain("table_catalog IN ('warehouse')");
        expect(catalogQuery).toContain("table_schema IN ('public')");
        expect(catalogQuery).toContain("table_name IN ('orders')");
        expect(runQuery.mock.calls[1][3]).toBeUndefined();
    });

    it('lists granted tables and views from svv_all_tables scoped to the database', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce(redshiftVersion)
            .mockResolvedValueOnce({
                rows: [
                    {
                        database_name: 'warehouse',
                        schema_name: 'public',
                        table_name: 'orders',
                        table_type: 'TABLE',
                    },
                    {
                        database_name: 'warehouse',
                        schema_name: 'public',
                        table_name: 'orders_lbv',
                        table_type: 'VIEW',
                    },
                    {
                        database_name: 'warehouse',
                        schema_name: 'spectrum',
                        table_name: 'sales',
                        table_type: 'EXTERNAL TABLE',
                    },
                    {
                        database_name: 'warehouse',
                        schema_name: 'shared',
                        table_name: 'customers',
                        table_type: 'SHARED TABLE',
                    },
                ],
                fields: {},
            });

        const tables = await warehouse.getAllTables();

        const [query, , , values] = runQuery.mock.calls[1];
        expect(query).toContain('FROM svv_all_tables');
        expect(query).toContain('database_name = $1');
        expect(query).not.toContain('FROM svv_tables');
        expect(values).toEqual(['warehouse']);
        expect(tables).toEqual([
            {
                database: 'warehouse',
                schema: 'public',
                table: 'orders',
                tableType: 'table',
            },
            {
                database: 'warehouse',
                schema: 'public',
                table: 'orders_lbv',
                tableType: 'view',
            },
            {
                database: 'warehouse',
                schema: 'spectrum',
                table: 'sales',
                tableType: 'external',
            },
            {
                database: 'warehouse',
                schema: 'shared',
                table: 'customers',
                tableType: 'table',
            },
        ]);
    });

    it('reads columns from svv_columns so late-binding views resolve', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce(redshiftVersion)
            .mockResolvedValueOnce({
                rows: [
                    {
                        table_catalog: 'warehouse',
                        table_schema: 'public',
                        table_name: 'orders_lbv',
                        column_name: 'quantity',
                        data_type: 'integer',
                    },
                ],
                fields: {},
            });

        const fields = await warehouse.getFields(
            'orders_lbv',
            'public',
            'warehouse',
        );

        const [query, , , values] = runQuery.mock.calls[1];
        expect(query).toContain('FROM svv_columns c');
        expect(query).toContain('JOIN svv_all_tables');
        expect(query).not.toContain('EXISTS');
        expect(values).toEqual(['orders_lbv', 'public', 'warehouse']);
        expect(fields).toEqual({
            warehouse: {
                public: { orders_lbv: { quantity: 'number' } },
            },
        });
    });

    it('keeps the Postgres catalog when the server is not Redshift', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce({
                rows: [{ version: 'PostgreSQL 15.4' }],
                fields: {},
            })
            .mockResolvedValueOnce({ rows: [], fields: {} })
            .mockResolvedValueOnce({ rows: [], fields: {} });

        await warehouse.getAllTables();
        await warehouse.getFields('orders', 'public');

        expect(runQuery).toHaveBeenCalledTimes(3);
        expect(runQuery.mock.calls[1][0]).toContain(
            'FROM information_schema.tables',
        );
        expect(runQuery.mock.calls[1][0]).not.toContain('svv_');
        expect(runQuery.mock.calls[2][0]).toContain(
            'FROM information_schema.columns',
        );
        expect(runQuery.mock.calls[2][0]).not.toContain('svv_');
    });

    it('keeps the grant-filtered table source', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce(redshiftVersion)
            .mockResolvedValueOnce({ rows: [], fields: {} });

        await warehouse.getAllTables();

        const query = runQuery.mock.calls[1][0];
        expect(query).not.toContain('svv_tables');
        expect(query).not.toContain('FROM information_schema');
        expect(query).toContain(
            "schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_internal')",
        );
    });
});
