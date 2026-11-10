import {
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    sensitiveCredentialsFieldNames,
    WarehouseTypes,
    type CreateDucklakeCatalog,
    type CreateDucklakeDataPath,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { warehouseConnectionCredentials } from './warehouseConnectionFixtures.mock';

const secret = (name: string) => `__SECRET_${name}__`;
const catalogs: CreateDucklakeCatalog[] = [
    {
        type: DucklakeCatalogType.POSTGRES,
        host: 'host',
        port: 5432,
        database: 'catalog',
        user: secret('catalog_user'),
        password: secret('catalog_password'),
    },
    { type: DucklakeCatalogType.SQLITE, path: '/tmp/catalog.sqlite' },
    { type: DucklakeCatalogType.DUCKDB, path: '/tmp/catalog.duckdb' },
];
const dataPaths: CreateDucklakeDataPath[] = [
    {
        type: DucklakeDataPathType.S3,
        url: 's3://bucket',
        accessKeyId: secret('accessKeyId'),
        secretAccessKey: secret('secretAccessKey'),
    },
    {
        type: DucklakeDataPathType.GCS,
        url: 'gs://bucket',
        hmacKeyId: secret('hmacKeyId'),
        hmacSecret: secret('hmacSecret'),
    },
    {
        type: DucklakeDataPathType.AZURE,
        url: 'az://container',
        connectionString: secret('connectionString'),
        accountKey: secret('accountKey'),
    },
    { type: DucklakeDataPathType.LOCAL, path: '/tmp/data' },
];

export const credentialRedactionCases: {
    name: string;
    credentials: CreateWarehouseCredentials;
}[] = [
    ...Object.values(warehouseConnectionCredentials).map((credentials) => ({
        name: credentials.type,
        credentials: {
            ...credentials,
            ...Object.fromEntries(
                sensitiveCredentialsFieldNames.map((field) => [
                    field,
                    secret(field),
                ]),
            ),
        } as CreateWarehouseCredentials,
    })),
    ...catalogs.flatMap((catalog) =>
        dataPaths.map((dataPath) => ({
            name: `ducklake/${catalog.type}/${dataPath.type}`,
            credentials: {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.DUCKLAKE,
                schema: 'main',
                catalog,
                dataPath,
            } as CreateWarehouseCredentials,
        })),
    ),
];
