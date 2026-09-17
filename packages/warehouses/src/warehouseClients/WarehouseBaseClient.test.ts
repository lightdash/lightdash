import {
    CreatePostgresCredentials,
    WarehouseDatabaseListingNotSupportedError,
    WarehouseTypes,
} from '@lightdash/common';
import { PostgresWarehouseClient } from './PostgresWarehouseClient';

const credentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'user',
    password: 'password',
    port: 5432,
    dbname: 'db',
    schema: 'public',
};

describe('WarehouseBaseClient database listing defaults', () => {
    test('listDatabases refuses with the not-supported error', async () => {
        const client = new PostgresWarehouseClient(credentials);
        await expect(client.listDatabases()).rejects.toBeInstanceOf(
            WarehouseDatabaseListingNotSupportedError,
        );
        await expect(client.listDatabases()).rejects.toThrow(
            'Additional databases are not supported for postgres yet',
        );
    });

    test('getTablesForDatabase refuses with the not-supported error', async () => {
        const client = new PostgresWarehouseClient(credentials);
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
