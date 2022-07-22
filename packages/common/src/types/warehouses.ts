import {
    getSafeSSHTunnelConfig,
    SSHTunnelConfig,
    SSHTunnelConfigSecrets,
} from './sshTunnels';

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

// Supported warehouses
export enum WarehouseTypes {
    BIGQUERY = 'bigquery',
    POSTGRES = 'postgres',
    REDSHIFT = 'redshift',
    SNOWFLAKE = 'snowflake',
    DATABRICKS = 'databricks',
}

// BIGQUERY
export type FullBigqueryCredentials = {
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
export type CreateBigqueryCredentials = FullBigqueryCredentials;
export type UpdateBigqueryCredentials = Optional<
    CreateBigqueryCredentials,
    'keyfileContents'
>;
export type BigqueryCredentials = Omit<
    FullBigqueryCredentials,
    'keyfileContents'
>;
export const isCreateBigqueryCredentials = (
    creds: UpdateBigqueryCredentials,
): creds is CreateBigqueryCredentials => creds.keyfileContents !== undefined;
export const getSafeBigqueryCredentials = (
    creds: FullBigqueryCredentials,
): BigqueryCredentials => {
    const { keyfileContents, ...rest } = creds;
    return rest;
};

// DATABRICKS
export type FullDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS;
    serverHostName: string;
    port: number;
    database: string;
    personalAccessToken: string;
    httpPath: string;
};
export type CreateDatabricksCredentials = FullDatabricksCredentials;
export type UpdateDatabricksCredentials = Optional<
    CreateDatabricksCredentials,
    'personalAccessToken'
>;
export type DatabricksCredentials = Omit<
    FullDatabricksCredentials,
    'personalAccessToken'
>;
export const isCreateDatabricksCredentials = (
    creds: UpdateDatabricksCredentials,
): creds is CreateDatabricksCredentials =>
    creds.personalAccessToken !== undefined;

// POSTGRES
export type FullPostgresCredentials = {
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
    sshTunnel?: SSHTunnelConfigSecrets;
};
export type CreatePostgresCredentials = Omit<
    FullPostgresCredentials,
    'sshTunnel'
> & {
    sshTunnel?: SSHTunnelConfig;
};
export type UpdatePostgresCredentials = Optional<
    CreatePostgresCredentials,
    'password' | 'user'
>;
export type PostgresCredentials = Omit<
    FullPostgresCredentials,
    'password' | 'user' | 'sshTunnel'
> & { sshTunnel?: SSHTunnelConfig };
export const isCreatePostgresCredentails = (
    creds: UpdatePostgresCredentials,
): creds is CreatePostgresCredentials =>
    creds.user !== undefined && creds.password !== undefined;

// REDSHIFT
export type FullRedshiftCredentials = {
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
    sshTunnel?: SSHTunnelConfigSecrets;
};
export type CreateRedshiftCredentials = Omit<
    FullRedshiftCredentials,
    'sshTunnel'
> & {
    sshTunnel?: SSHTunnelConfig;
};
export type UpdateRedshiftCredentials = Optional<
    CreateRedshiftCredentials,
    'user' | 'password'
>;
export type RedshiftCredentials = Omit<
    CreateRedshiftCredentials,
    'user' | 'password' | 'sshTunnel'
> & {
    sshTunnel?: SSHTunnelConfig;
};
export const isCreateRedshiftCredentials = (
    creds: UpdateRedshiftCredentials,
): creds is CreateRedshiftCredentials =>
    creds.user !== undefined && creds.password !== undefined;

// SNOWFLAKE
export type FullSnowflakeCredentials = {
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
export type CreateSnowflakeCredentials = FullSnowflakeCredentials;
export type UpdateSnowflakeCredentials = Optional<
    CreateSnowflakeCredentials,
    'user' | 'password'
>;
export type SnowflakeCredentials = Omit<
    CreateSnowflakeCredentials,
    'user' | 'password'
>;
export const isCreateSnowflakeCredentials = (
    creds: UpdateSnowflakeCredentials,
): creds is CreateSnowflakeCredentials =>
    creds.user !== undefined && creds.password !== undefined;

export type CreateWarehouseCredentials =
    | CreateRedshiftCredentials
    | CreateBigqueryCredentials
    | CreatePostgresCredentials
    | CreateSnowflakeCredentials
    | CreateDatabricksCredentials;

export type FullWarehouseCredentials =
    | FullRedshiftCredentials
    | FullBigqueryCredentials
    | FullPostgresCredentials
    | FullSnowflakeCredentials
    | FullDatabricksCredentials;

export type UpdateWarehouseCredentials =
    | UpdateBigqueryCredentials
    | UpdateDatabricksCredentials
    | UpdateSnowflakeCredentials
    | UpdatePostgresCredentials
    | UpdateRedshiftCredentials;

export type WarehouseCredentials =
    | SnowflakeCredentials
    | RedshiftCredentials
    | PostgresCredentials
    | BigqueryCredentials
    | DatabricksCredentials;

export const isCreateWarehouseCredentials = (
    creds: UpdateWarehouseCredentials,
): creds is CreateWarehouseCredentials => {
    switch (creds.type) {
        case WarehouseTypes.REDSHIFT:
            return isCreateRedshiftCredentials(creds);
        case WarehouseTypes.DATABRICKS:
            return isCreateDatabricksCredentials(creds);
        case WarehouseTypes.POSTGRES:
            return isCreatePostgresCredentails(creds);
        case WarehouseTypes.BIGQUERY:
            return isCreateBigqueryCredentials(creds);
        case WarehouseTypes.SNOWFLAKE:
            return isCreateSnowflakeCredentials(creds);
        default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const n: never = creds;
            throw new Error('Not a valid warehouse');
    }
};

export const getSafeWarehouseCredentials = (
    creds: FullWarehouseCredentials,
): WarehouseCredentials => {
    switch (creds.type) {
        case WarehouseTypes.REDSHIFT:
            return {
                type: WarehouseTypes.REDSHIFT,
                host: creds.host,
                port: creds.port,
                dbname: creds.dbname,
                schema: creds.schema,
                threads: creds.threads,
                keepalivesIdle: creds.keepalivesIdle,
                sslmode: creds.sslmode,
                ra3Node: creds.ra3Node,
                sshTunnel: getSafeSSHTunnelConfig(creds.sshTunnel),
            };
        case WarehouseTypes.DATABRICKS:
            return {
                type: WarehouseTypes.DATABRICKS,
                serverHostName: creds.serverHostName,
                port: creds.port,
                database: creds.database,
                httpPath: creds.httpPath,
            };
        case WarehouseTypes.POSTGRES:
            return {
                type: WarehouseTypes.POSTGRES,
                host: creds.host,
                port: creds.port,
                dbname: creds.dbname,
                schema: creds.schema,
                threads: creds.threads,
                keepalivesIdle: creds.keepalivesIdle,
                searchPath: creds.searchPath,
                role: creds.role,
                sslmode: creds.sslmode,
                sshTunnel: getSafeSSHTunnelConfig(creds.sshTunnel),
            };
        case WarehouseTypes.BIGQUERY:
            return {
                type: WarehouseTypes.BIGQUERY,
                project: creds.project,
                dataset: creds.dataset,
                threads: creds.threads,
                timeoutSeconds: creds.timeoutSeconds,
                priority: creds.priority,
                retries: creds.retries,
                location: creds.location,
                maximumBytesBilled: creds.maximumBytesBilled,
            };
        case WarehouseTypes.SNOWFLAKE:
            return {
                type: WarehouseTypes.SNOWFLAKE,
                account: creds.account,
                role: creds.role,
                database: creds.database,
                warehouse: creds.warehouse,
                schema: creds.schema,
                threads: creds.threads,
                clientSessionKeepAlive: creds.clientSessionKeepAlive,
                queryTag: creds.queryTag,
            };
        default:
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const n: never = creds;
            throw new Error('Not a valid warehouse');
    }
};
