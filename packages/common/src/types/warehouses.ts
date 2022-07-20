import {
    SSHTunnelConfigIn,
    SSHTunnelConfigOut,
    SSHTunnelConfigSecrets,
} from './sshTunnels';

export enum WarehouseTypes {
    BIGQUERY = 'bigquery',
    POSTGRES = 'postgres',
    REDSHIFT = 'redshift',
    SNOWFLAKE = 'snowflake',
    DATABRICKS = 'databricks',
}

export type CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY;
    project: string;
    dataset: string;
    threads?: number;
    timeoutSeconds: number | undefined;
    priority: 'interactive' | 'batch' | undefined;
    keyfileContents: Record<string, string>;
    retries: number | undefined;
    location: string | undefined;
    maximumBytesBilled: number | undefined;
};
export const sensitiveCredentialsFieldNames = [
    'user',
    'password',
    'keyfileContents',
    'personalAccessToken',
] as const;
export type SensitiveCredentialsFieldNames =
    typeof sensitiveCredentialsFieldNames[number];
export type BigqueryCredentials = Omit<
    CreateBigqueryCredentials,
    SensitiveCredentialsFieldNames
>;
export type CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS;
    serverHostName: string;
    port: number;
    database: string;
    personalAccessToken: string;
    httpPath: string;
};
export type DatabricksCredentials = Omit<
    CreateDatabricksCredentials,
    SensitiveCredentialsFieldNames
>;
export type CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES;
    host: string;
    user: string;
    password: string;
    port: number;
    dbname: string;
    schema: string;
    threads?: number;
    keepalivesIdle?: number;
    searchPath?: string;
    role?: string;
    sslmode?: string;
    sshTunnel?: SSHTunnelConfigIn;
};
export type FullPostgresCredentials = CreatePostgresCredentials & {
    sshTunnel?: SSHTunnelConfigSecrets;
};
export type PostgresCredentials = Omit<
    CreatePostgresCredentials,
    SensitiveCredentialsFieldNames
> & {
    sshTunnel?: SSHTunnelConfigOut;
};
export type CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT;
    host: string;
    user: string;
    password: string;
    port: number;
    dbname: string;
    schema: string;
    threads?: number;
    keepalivesIdle?: number;
    sslmode?: string;
    ra3Node?: boolean;
    sshTunnel?: SSHTunnelConfigIn;
};
export type FullRedshiftCredentials = CreateRedshiftCredentials & {
    sshTunnel?: SSHTunnelConfigSecrets;
};
export type RedshiftCredentials = Omit<
    CreateRedshiftCredentials,
    SensitiveCredentialsFieldNames
> & {
    sshTunnel?: SSHTunnelConfigOut;
};
export type CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE;
    account: string;
    user: string;
    password: string;
    role: string;
    database: string;
    warehouse: string;
    schema: string;
    threads?: number;
    clientSessionKeepAlive?: boolean;
    queryTag?: string;
};
export type SnowflakeCredentials = Omit<
    CreateSnowflakeCredentials,
    SensitiveCredentialsFieldNames
>;
export type CreateWarehouseCredentials =
    | CreateRedshiftCredentials
    | CreateBigqueryCredentials
    | CreatePostgresCredentials
    | CreateSnowflakeCredentials
    | CreateDatabricksCredentials;

export type FullWarehouseCredentials =
    | FullRedshiftCredentials
    | CreateBigqueryCredentials
    | FullPostgresCredentials
    | CreateSnowflakeCredentials
    | CreateDatabricksCredentials;

export type UpdateWarehouseCredentials = Omit<
    CreateWarehouseCredentials,
    SensitiveCredentialsFieldNames
>;

export type WarehouseCredentials =
    | SnowflakeCredentials
    | RedshiftCredentials
    | PostgresCredentials
    | BigqueryCredentials
    | DatabricksCredentials;
