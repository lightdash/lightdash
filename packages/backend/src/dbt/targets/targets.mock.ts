import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateDucklakeCatalog,
    type CreateDucklakeDataPath,
    type CreateWarehouseCredentials,
} from '@lightdash/common';

export interface TargetCase {
    name: string;
    credentials: CreateWarehouseCredentials;
    target: Record<string, unknown>;
    environment: Record<string, string>;
    ambientMode: string | null;
}

const ref = (name: string) =>
    `{{ env_var('LIGHTDASH_DBT_PROFILE_VAR_${name}') }}`;
const loginEnvironment = {
    LIGHTDASH_DBT_PROFILE_VAR_USER: 'warehouse-user',
    LIGHTDASH_DBT_PROFILE_VAR_PASSWORD: 'warehouse-password',
};
export const bigqueryAdc: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.ADC,
    project: 'billing-project',
    dataset: 'analytics',
    keyfileContents: {},
    timeoutSeconds: 120,
    priority: 'batch',
    retries: 3,
    location: 'EU',
    maximumBytesBilled: 12345,
    executionProject: 'execution-project',
    threads: 9,
};
export const bigqueryAdcTarget = {
    type: 'bigquery',
    project: 'billing-project',
    dataset: 'analytics',
    threads: 1,
    timeout_seconds: 120,
    priority: 'batch',
    retries: 3,
    maximum_bytes_billed: 12345,
    execution_project: 'execution-project',
    method: 'oauth',
};
const bigqueryKeyfile = {
    type: 'service_account',
    project_id: 'key-project',
    private_key: 'private-key',
    client_email: 'robot@example.test',
    token_uri: 'https://untrusted.example/token',
    unexpected: 'must-not-escape',
};
const bigqueryKeyTarget = {
    ...bigqueryAdcTarget,
    method: 'service-account-json',
    keyfile_json: {
        type: ref('TYPE'),
        project_id: ref('PROJECT_ID'),
        private_key: ref('PRIVATE_KEY'),
        client_email: ref('CLIENT_EMAIL'),
        token_uri: ref('TOKEN_URI'),
    },
};
const bigqueryKeyEnvironment = {
    LIGHTDASH_DBT_PROFILE_VAR_TYPE: 'service_account',
    LIGHTDASH_DBT_PROFILE_VAR_PROJECT_ID: 'key-project',
    LIGHTDASH_DBT_PROFILE_VAR_PRIVATE_KEY: 'private-key',
    LIGHTDASH_DBT_PROFILE_VAR_CLIENT_EMAIL: 'robot@example.test',
    LIGHTDASH_DBT_PROFILE_VAR_TOKEN_URI: 'https://oauth2.googleapis.com/token',
};
const postgres = {
    host: 'db.example.test',
    port: 5432,
    dbname: 'warehouse',
    schema: 'analytics',
    user: 'warehouse-user',
    password: 'warehouse-password',
    threads: 8,
    keepalivesIdle: 15,
    sslmode: 'verify-full',
};
const postgresTarget = {
    type: 'postgres',
    host: 'db.example.test',
    port: 5432,
    dbname: 'warehouse',
    schema: 'analytics',
    user: ref('USER'),
    password: ref('PASSWORD'),
    threads: 1,
    keepalives_idle: 15,
    sslmode: 'verify-full',
};
const redshift = {
    ...postgres,
    type: WarehouseTypes.REDSHIFT as const,
    region: 'eu-west-1',
    clusterIdentifier: 'cluster',
    ra3Node: false,
    autoCreate: true,
    dbGroups: ['readers'],
};
const redshiftTarget = {
    ...postgresTarget,
    type: 'redshift',
    ra3_node: true,
    sslrootcert:
        require.resolve('@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-redshift.crt'),
};
const {
    user: unusedUser,
    password: unusedPassword,
    ...redshiftIamBase
} = redshiftTarget;
const redshiftIamTarget = {
    ...redshiftIamBase,
    method: 'iam',
    region: 'eu-west-1',
    cluster_id: 'cluster',
    user: 'warehouse-user',
    autocreate: true,
    db_groups: ['readers'],
};
const snowflake = {
    type: WarehouseTypes.SNOWFLAKE as const,
    account: 'account',
    user: 'warehouse-user',
    database: 'warehouse',
    warehouse: 'compute',
    schema: 'analytics',
    role: 'reader',
    threads: 8,
    clientSessionKeepAlive: false,
    queryTag: 'dbt-test',
};
const snowflakeTarget = {
    type: 'snowflake',
    account: 'account',
    user: ref('USER'),
    password: ref('PASSWORD'),
    database: 'warehouse',
    warehouse: 'compute',
    schema: 'analytics',
    role: 'reader',
    threads: 1,
    client_session_keep_alive: false,
    query_tag: 'dbt-test',
};
const databricks = {
    type: WarehouseTypes.DATABRICKS as const,
    catalog: 'catalog',
    database: 'analytics',
    serverHostName: 'workspace.example.test',
    httpPath: '/sql/endpoint',
};
const databricksTarget = {
    type: 'databricks',
    catalog: 'catalog',
    schema: 'analytics',
    host: 'workspace.example.test',
    http_path: '/sql/endpoint',
    token: ref('TOKEN'),
};
const athena = {
    type: WarehouseTypes.ATHENA as const,
    region: 'eu-west-1',
    database: 'catalog',
    schema: 'analytics',
    s3StagingDir: 's3://staging/',
    s3DataDir: 's3://data/',
    workGroup: 'workgroup',
    threads: 4,
    numRetries: 2,
    assumeRoleArn: 'arn:aws:iam::123456789012:role/query',
    assumeRoleExternalId: 'external-id',
    sessionToken: 'ignored-session-token',
};
const athenaTarget = {
    type: 'athena',
    region_name: 'eu-west-1',
    database: 'catalog',
    schema: 'analytics',
    s3_staging_dir: 's3://staging/',
    s3_data_dir: 's3://data/',
    work_group: 'workgroup',
    threads: 4,
    num_retries: 2,
};

export const warehouseTargetCases: TargetCase[] = [
    ...[BigqueryAuthenticationType.PRIVATE_KEY, undefined].map(
        (authenticationType): TargetCase => ({
            name: `BigQuery ${authenticationType ?? 'undefined'}`,
            credentials: {
                ...bigqueryAdc,
                authenticationType,
                keyfileContents: bigqueryKeyfile,
            },
            target: bigqueryKeyTarget,
            environment: bigqueryKeyEnvironment,
            ambientMode: null,
        }),
    ),
    {
        name: 'BigQuery resolved SSO',
        credentials: {
            ...bigqueryAdc,
            authenticationType: BigqueryAuthenticationType.SSO,
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'client-id',
                client_secret: 'client-secret',
                refresh_token: 'refresh-token',
            },
        },
        target: {
            ...bigqueryAdcTarget,
            method: 'service-account-json',
            keyfile_json: {
                type: ref('TYPE'),
                client_id: ref('CLIENT_ID'),
                client_secret: ref('CLIENT_SECRET'),
                refresh_token: ref('REFRESH_TOKEN'),
            },
        },
        environment: {
            LIGHTDASH_DBT_PROFILE_VAR_TYPE: 'authorized_user',
            LIGHTDASH_DBT_PROFILE_VAR_CLIENT_ID: 'client-id',
            LIGHTDASH_DBT_PROFILE_VAR_CLIENT_SECRET: 'client-secret',
            LIGHTDASH_DBT_PROFILE_VAR_REFRESH_TOKEN: 'refresh-token',
        },
        ambientMode: null,
    },
    {
        name: 'BigQuery ADC',
        credentials: bigqueryAdc,
        target: bigqueryAdcTarget,
        environment: {},
        ambientMode: 'BigQuery Application Default Credentials',
    },
    {
        name: 'Postgres password',
        credentials: {
            ...postgres,
            type: WarehouseTypes.POSTGRES,
            searchPath: 'public,analytics',
            role: 'reader',
        },
        target: {
            ...postgresTarget,
            search_path: 'public,analytics',
            role: 'reader',
        },
        environment: loginEnvironment,
        ambientMode: null,
    },
    {
        name: 'Postgres RDS CA',
        credentials: {
            ...postgres,
            type: WarehouseTypes.POSTGRES,
            host: 'cluster.rds.amazonaws.com',
        },
        target: {
            ...postgresTarget,
            host: 'cluster.rds.amazonaws.com',
            sslrootcert:
                require.resolve('@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-rds-global.pem'),
        },
        environment: loginEnvironment,
        ambientMode: null,
    },
    {
        name: 'Redshift password',
        credentials: {
            ...redshift,
            authenticationType: RedshiftAuthenticationType.PASSWORD,
        },
        target: redshiftTarget,
        environment: loginEnvironment,
        ambientMode: null,
    },
    {
        name: 'Redshift IAM with keys',
        credentials: {
            ...redshift,
            authenticationType: RedshiftAuthenticationType.IAM,
            accessKeyId: 'aws-key',
            secretAccessKey: 'aws-secret',
        },
        target: redshiftIamTarget,
        environment: {
            AWS_ACCESS_KEY_ID: 'aws-key',
            AWS_SECRET_ACCESS_KEY: 'aws-secret',
        },
        ambientMode: null,
    },
    {
        name: 'Redshift IAM with session keys',
        credentials: {
            ...redshift,
            authenticationType: RedshiftAuthenticationType.IAM,
            accessKeyId: 'aws-key',
            secretAccessKey: 'aws-secret',
            sessionToken: 'aws-session',
            assumeRoleArn: 'arn:aws:iam::123456789012:role/query',
        },
        target: redshiftIamTarget,
        environment: {
            AWS_ACCESS_KEY_ID: 'aws-key',
            AWS_SECRET_ACCESS_KEY: 'aws-secret',
            AWS_SESSION_TOKEN: 'aws-session',
        },
        ambientMode: null,
    },
    {
        name: 'Redshift IAM without keys',
        credentials: {
            ...redshift,
            authenticationType: RedshiftAuthenticationType.IAM,
        },
        target: redshiftIamTarget,
        environment: {},
        ambientMode: 'Redshift IAM',
    },
    {
        name: 'Redshift IAM_BROWSER without keys',
        credentials: {
            ...redshift,
            authenticationType: RedshiftAuthenticationType.IAM_BROWSER,
        },
        target: redshiftIamTarget,
        environment: {},
        ambientMode: 'Redshift IAM',
    },
    {
        name: 'Redshift IAM_BROWSER resolved keys',
        credentials: {
            ...redshift,
            authenticationType: RedshiftAuthenticationType.IAM_BROWSER,
            accessKeyId: 'aws-key',
            secretAccessKey: 'aws-secret',
            sessionToken: 'aws-session',
        },
        target: redshiftIamTarget,
        environment: {
            AWS_ACCESS_KEY_ID: 'aws-key',
            AWS_SECRET_ACCESS_KEY: 'aws-secret',
            AWS_SESSION_TOKEN: 'aws-session',
        },
        ambientMode: null,
    },
    {
        name: 'Redshift serverless IAM',
        credentials: {
            ...redshift,
            authenticationType: RedshiftAuthenticationType.IAM,
            isServerless: true,
            user: '',
            autoCreate: false,
            dbGroups: [],
        },
        target: {
            ...redshiftIamBase,
            method: 'iam',
            region: 'eu-west-1',
            user: 'iam',
        },
        environment: {},
        ambientMode: 'Redshift IAM',
    },
    {
        name: 'Trino LDAP',
        credentials: {
            ...postgres,
            type: WarehouseTypes.TRINO,
            http_scheme: 'https',
        },
        target: {
            type: 'trino',
            host: 'db.example.test',
            port: 5432,
            database: 'warehouse',
            schema: 'analytics',
            method: 'ldap',
            http_scheme: 'https',
            user: ref('USER'),
            password: ref('PASSWORD'),
        },
        environment: loginEnvironment,
        ambientMode: null,
    },
    {
        name: 'Snowflake password',
        credentials: {
            ...snowflake,
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
            password: 'warehouse-password',
        },
        target: snowflakeTarget,
        environment: loginEnvironment,
        ambientMode: null,
    },
    ...[false, true].map(
        (encrypted): TargetCase => ({
            name: `Snowflake private key${encrypted ? ' with passphrase' : ''}`,
            credentials: {
                ...snowflake,
                authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                privateKey: 'snowflake-key',
                ...(encrypted ? { privateKeyPass: 'passphrase' } : {}),
            },
            target: {
                ...snowflakeTarget,
                private_key: ref('PRIVATEKEY'),
                ...(encrypted
                    ? { private_key_passphrase: ref('PRIVATEKEYPASS') }
                    : {}),
            },
            environment: {
                LIGHTDASH_DBT_PROFILE_VAR_USER: 'warehouse-user',
                LIGHTDASH_DBT_PROFILE_VAR_PRIVATEKEY: 'snowflake-key',
                ...(encrypted
                    ? { LIGHTDASH_DBT_PROFILE_VAR_PRIVATEKEYPASS: 'passphrase' }
                    : {}),
            },
            ambientMode: null,
        }),
    ),
    {
        name: 'Snowflake resolved SSO',
        credentials: {
            ...snowflake,
            authenticationType: SnowflakeAuthenticationType.SSO,
            token: 'resolved-token',
        },
        target: snowflakeTarget,
        environment: { LIGHTDASH_DBT_PROFILE_VAR_USER: 'warehouse-user' },
        ambientMode: null,
    },
    {
        name: 'Databricks PAT',
        credentials: { ...databricks, personalAccessToken: 'pat' },
        target: databricksTarget,
        environment: { LIGHTDASH_DBT_PROFILE_VAR_TOKEN: 'pat' },
        ambientMode: null,
    },
    ...[
        DatabricksAuthenticationType.OAUTH_M2M,
        DatabricksAuthenticationType.OAUTH_U2M,
    ].map(
        (authenticationType): TargetCase => ({
            name: `Databricks ${authenticationType}`,
            credentials: {
                ...databricks,
                authenticationType,
                token: 'oauth-token',
            },
            target: databricksTarget,
            environment: { LIGHTDASH_DBT_PROFILE_VAR_TOKEN: 'oauth-token' },
            ambientMode: null,
        }),
    ),
    {
        name: 'Databricks PAT takes precedence over OAuth token',
        credentials: {
            ...databricks,
            personalAccessToken: 'pat',
            token: 'oauth-token',
        },
        target: databricksTarget,
        environment: { LIGHTDASH_DBT_PROFILE_VAR_TOKEN: 'pat' },
        ambientMode: null,
    },
    {
        name: 'ClickHouse password',
        credentials: {
            type: WarehouseTypes.CLICKHOUSE,
            host: 'clickhouse.example.test',
            port: 8443,
            schema: 'analytics',
            user: 'warehouse-user',
            password: 'warehouse-password',
            secure: true,
        },
        target: {
            type: 'clickhouse',
            host: 'clickhouse.example.test',
            port: 8443,
            schema: 'analytics',
            user: ref('USER'),
            password: ref('PASSWORD'),
            secure: true,
        },
        environment: loginEnvironment,
        ambientMode: null,
    },
    {
        name: 'MotherDuck token',
        credentials: {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'warehouse',
            schema: 'analytics',
            token: 'motherduck-token',
            threads: 4,
        },
        target: {
            type: 'duckdb',
            path: 'md:warehouse',
            schema: 'analytics',
            threads: 4,
            extensions: ['motherduck'],
            settings: { motherduck_token: ref('TOKEN') },
        },
        environment: { LIGHTDASH_DBT_PROFILE_VAR_TOKEN: 'motherduck-token' },
        ambientMode: null,
    },
    ...[AthenaAuthenticationType.ACCESS_KEY, undefined].map(
        (authenticationType): TargetCase => ({
            name: `Athena ${authenticationType ?? 'undefined'}`,
            credentials: {
                ...athena,
                authenticationType,
                accessKeyId: 'athena-key',
                secretAccessKey: 'athena-secret',
            },
            target: {
                ...athenaTarget,
                aws_assume_role_arn: 'arn:aws:iam::123456789012:role/query',
                aws_assume_role_external_id: 'external-id',
                aws_access_key_id: ref('ACCESSKEYID'),
                aws_secret_access_key: ref('SECRETACCESSKEY'),
            },
            environment: {
                LIGHTDASH_DBT_PROFILE_VAR_ACCESSKEYID: 'athena-key',
                LIGHTDASH_DBT_PROFILE_VAR_SECRETACCESSKEY: 'athena-secret',
            },
            ambientMode: null,
        }),
    ),
    {
        name: 'Athena IAM_ROLE',
        credentials: {
            ...athena,
            authenticationType: AthenaAuthenticationType.IAM_ROLE,
        },
        target: {
            ...athenaTarget,
            aws_assume_role_arn: 'arn:aws:iam::123456789012:role/query',
            aws_assume_role_external_id: 'external-id',
        },
        environment: {},
        ambientMode: 'Athena IAM_ROLE',
    },
    {
        name: 'Athena WEB_IDENTITY',
        credentials: {
            ...athena,
            authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
        },
        target: athenaTarget,
        environment: {},
        ambientMode: 'Athena WEB_IDENTITY',
    },
];

interface DataPathCase {
    name: string;
    dataPath: CreateDucklakeDataPath;
    path: string;
    extensions: string[];
    secrets: Record<string, unknown>[];
    environment: Record<string, string>;
    ambientMode: string | null;
}
const dataPaths: DataPathCase[] = [
    {
        name: 'local',
        dataPath: { type: DucklakeDataPathType.LOCAL, path: '/data/lake' },
        path: '/data/lake',
        extensions: [],
        secrets: [],
        environment: {},
        ambientMode: null,
    },
    {
        name: 'S3 with keys',
        dataPath: {
            type: DucklakeDataPathType.S3,
            url: 's3://lake/',
            region: 'eu-west-1',
            endpoint: 's3.example.test',
            forcePathStyle: true,
            useSsl: false,
            accessKeyId: 's3-key',
            secretAccessKey: 's3-secret',
        },
        path: 's3://lake/',
        extensions: ['httpfs'],
        secrets: [
            {
                name: 'ld_ducklake_data',
                type: 's3',
                scope: 's3://lake/',
                region: 'eu-west-1',
                endpoint: 's3.example.test',
                url_style: 'path',
                use_ssl: false,
                key_id: ref('S3_KEY'),
                secret: ref('S3_SECRET'),
            },
        ],
        environment: {
            LIGHTDASH_DBT_PROFILE_VAR_S3_KEY: 's3-key',
            LIGHTDASH_DBT_PROFILE_VAR_S3_SECRET: 's3-secret',
        },
        ambientMode: null,
    },
    {
        name: 'S3 without keys',
        dataPath: {
            type: DucklakeDataPathType.S3,
            url: 's3://lake/',
            forcePathStyle: false,
            useSsl: true,
        },
        path: 's3://lake/',
        extensions: ['httpfs'],
        secrets: [
            {
                name: 'ld_ducklake_data',
                type: 's3',
                scope: 's3://lake/',
                url_style: 'vhost',
                use_ssl: true,
                provider: 'credential_chain',
            },
        ],
        environment: {},
        ambientMode: 'DuckLake S3',
    },
    {
        name: 'GCS with HMAC keys',
        dataPath: {
            type: DucklakeDataPathType.GCS,
            url: 'gs://lake/',
            hmacKeyId: 'gcs-key',
            hmacSecret: 'gcs-secret',
        },
        path: 'gs://lake/',
        extensions: ['httpfs'],
        secrets: [
            {
                name: 'ld_ducklake_data',
                type: 'gcs',
                scope: 'gs://lake/',
                key_id: ref('GCS_KEY'),
                secret: ref('GCS_SECRET'),
            },
        ],
        environment: {
            LIGHTDASH_DBT_PROFILE_VAR_GCS_KEY: 'gcs-key',
            LIGHTDASH_DBT_PROFILE_VAR_GCS_SECRET: 'gcs-secret',
        },
        ambientMode: null,
    },
    {
        name: 'GCS without keys',
        dataPath: { type: DucklakeDataPathType.GCS, url: 'gs://lake/' },
        path: 'gs://lake/',
        extensions: ['httpfs'],
        secrets: [
            {
                name: 'ld_ducklake_data',
                type: 'gcs',
                scope: 'gs://lake/',
                provider: 'credential_chain',
            },
        ],
        environment: {},
        ambientMode: 'DuckLake GCS',
    },
    {
        name: 'Azure connection string',
        dataPath: {
            type: DucklakeDataPathType.AZURE,
            url: 'az://lake/',
            connectionString: 'azure-connection',
            accountName: 'ignored-account',
            accountKey: 'ignored-key',
        },
        path: 'az://lake/',
        extensions: ['azure'],
        secrets: [
            {
                name: 'ld_ducklake_data',
                type: 'azure',
                scope: 'az://lake/',
                connection_string: ref('AZURE_CONNECTION_STRING'),
            },
        ],
        environment: {
            LIGHTDASH_DBT_PROFILE_VAR_AZURE_CONNECTION_STRING:
                'azure-connection',
        },
        ambientMode: null,
    },
    {
        name: 'Azure account key',
        dataPath: {
            type: DucklakeDataPathType.AZURE,
            url: 'az://lake/',
            accountName: 'azure-account',
            accountKey: 'azure-key',
        },
        path: 'az://lake/',
        extensions: ['azure'],
        secrets: [
            {
                name: 'ld_ducklake_data',
                type: 'azure',
                scope: 'az://lake/',
                account_name: 'azure-account',
                account_key: ref('AZURE_ACCOUNT_KEY'),
            },
        ],
        environment: {
            LIGHTDASH_DBT_PROFILE_VAR_AZURE_ACCOUNT_KEY: 'azure-key',
        },
        ambientMode: null,
    },
    {
        name: 'Azure account without key',
        dataPath: {
            type: DucklakeDataPathType.AZURE,
            url: 'az://lake/',
            accountName: 'azure-account',
        },
        path: 'az://lake/',
        extensions: ['azure'],
        secrets: [
            {
                name: 'ld_ducklake_data',
                type: 'azure',
                scope: 'az://lake/',
                account_name: 'azure-account',
                provider: 'credential_chain',
            },
        ],
        environment: {},
        ambientMode: 'DuckLake Azure',
    },
    {
        name: 'Azure without account or secrets',
        dataPath: { type: DucklakeDataPathType.AZURE, url: 'az://lake/' },
        path: 'az://lake/',
        extensions: ['azure'],
        secrets: [
            { name: 'ld_ducklake_data', type: 'azure', scope: 'az://lake/' },
        ],
        environment: {},
        ambientMode: 'DuckLake Azure',
    },
];
interface CatalogCase {
    catalog: CreateDucklakeCatalog;
    extensions: string[];
    path: string;
    secrets: Record<string, unknown>[];
    environment: Record<string, string>;
}
const catalogs: CatalogCase[] = [
    {
        catalog: {
            type: DucklakeCatalogType.POSTGRES,
            host: 'catalog.example.test',
            port: 5433,
            database: 'metadata',
            user: 'catalog-user',
            password: 'catalog-password',
        },
        extensions: ['postgres'],
        path: 'ducklake:ld_ducklake',
        secrets: [
            {
                name: 'ld_ducklake_catalog',
                type: 'postgres',
                host: 'catalog.example.test',
                port: 5433,
                database: 'metadata',
                user: ref('CATALOG_USER'),
                password: ref('CATALOG_PASSWORD'),
            },
        ],
        environment: {
            LIGHTDASH_DBT_PROFILE_VAR_CATALOG_USER: 'catalog-user',
            LIGHTDASH_DBT_PROFILE_VAR_CATALOG_PASSWORD: 'catalog-password',
        },
    },
    {
        catalog: { type: DucklakeCatalogType.SQLITE, path: '/catalog.sqlite' },
        extensions: ['sqlite'],
        path: 'ducklake:sqlite:/catalog.sqlite',
        secrets: [],
        environment: {},
    },
    {
        catalog: { type: DucklakeCatalogType.DUCKDB, path: '/catalog.duckdb' },
        extensions: [],
        path: 'ducklake:/catalog.duckdb',
        secrets: [],
        environment: {},
    },
];
export const ducklakeTargetCases: TargetCase[] = catalogs.flatMap((catalog) =>
    dataPaths.map((data): TargetCase => {
        const postgresCatalog =
            catalog.catalog.type === DucklakeCatalogType.POSTGRES;
        const secrets = [
            ...catalog.secrets,
            ...data.secrets,
            ...(postgresCatalog
                ? [
                      {
                          name: 'ld_ducklake',
                          type: 'ducklake',
                          metadata_path: '',
                          data_path: data.path,
                          metadata_parameters: {
                              TYPE: 'postgres',
                              SECRET: 'ld_ducklake_catalog',
                          },
                      },
                  ]
                : []),
        ];
        return {
            name: `DuckLake ${catalog.catalog.type} / ${data.name}`,
            credentials: {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.DUCKLAKE,
                catalog: catalog.catalog,
                dataPath: data.dataPath,
                schema: 'analytics',
                catalogAlias: 'lake_alias',
                threads: 3,
            },
            target: {
                type: 'duckdb',
                path: ':memory:',
                database: 'lake_alias',
                schema: 'analytics',
                threads: 3,
                extensions: [
                    'ducklake',
                    ...catalog.extensions,
                    ...data.extensions,
                ],
                settings: {
                    autoinstall_known_extensions: true,
                    autoload_known_extensions: true,
                },
                attach: [
                    {
                        alias: 'lake_alias',
                        ...(!postgresCatalog
                            ? { options: { data_path: data.path } }
                            : {}),
                        path: catalog.path,
                    },
                ],
                ...(secrets.length ? { secrets } : {}),
            },
            environment: { ...catalog.environment, ...data.environment },
            ambientMode: data.ambientMode,
        };
    }),
);
export const targetCases = [...warehouseTargetCases, ...ducklakeTargetCases];
