import {
    CreateRedshiftCredentials,
    RedshiftAuthenticationType,
    WarehouseDatabaseListingNotSupportedError,
    WarehouseTypes,
} from '@lightdash/common';
import { RedshiftWarehouseClient } from './RedshiftWarehouseClient';

const credentials: CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'localhost',
    user: 'user',
    password: 'password',
    port: 5439,
    dbname: 'db',
    schema: 'public',
    authenticationType: RedshiftAuthenticationType.PASSWORD,
};

describe('WarehouseBaseClient database listing defaults', () => {
    test('listDatabases refuses with the not-supported error', async () => {
        const client = new RedshiftWarehouseClient(credentials);
        await expect(client.listDatabases()).rejects.toBeInstanceOf(
            WarehouseDatabaseListingNotSupportedError,
        );
        await expect(client.listDatabases()).rejects.toThrow(
            'Additional databases are not supported for redshift yet',
        );
    });

    test('getTablesForDatabase refuses with the not-supported error', async () => {
        const client = new RedshiftWarehouseClient(credentials);
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
