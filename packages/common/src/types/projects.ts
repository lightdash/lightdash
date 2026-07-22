import { type WeekDay } from '../utils/timeFrames';
import { type ProjectDefaults } from './lightdashProjectConfig';
import { type ProjectGroupAccess } from './projectGroupAccess';

export enum ProjectType {
    DEFAULT = 'DEFAULT',
    PREVIEW = 'PREVIEW',
}

export enum DbtProjectType {
    DBT = 'dbt',
    DBT_CLOUD_IDE = 'dbt_cloud_ide',
    GITHUB = 'github',
    GITLAB = 'gitlab',
    BITBUCKET = 'bitbucket',
    AZURE_DEVOPS = 'azure_devops',
    NONE = 'none',
    MANIFEST = 'manifest',
}

export enum WarehouseTypes {
    BIGQUERY = 'bigquery',
    POSTGRES = 'postgres',
    REDSHIFT = 'redshift',
    SNOWFLAKE = 'snowflake',
    DATABRICKS = 'databricks',
    TRINO = 'trino',
    CLICKHOUSE = 'clickhouse',
    ATHENA = 'athena',
    DUCKDB = 'duckdb',
}

export enum DuckdbConnectionType {
    MOTHERDUCK = 'motherduck',
    DUCKLAKE = 'ducklake',
    EMBEDDED = 'embedded',
}

export type SshTunnelConfiguration = {
    useSshTunnel?: boolean;
    sshTunnelHost?: string;
    sshTunnelPort?: number;
    sshTunnelUser?: string;
    sshTunnelPublicKey?: string;
    sshTunnelPrivateKey?: string;
};

export enum BigqueryAuthenticationType {
    SSO = 'sso',
    PRIVATE_KEY = 'private_key',
    ADC = 'adc', // Application Default Credentials
}
export type CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY;
    project: string;
    dataset: string;
    threads?: number;
    timeoutSeconds: number | undefined;
    priority: 'interactive' | 'batch' | undefined;
    authenticationType?: BigqueryAuthenticationType;
    // Index signature (not Record) so tsoa generates additionalProperties and
    // intersection-body validation preserves the keyfile fields.
    keyfileContents: { [key: string]: string }; // used for both sso and private key
    requireUserCredentials?: boolean;
    retries: number | undefined;
    location: string | undefined;
    maximumBytesBilled: number | undefined;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
    executionProject?: string;
    accessUrl?: string;
};
export const sensitiveCredentialsFieldNames = [
    'user',
    'password',
    'keyfileContents',
    'personalAccessToken',
    'privateKey',
    'privateKeyPass',
    'sshTunnelPrivateKey',
    'sslcert',
    'sslkey',
    'sslrootcert',
    'token',
    'refreshToken',
    'oauthClientId',
    'oauthClientSecret',
    'accessKeyId',
    'secretAccessKey',
    'sessionToken',
] as const;
export type SensitiveCredentialsFieldNames =
    (typeof sensitiveCredentialsFieldNames)[number];
export type BigqueryCredentials = Omit<
    CreateBigqueryCredentials,
    SensitiveCredentialsFieldNames
>;

export enum DatabricksAuthenticationType {
    PERSONAL_ACCESS_TOKEN = 'personal_access_token',
    OAUTH_M2M = 'oauth_m2m',
    OAUTH_U2M = 'oauth_u2m',
}

export enum AthenaAuthenticationType {
    ACCESS_KEY = 'access_key',
    IAM_ROLE = 'iam_role',
}

export type CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS;
    catalog?: string;
    // this supposed to be a `schema` but changing it will break for existing customers
    database: string;
    serverHostName: string;
    httpPath: string;
    authenticationType?: DatabricksAuthenticationType;
    personalAccessToken?: string; // Optional when using OAuth
    refreshToken?: string; // Refresh token for OAuth, used to generate a new access token
    token?: string; // Access token for OAuth, has a low expiry time (1 hour)
    oauthClientId?: string; // OAuth M2M client ID (Service Principal)
    oauthClientSecret?: string; // OAuth M2M client secret (Service Principal)
    requireUserCredentials?: boolean;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
    compute?: Array<{
        name: string;
        httpPath: string;
    }>;
};
export type DatabricksCredentials = Omit<
    CreateDatabricksCredentials,
    SensitiveCredentialsFieldNames
>;

export type SslConfiguration = {
    sslmode?: string;
    sslcertFileName?: string;
    sslcert?: string | null; // file content
    sslkeyFileName?: string;
    sslkey?: string | null; // file content
    sslrootcertFileName?: string;
    sslrootcert?: string | null; // file content
};

export type CreatePostgresCredentials = SshTunnelConfiguration &
    SslConfiguration & {
        type: WarehouseTypes.POSTGRES;
        host: string;
        user: string;
        password: string;
        requireUserCredentials?: boolean;
        port: number;
        dbname: string;
        schema: string;
        threads?: number;
        keepalivesIdle?: number;
        searchPath?: string;
        role?: string;
        startOfWeek?: WeekDay | null;
        dataTimezone?: string;
        timeoutSeconds?: number;
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
    requireUserCredentials?: boolean;
    port: number;
    dbname: string;
    schema: string;
    http_scheme: string;
    source?: string;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
};
export type TrinoCredentials = Omit<
    CreateTrinoCredentials,
    SensitiveCredentialsFieldNames
>;
export type CreateClickhouseCredentials = {
    type: WarehouseTypes.CLICKHOUSE;
    host: string;
    user: string;
    password: string;
    requireUserCredentials?: boolean;
    port: number;
    schema: string;
    secure?: boolean;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
    timeoutSeconds?: number;
};
export type ClickhouseCredentials = Omit<
    CreateClickhouseCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA;
    region: string;
    database: string;
    schema: string;
    s3StagingDir: string;
    s3DataDir?: string;
    authenticationType?: AthenaAuthenticationType;
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    assumeRoleArn?: string;
    assumeRoleExternalId?: string;
    workGroup?: string;
    threads?: number;
    numRetries?: number;
    requireUserCredentials?: boolean;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
};

export type AthenaCredentials = Omit<
    CreateAthenaCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateDuckdbMotherduckCredentials = {
    type: WarehouseTypes.DUCKDB;
    connectionType: DuckdbConnectionType.MOTHERDUCK;
    database: string;
    schema: string;
    token: string;
    threads?: number;
    requireUserCredentials?: boolean;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
};
export type DuckdbMotherduckCredentials = Omit<
    CreateDuckdbMotherduckCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateDuckdbEmbeddedCredentials = {
    type: WarehouseTypes.DUCKDB;
    connectionType: DuckdbConnectionType.EMBEDDED;
    dataset: string;
    requireUserCredentials?: boolean;
    dataTimezone?: string;
    startOfWeek?: number;
    schema?: string;
};
export type DuckdbEmbeddedCredentials = CreateDuckdbEmbeddedCredentials;

export enum DucklakeCatalogType {
    POSTGRES = 'postgres',
    SQLITE = 'sqlite',
    DUCKDB = 'duckdb',
}

export enum DucklakeDataPathType {
    S3 = 's3',
    GCS = 'gcs',
    AZURE = 'azure',
    LOCAL = 'local',
}

export type CreateDucklakeCatalogPostgres = {
    type: DucklakeCatalogType.POSTGRES;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
};
export type DucklakeCatalogPostgres = Omit<
    CreateDucklakeCatalogPostgres,
    'user' | 'password'
>;

export type CreateDucklakeCatalogSqlite = {
    type: DucklakeCatalogType.SQLITE;
    path: string;
};
export type DucklakeCatalogSqlite = CreateDucklakeCatalogSqlite;

export type CreateDucklakeCatalogDuckdb = {
    type: DucklakeCatalogType.DUCKDB;
    path: string;
};
export type DucklakeCatalogDuckdb = CreateDucklakeCatalogDuckdb;

export type CreateDucklakeCatalog =
    | CreateDucklakeCatalogPostgres
    | CreateDucklakeCatalogSqlite
    | CreateDucklakeCatalogDuckdb;

export type DucklakeCatalog =
    | DucklakeCatalogPostgres
    | DucklakeCatalogSqlite
    | DucklakeCatalogDuckdb;

export type CreateDucklakeDataPathS3 = {
    type: DucklakeDataPathType.S3;
    url: string;
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle?: boolean;
    useSsl?: boolean;
};
export type DucklakeDataPathS3 = Omit<
    CreateDucklakeDataPathS3,
    'accessKeyId' | 'secretAccessKey'
>;

export type CreateDucklakeDataPathGcs = {
    type: DucklakeDataPathType.GCS;
    url: string;
    hmacKeyId?: string;
    hmacSecret?: string;
};
export type DucklakeDataPathGcs = Omit<
    CreateDucklakeDataPathGcs,
    'hmacKeyId' | 'hmacSecret'
>;

export type CreateDucklakeDataPathAzure = {
    type: DucklakeDataPathType.AZURE;
    url: string;
    connectionString?: string;
    accountName?: string;
    accountKey?: string;
};
export type DucklakeDataPathAzure = Omit<
    CreateDucklakeDataPathAzure,
    'connectionString' | 'accountKey'
>;

export type CreateDucklakeDataPathLocal = {
    type: DucklakeDataPathType.LOCAL;
    path: string;
};
export type DucklakeDataPathLocal = CreateDucklakeDataPathLocal;

export type CreateDucklakeDataPath =
    | CreateDucklakeDataPathS3
    | CreateDucklakeDataPathGcs
    | CreateDucklakeDataPathAzure
    | CreateDucklakeDataPathLocal;

export type DucklakeDataPath =
    | DucklakeDataPathS3
    | DucklakeDataPathGcs
    | DucklakeDataPathAzure
    | DucklakeDataPathLocal;

export type CreateDuckdbDucklakeCredentials = {
    type: WarehouseTypes.DUCKDB;
    connectionType: DuckdbConnectionType.DUCKLAKE;
    catalog: CreateDucklakeCatalog;
    dataPath: CreateDucklakeDataPath;
    schema: string;
    catalogAlias?: string;
    threads?: number;
    requireUserCredentials?: boolean;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
};

export type DuckdbDucklakeCredentials = Omit<
    CreateDuckdbDucklakeCredentials,
    'catalog' | 'dataPath'
> & {
    catalog: DucklakeCatalog;
    dataPath: DucklakeDataPath;
};

export type CreateDuckdbCredentials =
    | CreateDuckdbMotherduckCredentials
    | CreateDuckdbDucklakeCredentials
    | CreateDuckdbEmbeddedCredentials;

export type DuckdbCredentials =
    | DuckdbMotherduckCredentials
    | DuckdbDucklakeCredentials
    | DuckdbEmbeddedCredentials;

/**
 * Rows created before the connectionType field was introduced are
 * MotherDuck-shaped DuckDB credentials. Default the field at decrypt time
 * so the discriminated union narrows correctly without a data migration.
 */
export const normalizeWarehouseCredentials = <
    T extends CreateWarehouseCredentials,
>(
    credentials: T,
): T => {
    if (
        credentials.type === WarehouseTypes.DUCKDB &&
        (credentials as { connectionType?: DuckdbConnectionType })
            .connectionType === undefined
    ) {
        return {
            ...credentials,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
        };
    }
    return credentials;
};

/**
 * Top-level sensitive-field stripping does not reach into the nested
 * catalog/dataPath objects, so call this after the generic strip to
 * scrub nested credentials from a CreateDuckdbDucklakeCredentials.
 */
export const stripDucklakeNestedSensitive = (
    credentials: CreateDuckdbDucklakeCredentials,
): DuckdbDucklakeCredentials => {
    const stripCatalog = (catalog: CreateDucklakeCatalog): DucklakeCatalog => {
        switch (catalog.type) {
            case DucklakeCatalogType.POSTGRES: {
                const { user, password, ...rest } = catalog;
                return rest;
            }
            case DucklakeCatalogType.SQLITE:
            case DucklakeCatalogType.DUCKDB:
                return catalog;
            default:
                return catalog;
        }
    };
    const stripDataPath = (
        dataPath: CreateDucklakeDataPath,
    ): DucklakeDataPath => {
        switch (dataPath.type) {
            case DucklakeDataPathType.S3: {
                const { accessKeyId, secretAccessKey, ...rest } = dataPath;
                return rest;
            }
            case DucklakeDataPathType.GCS: {
                const { hmacKeyId, hmacSecret, ...rest } = dataPath;
                return rest;
            }
            case DucklakeDataPathType.AZURE: {
                const { connectionString, accountKey, ...rest } = dataPath;
                return rest;
            }
            case DucklakeDataPathType.LOCAL:
                return dataPath;
            default:
                return dataPath;
        }
    };
    return {
        ...credentials,
        catalog: stripCatalog(credentials.catalog),
        dataPath: stripDataPath(credentials.dataPath),
    };
};

export enum RedshiftAuthenticationType {
    PASSWORD = 'password',
    IAM = 'iam',
    IAM_BROWSER = 'iam_browser',
}

export type CreateRedshiftCredentials = SshTunnelConfiguration & {
    type: WarehouseTypes.REDSHIFT;
    host: string;
    user: string;
    // password is required for password auth and unused (minted by AWS) for
    // IAM auth. `user` is the login user for password auth and the requested
    // DB user for provisioned IAM (empty for serverless, which derives it).
    password?: string;
    requireUserCredentials?: boolean;
    port: number;
    dbname: string;
    schema: string;
    threads?: number;
    keepalivesIdle?: number;
    sslmode?: string;
    ra3Node?: boolean;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
    timeoutSeconds?: number;
    // IAM authentication (mint short-lived DB credentials from AWS)
    authenticationType?: RedshiftAuthenticationType;
    region?: string;
    // Provisioned clusters use GetClusterCredentials with a cluster identifier;
    // serverless workgroups use GetCredentials with a workgroup name.
    isServerless?: boolean;
    clusterIdentifier?: string;
    workgroupName?: string;
    autoCreate?: boolean;
    dbGroups?: string[];
    // AWS identity used to call the credential APIs
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    assumeRoleArn?: string;
    assumeRoleExternalId?: string;
    awsSsoStartUrl?: string;
    awsSsoRegion?: string;
    awsSsoAccountId?: string;
    awsSsoRoleName?: string;
};
export type RedshiftCredentials = Omit<
    CreateRedshiftCredentials,
    SensitiveCredentialsFieldNames
>;

// TODO use enum instead
export enum SnowflakeAuthenticationType {
    PASSWORD = 'password',
    PRIVATE_KEY = 'private_key',
    SSO = 'sso',
    EXTERNAL_BROWSER = 'external_browser',
    /** CLI-only interactive browser sign-in; never persisted as a project credential */
    OAUTH_AUTHORIZATION_CODE = 'oauth_authorization_code',
    NONE = 'none',
}

export type CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE;
    account: string;
    user: string;
    password?: string;
    requireUserCredentials?: boolean;
    privateKey?: string;
    privateKeyPass?: string;
    authenticationType?: SnowflakeAuthenticationType;
    refreshToken?: string; // Refresh token for sso, this is used to generate a new access token
    token?: string; // Access token for sso, this has a low expiry time
    role?: string;
    database: string;
    warehouse: string;
    schema: string;
    threads?: number;
    clientSessionKeepAlive?: boolean;
    queryTag?: string;
    accessUrl?: string;
    startOfWeek?: WeekDay | null;
    dataTimezone?: string;
    quotedIdentifiersIgnoreCase?: boolean;
    disableTimestampConversion?: boolean; // Disable timestamp conversion to UTC - only disable if all timestamp values are already in UTC
    timeoutSeconds?: number;
    override?: boolean;
    organizationWarehouseCredentialsUuid?: string;
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
    | CreateTrinoCredentials
    | CreateClickhouseCredentials
    | CreateAthenaCredentials
    | CreateDuckdbCredentials;
export type WarehouseCredentials =
    | SnowflakeCredentials
    | RedshiftCredentials
    | PostgresCredentials
    | BigqueryCredentials
    | DatabricksCredentials
    | TrinoCredentials
    | ClickhouseCredentials
    | AthenaCredentials
    | DuckdbCredentials;

// Returns the timezone the column data is in when the query runs.
// Snowflake's dbt translator wraps timestamps with CONVERT_TIMEZONE('UTC', col),
// so columns are UTC unless `disableTimestampConversion` opts out of that wrap.
export const getColumnTimezone = (
    credentials: CreateWarehouseCredentials | WarehouseCredentials,
): string => {
    if (
        credentials.type === WarehouseTypes.SNOWFLAKE &&
        !credentials.disableTimestampConversion
    ) {
        return 'UTC';
    }
    return credentials.dataTimezone ?? 'UTC';
};

export type CreatePostgresLikeCredentials =
    | CreateRedshiftCredentials
    | CreatePostgresCredentials;

export const maybeOverrideWarehouseConnection = <
    T extends WarehouseCredentials,
>(
    connection: T,
    overrides: { schema?: string },
): T => {
    const isBigquery = connection.type === WarehouseTypes.BIGQUERY;
    const overridesSchema = isBigquery
        ? { dataset: overrides.schema }
        : { schema: overrides.schema };
    return {
        ...connection,
        ...(overrides.schema ? overridesSchema : undefined),
    };
};

/**
 * Merges new warehouse credentials with base credentials, preserving advanced settings
 * like requireUserCredentials from the base credentials.
 *
 * This is useful when creating preview projects where we want to use new connection details
 * (like from dbt profiles) but preserve advanced configuration from the parent project.
 */
export const mergeWarehouseCredentials = <T extends CreateWarehouseCredentials>(
    baseCredentials: T,
    newCredentials: T,
): T => {
    // If types don't match, return newCredentials as-is (can't merge different warehouse types)
    if (baseCredentials.type !== newCredentials.type) {
        // eslint-disable-next-line no-console
        console.info(
            `Skipping merge of warehouse credentials due to differing types: ${baseCredentials.type} and ${newCredentials.type}`,
        );
        return newCredentials;
    }

    // Edge case: if the warehouse is snowflake but with a different warehouse, return newCredentials as-is
    // This is to avoid enforcing requireUserCredentials on a different snowflake warehouse that might not have SSO enabled or different roles
    if (
        baseCredentials.type === WarehouseTypes.SNOWFLAKE &&
        newCredentials.type === WarehouseTypes.SNOWFLAKE &&
        baseCredentials.warehouse.toLowerCase().trim() !==
            newCredentials.warehouse.toLowerCase().trim()
    ) {
        // eslint-disable-next-line no-console
        console.info(
            `Skipping merge of Snowflake credentials due to differing warehouse names: ${baseCredentials.warehouse} and ${newCredentials.warehouse}`,
        );
        return newCredentials;
    }

    // Only add non sensitive fields from base credentials to avoid conflicts with authentication methods.
    // assumeRoleArn/assumeRoleExternalId are authentication config tied to the base credentials, so they
    // must not be inherited when the preview supplies its own credentials (otherwise the preview tries to
    // assume the parent's role with credentials that aren't authorized to).
    const keysToExclude = [
        ...sensitiveCredentialsFieldNames,
        'authenticationType',
        'assumeRoleArn',
        'assumeRoleExternalId',
    ];
    const filteredBaseCredentials = Object.fromEntries(
        Object.entries(baseCredentials).filter(
            ([key]) =>
                !keysToExclude.includes(key as SensitiveCredentialsFieldNames),
        ),
    );
    // We will use new credentials for connection, this might contain new authentication method
    // do not include all baseCredentials here, to avoid conflicts on authentication (that will cause a mix of serviceaccounts/sso/passwords)
    const merged = {
        ...filteredBaseCredentials, // We copy most of the base config from the parent project, including advanced settings
        ...newCredentials,
        // Keep requireUserCredentials from base credentials, since this is a security setting and should not be overridden
        requireUserCredentials:
            baseCredentials.requireUserCredentials ||
            newCredentials.requireUserCredentials,
    };

    return merged as T;
};

export interface DbtProjectConfigBase {
    type: DbtProjectType;
}

export type DbtProjectEnvironmentVariable = {
    key: string;
    value: string;
};

export const LIGHTDASH_DBT_PROFILE_ENV_VAR_PREFIX =
    'LIGHTDASH_DBT_PROFILE_VAR_';

const DBT_ENVIRONMENT_VARIABLE_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

const BLOCKED_DBT_ENVIRONMENT_VARIABLE_KEYS = new Set([
    'GIT_ASKPASS',
    'GIT_SSH',
    'GIT_SSH_COMMAND',
    'LD_AUDIT',
    'LD_LIBRARY_PATH',
    'LD_PRELOAD',
    'NODE_OPTIONS',
    'NODE_PATH',
    'PATH',
    'PERL5OPT',
    'PYTHONHOME',
    'PYTHONPATH',
    'RUBYOPT',
    'SHELL',
    'SSH_ASKPASS',
]);

const BLOCKED_DBT_ENVIRONMENT_VARIABLE_KEY_PREFIXES = ['DYLD_', 'GIT_CONFIG_'];

export const getDbtEnvironmentVariableKeyError = (
    key: string,
    options: {
        allowLightdashProfileEnvironmentVariables?: boolean;
    } = {},
): string | undefined => {
    if (key.length === 0) {
        return undefined;
    }

    if (!DBT_ENVIRONMENT_VARIABLE_KEY_REGEX.test(key)) {
        return `Environment variable "${key}" must contain only letters, numbers, and underscores, and cannot start with a number`;
    }

    if (
        !options.allowLightdashProfileEnvironmentVariables &&
        key.startsWith(LIGHTDASH_DBT_PROFILE_ENV_VAR_PREFIX)
    ) {
        return `Environment variable "${key}" is reserved for Lightdash`;
    }

    if (
        BLOCKED_DBT_ENVIRONMENT_VARIABLE_KEYS.has(key) ||
        BLOCKED_DBT_ENVIRONMENT_VARIABLE_KEY_PREFIXES.some((prefix) =>
            key.startsWith(prefix),
        )
    ) {
        return `Environment variable "${key}" cannot be used because it can change how dbt or its child processes execute`;
    }

    return undefined;
};

export const isSafeDbtEnvironmentVariableKey = (
    key: string,
    options: {
        allowLightdashProfileEnvironmentVariables?: boolean;
    } = {},
): boolean => getDbtEnvironmentVariableKeyError(key, options) === undefined;

export const getInvalidDbtEnvironmentVariableKeys = (
    environment: DbtProjectEnvironmentVariable[] | undefined,
): string[] =>
    (environment ?? [])
        .map(({ key }) => key)
        .filter((key) => getDbtEnvironmentVariableKeyError(key) !== undefined);

export enum SupportedDbtVersions {
    V1_4 = 'v1.4',
    V1_5 = 'v1.5',
    V1_6 = 'v1.6',
    V1_7 = 'v1.7',
    V1_8 = 'v1.8',
    V1_9 = 'v1.9',
    V1_10 = 'v1.10',
    V1_11 = 'v1.11',
    V1_12 = 'v1.12',
}

// Make it an enum to avoid TSOA errors
export enum DbtVersionOptionLatest {
    LATEST = 'latest',
}

export function isDbtVersion110OrHigher(
    version: SupportedDbtVersions | undefined,
): boolean {
    if (!version) {
        return false;
    }
    // Get all enum values as an array in order
    const versions = Object.values(SupportedDbtVersions);
    const v110Index = versions.indexOf(SupportedDbtVersions.V1_10);
    const currentIndex = versions.indexOf(version);

    // If the current version is at or after v1.10 in the enum order
    return currentIndex >= v110Index;
}

export type DbtVersionOption = SupportedDbtVersions | DbtVersionOptionLatest;

const dbtWarehousesExcept = (
    ...unsupported: WarehouseTypes[]
): WarehouseTypes[] =>
    Object.values(WarehouseTypes).filter((w) => !unsupported.includes(w));

/**
 * Warehouse adapters installed for each dbt version in the production image
 * (see the "Installing multiple versions of dbt" block in `/dockerfile`). This
 * is the source of truth for which `(dbt version, warehouse)` combinations
 * Lightdash can actually run, and it gates which version `latest` may point to
 * (see `LATEST_SUPPORTED_DBT_VERSION`).
 *
 * Keep this in sync with `/dockerfile` whenever an adapter is added to or
 * dropped from a version. The exhaustive `Record` forces every new
 * `SupportedDbtVersions` member to declare its adapter coverage.
 */
export const DBT_VERSION_SUPPORTED_WAREHOUSES: Record<
    SupportedDbtVersions,
    WarehouseTypes[]
> = {
    [SupportedDbtVersions.V1_4]: dbtWarehousesExcept(
        WarehouseTypes.ATHENA,
        WarehouseTypes.DUCKDB,
    ),
    [SupportedDbtVersions.V1_5]: dbtWarehousesExcept(
        WarehouseTypes.ATHENA,
        WarehouseTypes.DUCKDB,
    ),
    [SupportedDbtVersions.V1_6]: dbtWarehousesExcept(
        WarehouseTypes.ATHENA,
        WarehouseTypes.DUCKDB,
    ),
    [SupportedDbtVersions.V1_7]: dbtWarehousesExcept(
        WarehouseTypes.ATHENA,
        WarehouseTypes.DUCKDB,
    ),
    [SupportedDbtVersions.V1_8]: dbtWarehousesExcept(WarehouseTypes.ATHENA),
    [SupportedDbtVersions.V1_9]: dbtWarehousesExcept(),
    [SupportedDbtVersions.V1_10]: dbtWarehousesExcept(),
    [SupportedDbtVersions.V1_11]: dbtWarehousesExcept(),
    [SupportedDbtVersions.V1_12]: dbtWarehousesExcept(
        WarehouseTypes.DATABRICKS,
    ),
};

export const getDbtVersionSupportedWarehouses = (
    version: SupportedDbtVersions,
): WarehouseTypes[] => DBT_VERSION_SUPPORTED_WAREHOUSES[version];

export const isWarehouseSupportedByDbtVersion = (
    version: SupportedDbtVersions,
    warehouseType: WarehouseTypes,
): boolean => DBT_VERSION_SUPPORTED_WAREHOUSES[version].includes(warehouseType);

export const LATEST_SUPPORTED_DBT_VERSION: SupportedDbtVersions =
    SupportedDbtVersions.V1_11;

export const getLatestSupportDbtVersion = (): SupportedDbtVersions =>
    LATEST_SUPPORTED_DBT_VERSION;

export const resolveDbtVersion = (
    option: DbtVersionOption,
): SupportedDbtVersions =>
    option === DbtVersionOptionLatest.LATEST
        ? getLatestSupportDbtVersion()
        : option;

export const DefaultSupportedDbtVersion = DbtVersionOptionLatest.LATEST;

export interface DbtProjectCompilerBase extends DbtProjectConfigBase {
    target?: string;
    environment?: DbtProjectEnvironmentVariable[];
    selector?: string;
}

export interface DbtNoneProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.NONE;

    hideRefreshButton?: boolean;
}

export interface DbtManifestProjectConfig extends DbtProjectConfigBase {
    type: DbtProjectType.MANIFEST;
    manifest: string;
    hideRefreshButton: boolean;
}

export interface DbtLocalProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.DBT;
    profiles_dir?: string;
    project_dir?: string;
}

export interface DbtCloudIDEProjectConfig extends DbtProjectConfigBase {
    type: DbtProjectType.DBT_CLOUD_IDE;
    api_key: string;
    environment_id: string;
    discovery_api_endpoint?: string;
    tags?: string[];
    webhook_hmac_secret?: string;
}

export interface DbtGithubProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.GITHUB;
    authorization_method: 'personal_access_token' | 'installation_id';
    personal_access_token?: string;
    installation_id?: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtGitlabProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.GITLAB;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtBitBucketProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.BITBUCKET;
    username: string;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtAzureDevOpsProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.AZURE_DEVOPS;
    personal_access_token: string;
    organization: string;
    project: string;
    repository: string;
    branch: string;
    project_sub_path: string;
}

export type DbtProjectConfig =
    | DbtLocalProjectConfig
    | DbtCloudIDEProjectConfig
    | DbtGithubProjectConfig
    | DbtBitBucketProjectConfig
    | DbtGitlabProjectConfig
    | DbtAzureDevOpsProjectConfig
    | DbtNoneProjectConfig
    | DbtManifestProjectConfig;

/**
 * One dbt source connected to a project (PROD-7484 multiple dbt sources). The
 * project's own `dbt_connection` is the primary source (precedence 0); when a
 * project has no source rows it runs the single-source path unchanged (N=0
 * short-circuit). `dbtConnection` is the decrypted per-source connection; the
 * source is recompiled from it at deploy/preview time and its manifest merged
 * with the others.
 *
 * `hasCredentialError` is true when the stored connection could not be
 * decrypted (e.g. an encryption secret rotation) — `dbtConnection` is then
 * `null` even though a connection was originally saved. Callers must not let
 * one source's credential error fail an operation over every source (listing,
 * compiling); only an operation that actually needs this source's connection
 * (editing, compiling this one source) should fail, and should name the
 * source when it does.
 */
export type ProjectDbtSource = {
    projectDbtSourceUuid: string;
    projectUuid: string;
    name: string;
    isPrimary: boolean;
    precedence: number;
    dbtConnection: DbtProjectConfig | null;
    hasCredentialError: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type CreateProjectDbtSource = {
    name: string;
    isPrimary: boolean;
    precedence: number;
    dbtConnection: DbtProjectConfig | null;
};

export type UpdateProjectDbtSource = {
    name?: string;
    precedence?: number;
    dbtConnection?: DbtProjectConfig | null;
};

/**
 * Non-sensitive view of a dbt source for API responses — never includes the
 * decrypted connection (which holds credentials). The primary source is
 * synthesised from the project's own dbt_connection. `repository`, `branch` and
 * `projectSubPath` are the git-backed source's identity (null for non-git
 * connections); they are safe to expose — only secrets are stripped.
 *
 * `hasCredentialError` is always `false` for the synthesised primary source.
 * See `ProjectDbtSource` for what it means on an additional source.
 */
export type ProjectDbtSourceSummary = {
    projectDbtSourceUuid: string;
    name: string;
    isPrimary: boolean;
    precedence: number;
    type: DbtProjectType | null;
    repository: string | null;
    branch: string | null;
    projectSubPath: string | null;
    hasCredentialError: boolean;
};

export type ApiCreateProjectDbtSource = {
    name: string;
    dbtConnection: DbtProjectConfig;
};

export type ApiProjectDbtSourcesResponse = {
    status: 'ok';
    results: ProjectDbtSourceSummary[];
};

export type ApiProjectDbtSourceResponse = {
    status: 'ok';
    results: ProjectDbtSourceSummary;
};

/**
 * A single dbt source including its connection, with sensitive credentials
 * (tokens, keys) stripped — used to pre-fill the edit form. Secrets left out
 * here are preserved on update via `mergeMissingDbtConfigSecrets`.
 */
export type ProjectDbtSourceWithConnection = ProjectDbtSourceSummary & {
    dbtConnection: DbtProjectConfig | null;
};

export type ApiProjectDbtSourceWithConnectionResponse = {
    status: 'ok';
    results: ProjectDbtSourceWithConnection;
};

export type ApiUpdateProjectDbtSource = {
    name?: string;
    dbtConnection?: DbtProjectConfig;
};

export const isGitProjectType = (
    connection: DbtProjectConfig,
): connection is
    | DbtGithubProjectConfig
    | DbtBitBucketProjectConfig
    | DbtGitlabProjectConfig =>
    [
        DbtProjectType.GITHUB,
        DbtProjectType.GITLAB,
        DbtProjectType.BITBUCKET,
    ].includes(connection.type);

const isRemoteType = (
    connection: DbtProjectConfig,
): connection is DbtLocalProjectConfig | DbtCloudIDEProjectConfig =>
    [DbtProjectType.DBT, DbtProjectType.DBT_CLOUD_IDE].includes(
        connection.type,
    );

export const maybeOverrideDbtConnection = <T extends DbtProjectConfig>(
    connection: T,
    overrides: {
        branch?: string;
        environment?: DbtProjectEnvironmentVariable[];
        manifest?: string;
    },
): T => {
    // If manifest is provided, create a MANIFEST connection type
    if (overrides.manifest) {
        return {
            type: DbtProjectType.MANIFEST,
            manifest: overrides.manifest,
            hideRefreshButton: true,
        } as T;
    }

    return {
        ...connection,
        ...(isGitProjectType(connection) && overrides.branch
            ? { branch: overrides.branch }
            : undefined),
        ...(!isRemoteType(connection) &&
        overrides.environment &&
        overrides.environment.length > 0
            ? { environment: overrides.environment }
            : undefined),
    };
};

export type Project = {
    organizationUuid: string;
    projectUuid: string;
    name: string;
    type: ProjectType;
    dbtConnection: DbtProjectConfig;
    warehouseConnection?: WarehouseCredentials;
    pinnedListUuid?: string;
    upstreamProjectUuid?: string;
    dbtVersion: DbtVersionOption;
    schedulerTimezone: string;
    queryTimezone: string | null;
    useProjectTimezoneInFilters: boolean;
    schedulerFailureNotifyRecipients: boolean;
    schedulerFailureIncludeContact: boolean;
    schedulerFailureContactOverride: string | null;
    createdByUserUuid: string | null;
    organizationWarehouseCredentialsUuid?: string;
    hasDefaultUserSpaces: boolean;
    projectDefaults?: ProjectDefaults;
    colorPaletteUuid: string | null;
    expiresAt: Date | null;
    provisioningSource?: string | null;
};

export type ProjectSummary = Pick<
    Project,
    | 'name'
    | 'projectUuid'
    | 'organizationUuid'
    | 'type'
    | 'upstreamProjectUuid'
    | 'createdByUserUuid'
    | 'provisioningSource'
>;

export type ApiProjectResponse = {
    status: 'ok';
    results: Project;
};

export type EnsurePlaygroundProjectResults = {
    projectUuid: string;
    created: boolean;
};

export type ApiEnsurePlaygroundProjectResponse = {
    status: 'ok';
    results: EnsurePlaygroundProjectResults;
};

export type UpdateProjectDetails = Partial<Pick<Project, 'name'>>;

export type ApiGetProjectGroupAccesses = {
    status: 'ok';
    results: ProjectGroupAccess[];
};

export type IdContentMapping = {
    id: number | string;
    newId: number | string;
};

export type PreviewContentMapping = {
    charts: IdContentMapping[];
    chartVersions: IdContentMapping[];
    spaces: IdContentMapping[];
    dashboards: IdContentMapping[];
    dashboardVersions: IdContentMapping[];
    savedSql: IdContentMapping[];
    savedSqlVersions: IdContentMapping[];
    aiAgents: IdContentMapping[];
};

export type UpdateSchedulerSettings = {
    schedulerTimezone?: string;
    schedulerFailureNotifyRecipients?: boolean;
    schedulerFailureIncludeContact?: boolean;
    schedulerFailureContactOverride?: string | null;
};

export type UpdateQueryTimezoneSettings = {
    queryTimezone?: string | null;
    useProjectTimezoneInFilters?: boolean;
};
