import {
    AiTransportKind,
    WarehouseDatabaseListingNotSupportedError,
} from '@lightdash/common';
import { BigqueryWarehouseClient } from './BigqueryWarehouseClient';
import { credentials } from './BigqueryWarehouseClient.mock';
import { PostgresWarehouseClient } from './PostgresWarehouseClient';
import { credentials as postgresCredentials } from './PostgresWarehouseClient.mock';

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

describe('WarehouseBaseClient AI transport', () => {
    test('direct transport preserves SQL and bind values', () => {
        const client = new PostgresWarehouseClient(postgresCredentials);
        const values = ['one', 2];
        const wrapped = client.wrapForTransport('SELECT $1, $2', values, {
            kind: AiTransportKind.DIRECT,
        });
        expect(wrapped).toEqual({ sql: 'SELECT $1, $2', values });
        expect(wrapped.values).toBe(values);
    });
});
