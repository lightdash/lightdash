import { BigqueryAuthenticationType, WarehouseTypes } from '@lightdash/common';

import type {
    CreateBigqueryCredentials,
    CreateDatabricksCredentials,
    CreatePostgresCredentials,
    CreateRedshiftCredentials,
    CreateSnowflakeCredentials,
    CreateTrinoCredentials,
} from '@lightdash/common';

// https://github.com/lightdash/lightdash/blob/427088ec09485f334f463b6026025d4287ad302b/packages/backend/src/models/ProjectModel/ProjectModel.ts#L156
// only undefined and empty string are considered empty values

export const BigQueryDefaultValues: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    dataset: '',
    project: '',
    location: '',
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    // @ts-expect-error we need to set it as empty string to avoid overwritting saved value
    keyfileContents: '', // Not needed for sso, we will load the refresh token from the user in the backend
    executionProject: '',
    timeoutSeconds: 300,
    priority: 'interactive',
    retries: 3,
    maximumBytesBilled: 1000000000,
    // we need to set it as undefined to avoid overwritting saved value
    startOfWeek: undefined,
};

const DatabricksDefaultValues: CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: '',
    serverHostName: '',
    httpPath: '',
    personalAccessToken: '',
    catalog: '',
    compute: [],
    startOfWeek: undefined,
};

export const PostgresDefaultValues: CreatePostgresCredentials = {
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
    sslcert: '',
    sslkey: '',
    sslrootcert: '',
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
    startOfWeek: undefined,
};

export const RedshiftDefaultValues: CreateRedshiftCredentials = {
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
    ra3Node: false,
    timeoutSeconds: 300,
    useSshTunnel: false,
    sshTunnelHost: '',
    sshTunnelPort: 22,
    sshTunnelUser: '',
    sshTunnelPublicKey: '',
    startOfWeek: undefined,
};

export const SnowflakeDefaultValues: CreateSnowflakeCredentials = {
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
    clientSessionKeepAlive: false,
    queryTag: '',
    accessUrl: '',
    startOfWeek: undefined,
    authenticationType: undefined,
    privateKey: '',
    privateKeyPass: '',
};

export const TrinoDefaultValues: CreateTrinoCredentials = {
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

export const warehouseDefaultValues = {
    [WarehouseTypes.BIGQUERY]: BigQueryDefaultValues,
    [WarehouseTypes.POSTGRES]: PostgresDefaultValues,
    [WarehouseTypes.REDSHIFT]: RedshiftDefaultValues,
    [WarehouseTypes.SNOWFLAKE]: SnowflakeDefaultValues,
    [WarehouseTypes.DATABRICKS]: DatabricksDefaultValues,
    [WarehouseTypes.TRINO]: TrinoDefaultValues,
};
