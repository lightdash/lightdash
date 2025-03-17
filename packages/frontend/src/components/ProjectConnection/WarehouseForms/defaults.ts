import { WarehouseTypes } from '@lightdash/common';

import type {
    CreateBigqueryCredentials,
    CreateDatabricksCredentials,
    CreatePostgresCredentials,
    CreateRedshiftCredentials,
    CreateSnowflakeCredentials,
    CreateTrinoCredentials,
} from '@lightdash/common';

export const BigQueryDefaultValues: Partial<CreateBigqueryCredentials> = {
    type: WarehouseTypes.BIGQUERY,
    dataset: '',
    project: '',
    location: '',
    // @ts-expect-error
    keyfileContents: null,
    executionProject: undefined,
    timeoutSeconds: 300,
    priority: 'interactive',
    retries: 3,
    maximumBytesBilled: 1000000000,
    startOfWeek: null,
} as const;

export const DatabricksDefaultValues: Partial<CreateDatabricksCredentials> = {
    type: WarehouseTypes.DATABRICKS,
    database: '',
    serverHostName: '',
    httpPath: '',
    personalAccessToken: '',
    catalog: '',
    compute: [],
    startOfWeek: null,
} as const;

export const PostgresDefaultValues: Partial<CreatePostgresCredentials> = {
    type: WarehouseTypes.POSTGRES,
    schema: '',
    host: '',
    user: '',
    password: '',
    dbname: '',
    requireUserCredentials: false,
    port: 5432,
    keepalivesIdle: 0,
    searchPath: '',
    sslmode: 'prefer',
    sslcert: null,
    sslkey: null,
    sslrootcert: null,
    sslcertFileName: '',
    sslkeyFileName: '',
    sslrootcertFileName: '',
    role: '',
    timeoutSeconds: 300,
    useSshTunnel: false,
    sshTunnelHost: '',
    sshTunnelPort: 22,
    sshTunnelUser: '',
    sshTunnelPublicKey: '',
    startOfWeek: null,
} as const;

export const RedshiftDefaultValues: Partial<CreateRedshiftCredentials> = {
    type: WarehouseTypes.REDSHIFT,
    schema: '',
    host: '',
    user: '',
    password: '',
    dbname: '',
    requireUserCredentials: false,
    port: 5439,
    keepalivesIdle: 0,
    sslmode: 'prefer',
    ra3Node: true, // confirm
    timeoutSeconds: 300,
    useSshTunnel: false, // confirm
    sshTunnelHost: '',
    sshTunnelPort: 22,
    sshTunnelUser: '',
    sshTunnelPublicKey: '',
    startOfWeek: null,
} as const;

export const SnowflakeDefaultValues: Partial<CreateSnowflakeCredentials> = {
    type: WarehouseTypes.SNOWFLAKE,
    schema: '',
    account: '',
    user: '',
    password: '',
    role: '',
    database: '',
    warehouse: '',
    override: false,
    requireUserCredentials: false,
    clientSessionKeepAlive: false, // confirm
    queryTag: '',
    accessUrl: '',
    startOfWeek: null,
} as const;

export const TrinoDefaultValues: Partial<CreateTrinoCredentials> = {
    type: WarehouseTypes.TRINO,
    schema: '',
    host: '',
    user: '',
    password: '',
    requireUserCredentials: false,
    port: 443,
    dbname: '',
    http_scheme: 'https',
};

export const WarehouseDefaultValues = {
    [WarehouseTypes.BIGQUERY]: BigQueryDefaultValues,
    [WarehouseTypes.POSTGRES]: PostgresDefaultValues,
    [WarehouseTypes.REDSHIFT]: RedshiftDefaultValues,
    [WarehouseTypes.SNOWFLAKE]: SnowflakeDefaultValues,
    [WarehouseTypes.DATABRICKS]: DatabricksDefaultValues,
    [WarehouseTypes.TRINO]: TrinoDefaultValues,
} as const;
