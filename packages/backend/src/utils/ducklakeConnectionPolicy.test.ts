import {
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    WarehouseTypes,
    type CreateDuckdbDucklakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { assertDucklakeConnectionAllowed } from './ducklakeConnectionPolicy';

const catalogs: CreateDuckdbDucklakeCredentials['catalog'][] = [
    {
        type: DucklakeCatalogType.POSTGRES,
        host: 'example.invalid',
        port: 5432,
        database: 'catalog',
        user: 'user',
        password: 'synthetic',
    },
    { type: DucklakeCatalogType.SQLITE, path: '/tmp/catalog.sqlite' },
    {
        type: DucklakeCatalogType.DUCKDB,
        path: 'https://example.invalid/catalog.ducklake',
    },
];
const paths: CreateDuckdbDucklakeCredentials['dataPath'][] = [
    { type: DucklakeDataPathType.S3, url: 's3://example/data/' },
    {
        type: DucklakeDataPathType.S3,
        url: 's3://example/data/',
        accessKeyId: 'synthetic',
        secretAccessKey: 'synthetic',
    },
    {
        type: DucklakeDataPathType.GCS,
        url: 'gs://example/data/',
        hmacKeyId: 'synthetic',
        hmacSecret: 'synthetic',
    },
    {
        type: DucklakeDataPathType.AZURE,
        url: 'az://example/data/',
        connectionString: 'synthetic',
    },
    { type: DucklakeDataPathType.LOCAL, path: '/tmp/data' },
];

describe('DuckLake connection availability', () => {
    describe.each(catalogs)('$type catalog', (catalog) => {
        it.each(paths)(
            'requires a dedicated instance for $type storage',
            (dataPath) => {
                const credentials: CreateDuckdbDucklakeCredentials = {
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.DUCKLAKE,
                    catalog,
                    dataPath,
                    schema: 'main',
                };
                expect(() =>
                    assertDucklakeConnectionAllowed(credentials, true),
                ).toThrow('DuckLake connections are not supported');
                expect(() =>
                    assertDucklakeConnectionAllowed(credentials, false),
                ).not.toThrow();
            },
        );
    });
    const unaffected: CreateWarehouseCredentials[] = [
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'example',
            schema: 'main',
            token: 'synthetic',
        },
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.ANALYTICS,
            database: 'memory',
            schema: 'main',
        },
        {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.EMBEDDED,
            dataset: 'jaffle-shop',
        },
        {
            type: WarehouseTypes.POSTGRES,
            host: 'example.invalid',
            port: 5432,
            dbname: 'example',
            user: 'user',
            password: 'synthetic',
            schema: 'public',
        },
    ];
    it.each(unaffected)(
        'leaves other credentials unchanged: $type',
        (credentials) => {
            expect(() =>
                assertDucklakeConnectionAllowed(credentials, true),
            ).not.toThrow();
        },
    );
});
