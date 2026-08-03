import {
    DbtProjectType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
} from '@lightdash/common';
import {
    hasSameDbtCredentialDestination,
    hasSameWarehouseCredentialDestination,
    normalizeCredentialUrlOrigin,
} from './credentialDestination';

const postgres: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'db.example.com',
    port: 5432,
    user: 'user',
    password: 'password',
    dbname: 'database',
    schema: 'public',
};

const redshift: CreateWarehouseCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'cluster.example.com',
    port: 5439,
    user: 'user',
    password: 'password',
    dbname: 'database',
    schema: 'public',
};

const bigquery: CreateWarehouseCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'project',
    dataset: 'dataset',
    keyfileContents: { private_key: 'secret' },
    timeoutSeconds: 30,
    priority: 'interactive',
    retries: 3,
    location: 'US',
    maximumBytesBilled: undefined,
    accessUrl: 'https://bigquery.example.com/api',
};

const snowflake: CreateWarehouseCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'user',
    password: 'password',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'schema',
    accessUrl: 'https://snowflake.example.com/api',
};

const databricks: CreateWarehouseCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: 'database',
    serverHostName: 'workspace.example.com',
    httpPath: '/sql/warehouse',
    personalAccessToken: 'token',
};

const trino: CreateWarehouseCredentials = {
    type: WarehouseTypes.TRINO,
    host: 'trino.example.com',
    port: 8443,
    user: 'user',
    password: 'password',
    dbname: 'database',
    schema: 'schema',
    http_scheme: 'https',
};

const clickhouse: CreateWarehouseCredentials = {
    type: WarehouseTypes.CLICKHOUSE,
    host: 'clickhouse.example.com',
    port: 8443,
    user: 'user',
    password: 'password',
    schema: 'schema',
    secure: true,
};

const athena: CreateWarehouseCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'eu-west-1',
    database: 'database',
    schema: 'schema',
    s3StagingDir: 's3://results',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
};

const motherduck: CreateWarehouseCredentials = {
    type: WarehouseTypes.DUCKDB,
    connectionType: DuckdbConnectionType.MOTHERDUCK,
    database: 'database',
    schema: 'schema',
    token: 'token',
};

const ducklake: CreateWarehouseCredentials = {
    type: WarehouseTypes.DUCKDB,
    connectionType: DuckdbConnectionType.DUCKLAKE,
    catalog: {
        type: DucklakeCatalogType.POSTGRES,
        host: 'catalog.example.com',
        port: 5432,
        database: 'catalog',
        user: 'user',
        password: 'password',
    },
    dataPath: {
        type: DucklakeDataPathType.S3,
        url: 's3://bucket/Private',
        endpoint: 'https://storage.example.com/api',
        region: 'eu-west-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        forcePathStyle: false,
        useSsl: true,
    },
    schema: 'schema',
};

const warehouseDestinationChanges: Array<{
    name: string;
    before: CreateWarehouseCredentials;
    after: CreateWarehouseCredentials;
}> = [
    {
        name: 'BigQuery access URL path',
        before: bigquery,
        after: { ...bigquery, accessUrl: 'https://bigquery.example.com/other' },
    },
    {
        name: 'Postgres host',
        before: postgres,
        after: { ...postgres, host: 'attacker.example.com' },
    },
    {
        name: 'Postgres port',
        before: postgres,
        after: { ...postgres, port: 6432 },
    },
    {
        name: 'Redshift host',
        before: redshift,
        after: { ...redshift, host: 'attacker.example.com' },
    },
    {
        name: 'SSH tunnel activation',
        before: {
            ...postgres,
            useSshTunnel: false,
            sshTunnelHost: 'tunnel.example.com',
            sshTunnelPrivateKey: 'key',
        },
        after: {
            ...postgres,
            useSshTunnel: true,
            sshTunnelHost: 'tunnel.example.com',
            sshTunnelPrivateKey: undefined,
        },
    },
    {
        name: 'Snowflake account',
        before: snowflake,
        after: { ...snowflake, account: 'other-account' },
    },
    {
        name: 'Snowflake access URL path',
        before: snowflake,
        after: {
            ...snowflake,
            accessUrl: 'https://snowflake.example.com/other',
        },
    },
    {
        name: 'Databricks host',
        before: databricks,
        after: { ...databricks, serverHostName: 'attacker.example.com' },
    },
    {
        name: 'Trino scheme',
        before: trino,
        after: { ...trino, http_scheme: 'http' },
    },
    {
        name: 'ClickHouse transport security',
        before: clickhouse,
        after: { ...clickhouse, secure: false },
    },
    {
        name: 'Athena region',
        before: athena,
        after: { ...athena, region: 'us-east-1' },
    },
    {
        name: 'DuckDB connection type',
        before: motherduck,
        after: ducklake,
    },
    {
        name: 'DuckLake catalog host',
        before: ducklake,
        after: {
            ...ducklake,
            catalog: { ...ducklake.catalog, host: 'attacker.example.com' },
        } as CreateWarehouseCredentials,
    },
    {
        name: 'DuckLake S3 path case',
        before: ducklake,
        after: {
            ...ducklake,
            dataPath: { ...ducklake.dataPath, url: 's3://bucket/private' },
        } as CreateWarehouseCredentials,
    },
    {
        name: 'DuckLake S3 endpoint path',
        before: ducklake,
        after: {
            ...ducklake,
            dataPath: {
                ...ducklake.dataPath,
                endpoint: 'https://storage.example.com/other',
            },
        } as CreateWarehouseCredentials,
    },
    {
        name: 'DuckLake S3 URL style',
        before: ducklake,
        after: {
            ...ducklake,
            dataPath: { ...ducklake.dataPath, forcePathStyle: true },
        } as CreateWarehouseCredentials,
    },
    {
        name: 'DuckLake S3 transport security',
        before: ducklake,
        after: {
            ...ducklake,
            dataPath: { ...ducklake.dataPath, useSsl: false },
        } as CreateWarehouseCredentials,
    },
    {
        name: 'DuckLake GCS path case',
        before: {
            ...ducklake,
            dataPath: {
                type: DucklakeDataPathType.GCS,
                url: 'gs://bucket/Private',
                hmacKeyId: 'key',
                hmacSecret: 'secret',
            },
        } as CreateWarehouseCredentials,
        after: {
            ...ducklake,
            dataPath: {
                type: DucklakeDataPathType.GCS,
                url: 'gs://bucket/private',
            },
        } as CreateWarehouseCredentials,
    },
    {
        name: 'DuckLake Azure path case',
        before: {
            ...ducklake,
            dataPath: {
                type: DucklakeDataPathType.AZURE,
                url: 'az://container/Private',
                accountName: 'account',
                accountKey: 'secret',
            },
        } as CreateWarehouseCredentials,
        after: {
            ...ducklake,
            dataPath: {
                type: DucklakeDataPathType.AZURE,
                url: 'az://container/private',
                accountName: 'account',
            },
        } as CreateWarehouseCredentials,
    },
];

const dbtCloud: DbtProjectConfig = {
    type: DbtProjectType.DBT_CLOUD_IDE,
    environment_id: 'environment',
    api_key: 'key',
    discovery_api_endpoint: 'https://metadata.cloud.getdbt.com/graphql',
};

const github: DbtProjectConfig = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'personal_access_token',
    personal_access_token: 'token',
    repository: 'lightdash/lightdash',
    branch: 'main',
    project_sub_path: '/',
    host_domain: 'github.com',
};

const gitlab: DbtProjectConfig = {
    type: DbtProjectType.GITLAB,
    personal_access_token: 'token',
    repository: 'lightdash/lightdash',
    branch: 'main',
    project_sub_path: '/',
    host_domain: 'gitlab.com',
};

const bitbucket: DbtProjectConfig = {
    type: DbtProjectType.BITBUCKET,
    username: 'user',
    personal_access_token: 'token',
    repository: 'lightdash/lightdash',
    branch: 'main',
    project_sub_path: '/',
    host_domain: 'bitbucket.org',
};

describe('credential destinations', () => {
    test.each(warehouseDestinationChanges)(
        'detects a changed $name',
        ({ before, after }) => {
            expect(hasSameWarehouseCredentialDestination(after, before)).toBe(
                false,
            );
        },
    );

    test('ignores dormant SSH field edits while the tunnel is disabled', () => {
        expect(
            hasSameWarehouseCredentialDestination(
                {
                    ...postgres,
                    useSshTunnel: false,
                    sshTunnelHost: 'new-tunnel.example.com',
                },
                {
                    ...postgres,
                    useSshTunnel: false,
                    sshTunnelHost: 'old-tunnel.example.com',
                    sshTunnelPrivateKey: 'key',
                },
            ),
        ).toBe(true);
    });

    test('treats the implicit and explicit SSH port 22 as equivalent', () => {
        expect(
            hasSameWarehouseCredentialDestination(
                {
                    ...postgres,
                    useSshTunnel: true,
                    sshTunnelHost: 'tunnel.example.com',
                    sshTunnelPort: 22,
                },
                {
                    ...postgres,
                    useSshTunnel: true,
                    sshTunnelHost: 'tunnel.example.com',
                    sshTunnelPort: undefined,
                },
            ),
        ).toBe(true);
    });

    test('normalizes URL hostname case and a trailing DNS dot without dropping the path', () => {
        expect(
            hasSameWarehouseCredentialDestination(
                {
                    ...bigquery,
                    accessUrl: 'https://BIGQUERY.EXAMPLE.COM./api',
                },
                bigquery,
            ),
        ).toBe(true);
        expect(normalizeCredentialUrlOrigin('https://API.EXAMPLE.COM./')).toBe(
            'https://api.example.com',
        );
    });

    test('ignores DuckDB destinations that do not receive stored credentials', () => {
        expect(
            hasSameWarehouseCredentialDestination(
                { ...motherduck, database: 'other-database' },
                motherduck,
            ),
        ).toBe(true);
        expect(
            hasSameWarehouseCredentialDestination(
                {
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.EMBEDDED,
                    dataset: 'other.csv',
                },
                {
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.EMBEDDED,
                    dataset: 'data.csv',
                },
            ),
        ).toBe(true);
        expect(
            hasSameWarehouseCredentialDestination(
                {
                    ...ducklake,
                    catalog: {
                        type: DucklakeCatalogType.SQLITE,
                        path: 'other.sqlite',
                    },
                } as CreateWarehouseCredentials,
                {
                    ...ducklake,
                    catalog: {
                        type: DucklakeCatalogType.SQLITE,
                        path: 'catalog.sqlite',
                    },
                } as CreateWarehouseCredentials,
            ),
        ).toBe(true);
        expect(
            hasSameWarehouseCredentialDestination(
                {
                    ...ducklake,
                    catalog: {
                        type: DucklakeCatalogType.DUCKDB,
                        path: 'other.duckdb',
                    },
                } as CreateWarehouseCredentials,
                {
                    ...ducklake,
                    catalog: {
                        type: DucklakeCatalogType.DUCKDB,
                        path: 'catalog.duckdb',
                    },
                } as CreateWarehouseCredentials,
            ),
        ).toBe(true);
        expect(
            hasSameWarehouseCredentialDestination(
                {
                    ...ducklake,
                    dataPath: {
                        type: DucklakeDataPathType.LOCAL,
                        path: '/other',
                    },
                } as CreateWarehouseCredentials,
                {
                    ...ducklake,
                    dataPath: {
                        type: DucklakeDataPathType.LOCAL,
                        path: '/data',
                    },
                } as CreateWarehouseCredentials,
            ),
        ).toBe(true);
    });

    test.each([
        {
            name: 'dbt Cloud origin',
            before: dbtCloud,
            after: {
                ...dbtCloud,
                discovery_api_endpoint: 'https://attacker.example.com/graphql',
            } as DbtProjectConfig,
        },
        {
            name: 'GitHub host',
            before: github,
            after: {
                ...github,
                host_domain: 'attacker.example.com',
            } as DbtProjectConfig,
        },
        {
            name: 'GitLab host',
            before: gitlab,
            after: {
                ...gitlab,
                host_domain: 'attacker.example.com',
            } as DbtProjectConfig,
        },
        {
            name: 'Bitbucket host',
            before: bitbucket,
            after: {
                ...bitbucket,
                host_domain: 'attacker.example.com',
            } as DbtProjectConfig,
        },
    ])('detects a changed $name', ({ before, after }) => {
        expect(hasSameDbtCredentialDestination(after, before)).toBe(false);
    });

    test('uses effective dbt defaults and normalized hosts', () => {
        expect(
            hasSameDbtCredentialDestination(
                {
                    ...github,
                    host_domain: 'GITHUB.COM.',
                } as DbtProjectConfig,
                { ...github, host_domain: undefined } as DbtProjectConfig,
            ),
        ).toBe(true);
        expect(
            hasSameDbtCredentialDestination(
                {
                    ...dbtCloud,
                    discovery_api_endpoint:
                        'https://METADATA.CLOUD.GETDBT.COM./ignored',
                } as DbtProjectConfig,
                { ...dbtCloud, discovery_api_endpoint: undefined },
            ),
        ).toBe(true);
    });

    test.each<DbtProjectConfig>([
        {
            type: DbtProjectType.DBT,
            project_dir: '/dbt',
        },
        {
            type: DbtProjectType.AZURE_DEVOPS,
            personal_access_token: 'token',
            organization: 'organization',
            project: 'project',
            repository: 'repository',
            branch: 'main',
            project_sub_path: '/',
        },
        {
            type: DbtProjectType.NONE,
        },
        {
            type: DbtProjectType.MANIFEST,
            manifest: '{}',
            hideRefreshButton: false,
        },
    ])('keeps secrets for non-retargetable dbt type $type', (config) => {
        expect(hasSameDbtCredentialDestination(config, config)).toBe(true);
    });
});
