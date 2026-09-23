import { WarehouseDatabaseListingNotSupportedError } from '@lightdash/common';
import { BigqueryWarehouseClient } from './BigqueryWarehouseClient';
import { credentials } from './BigqueryWarehouseClient.mock';

describe('WarehouseBaseClient database listing defaults', () => {
    test('listDatabases refuses with the not-supported error', async () => {
        const client = new BigqueryWarehouseClient(credentials);
        await expect(client.listDatabases()).rejects.toBeInstanceOf(
            WarehouseDatabaseListingNotSupportedError,
        );
        await expect(client.listDatabases()).rejects.toThrow(
            'Additional databases are not supported for bigquery yet',
        );
    });

    test('getTablesForDatabase refuses with the not-supported error', async () => {
        const client = new BigqueryWarehouseClient(credentials);
        await expect(
            client.getTablesForDatabase({
                name: 'other',
                database: 'other',
                schema: null,
                isDefault: false,
            }),
        ).rejects.toBeInstanceOf(WarehouseDatabaseListingNotSupportedError);
    });
});
