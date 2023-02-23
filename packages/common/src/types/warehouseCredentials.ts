import { WeekDay } from '../utils/timeFrames';

export enum WarehouseTypes {
    BIGQUERY = 'bigquery',
    POSTGRES = 'postgres',
    REDSHIFT = 'redshift',
    SNOWFLAKE = 'snowflake',
    DATABRICKS = 'databricks',
    TRINO = 'trino',
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
    startOfWeek?: WeekDay | null;
};

export const sensitiveCredentialsFieldNames = [
    'user',
    'password',
    'keyfileContents',
    'personalAccessToken',
    'privateKey',
    'privateKeyPass',
] as const;

export const sensitiveDbtCredentialsFieldNames = [
    'personal_access_token',
    'api_key',
] as const;

export type SensitiveCredentialsFieldNames =
    typeof sensitiveCredentialsFieldNames[number];

export type BigqueryCredentials = Omit<
    CreateBigqueryCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS;
    catalog?: string;
    // this supposed to be a `schema` but changing it will break for existing customers
    database: string;
    serverHostName: string;
    httpPath: string;
    personalAccessToken: string;
    startOfWeek?: WeekDay | null;
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
    startOfWeek?: WeekDay | null;
};

export type PostgresCredentials = Omit<
    CreatePostgresCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateTrinoCredentials = {
    type: WarehouseTypes.TRINO;
    host: string;
    user: string;
    password: string;
    port: number;
    dbname: string;
    schema: string;
    http_scheme: string;
    startOfWeek?: WeekDay | null;
};

export type TrinoCredentials = Omit<
    CreateTrinoCredentials,
    SensitiveCredentialsFieldNames
>;

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
    startOfWeek?: WeekDay | null;
};

export type RedshiftCredentials = Omit<
    CreateRedshiftCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE;
    account: string;
    user: string;
    password?: string;
    privateKey?: string;
    privateKeyPass?: string;
    role?: string;
    database: string;
    warehouse: string;
    schema: string;
    threads?: number;
    clientSessionKeepAlive?: boolean;
    queryTag?: string;
    accessUrl?: string;
    startOfWeek?: WeekDay | null;
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
    | CreateDatabricksCredentials
    | CreateTrinoCredentials;

export type WarehouseCredentials =
    | SnowflakeCredentials
    | RedshiftCredentials
    | PostgresCredentials
    | BigqueryCredentials
    | DatabricksCredentials
    | TrinoCredentials;
