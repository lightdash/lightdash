import {
    AthenaAuthenticationType,
    ParameterError,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type CreateDatabricksCredentials,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import {
    credentialsForListedDatabase,
    getDefaultListedDatabase,
    listConnectionDatabases,
} from './connectionSqlRunner';

const postgres: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    user: 'user',
    password: 'password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
};

const athena: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'eu-west-1',
    database: 'AwsDataCatalog',
    schema: 'analytics',
    s3StagingDir: 's3://staging/',
    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
    accessKeyId: 'key',
    secretAccessKey: 'secret',
};

const neverListsAll = vi.fn(async () => {
    throw new Error('listDatabases must not be called');
});

describe('listConnectionDatabases', () => {
    test('trims, drops blanks and duplicates, and keeps the default first', async () => {
        await expect(
            listConnectionDatabases({
                connection: {
                    listAllDatabases: false,
                    additionalDatabases: [' sales ', '', 'analytics', 'sales'],
                },
                credentials: postgres,
                listAllDatabases: neverListsAll,
            }),
        ).resolves.toEqual({
            databases: [
                {
                    name: 'analytics',
                    database: 'analytics',
                    schema: null,
                    isDefault: true,
                },
                {
                    name: 'sales',
                    database: 'sales',
                    schema: null,
                    isDefault: false,
                },
            ],
            truncated: false,
            limit: 100,
        });
    });

    test('caps named databases at the listing limit and reports truncation', async () => {
        const listing = await listConnectionDatabases({
            connection: {
                listAllDatabases: false,
                additionalDatabases: Array.from(
                    { length: 100 },
                    (_, index) => `database_${index}`,
                ),
            },
            credentials: postgres,
            listAllDatabases: neverListsAll,
        });

        expect(listing.databases).toHaveLength(100);
        expect(listing.databases[0].name).toBe('analytics');
        expect(listing.truncated).toBe(true);
    });

    test('lists Athena databases as schemas of the connection catalog', async () => {
        const listing = await listConnectionDatabases({
            connection: {
                listAllDatabases: false,
                additionalDatabases: ['sales'],
            },
            credentials: athena,
            listAllDatabases: neverListsAll,
        });

        expect(listing.databases).toEqual([
            {
                name: 'analytics',
                database: 'AwsDataCatalog',
                schema: 'analytics',
                isDefault: true,
            },
            {
                name: 'sales',
                database: 'AwsDataCatalog',
                schema: 'sales',
                isDefault: false,
            },
        ]);
    });

    test('asks the warehouse only when the connection lists all databases', async () => {
        const listAllDatabases = vi.fn(async () => ({
            databases: [],
            truncated: false,
            limit: 100,
        }));

        await listConnectionDatabases({
            connection: { listAllDatabases: true, additionalDatabases: [] },
            credentials: postgres,
            listAllDatabases,
        });

        expect(listAllDatabases).toHaveBeenCalledOnce();
    });

    test('lists only the default database for a warehouse without listing support', async () => {
        const databricks = {
            type: WarehouseTypes.DATABRICKS,
            database: 'default',
            serverHostName: 'host',
            httpPath: '/path',
        } as CreateDatabricksCredentials;

        await expect(
            listConnectionDatabases({
                connection: {
                    listAllDatabases: true,
                    additionalDatabases: ['other'],
                },
                credentials: databricks,
                listAllDatabases: neverListsAll,
            }),
        ).resolves.toEqual({
            databases: [
                {
                    name: 'DEFAULT',
                    database: 'DEFAULT',
                    schema: null,
                    isDefault: true,
                },
            ],
            truncated: false,
            limit: 100,
        });
    });
});

describe('credentialsForListedDatabase', () => {
    test('connects Postgres to the listed database', () => {
        expect(
            credentialsForListedDatabase(postgres, {
                name: 'sales',
                database: 'sales',
                schema: null,
                isDefault: false,
            }),
        ).toEqual({ ...postgres, dbname: 'sales' });
    });

    test('refuses a Postgres database name the connection string cannot carry', () => {
        expect(() =>
            credentialsForListedDatabase(postgres, {
                name: 'sales&host=elsewhere',
                database: 'sales&host=elsewhere',
                schema: null,
                isDefault: false,
            }),
        ).toThrow(ParameterError);
    });

    test('keeps Athena credentials, which name the catalog per request', () => {
        expect(
            credentialsForListedDatabase(
                athena,
                getDefaultListedDatabase(athena),
            ),
        ).toBe(athena);
    });
});
