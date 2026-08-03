import { RedshiftAuthenticationType, WarehouseTypes } from '@lightdash/common';
import { RedshiftWarehouseClient } from './RedshiftWarehouseClient';

describe('RedshiftWarehouseClient', () => {
    it('keeps catalog filters in the Redshift query', async () => {
        const warehouse = new RedshiftWarehouseClient({
            type: WarehouseTypes.REDSHIFT,
            host: 'localhost',
            user: 'analytics',
            password: 'password',
            port: 5439,
            dbname: 'warehouse',
            schema: 'public',
            authenticationType: RedshiftAuthenticationType.PASSWORD,
        });
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
});
