import { type WeekDay } from '../utils/timeFrames';
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
    keyfileContents: Record<string, string>; // used for both sso and private key
    requireUserCredentials?: boolean;
    retries: number | undefined;
    location: string | undefined;
    maximumBytesBilled: number | undefined;
    startOfWeek?: WeekDay | null;
    executionProject?: string;
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
] as const;
export type SensitiveCredentialsFieldNames =
    typeof sensitiveCredentialsFieldNames[number];
export type BigqueryCredentials = Omit<
    CreateBigqueryCredentials,
    SensitiveCredentialsFieldNames
>;

export enum DatabricksAuthenticationType {
    PERSONAL_ACCESS_TOKEN = 'personal_access_token',
    OAUTH_M2M = 'oauth_m2m',
    OAUTH_U2M = 'oauth_u2m',
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
    timeoutSeconds?: number;
};
export type ClickhouseCredentials = Omit<
    CreateClickhouseCredentials,
    SensitiveCredentialsFieldNames
>;
export type CreateRedshiftCredentials = SshTunnelConfiguration & {
    type: WarehouseTypes.REDSHIFT;
    host: string;
    user: string;
    password: string;
    requireUserCredentials?: boolean;
    port: number;
    dbname: string;
    schema: string;
    threads?: number;
    keepalivesIdle?: number;
    sslmode?: string;
    ra3Node?: boolean;
    startOfWeek?: WeekDay | null;
    timeoutSeconds?: number;
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
    quotedIdentifiersIgnoreCase?: boolean;
    disableTimestampConversion?: boolean; // Disable timestamp conversion to UTC - only disable if all timestamp values are already in UTC
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
    | CreateClickhouseCredentials;
export type WarehouseCredentials =
    | SnowflakeCredentials
    | RedshiftCredentials
    | PostgresCredentials
    | BigqueryCredentials
    | DatabricksCredentials
    | TrinoCredentials
    | ClickhouseCredentials;

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

    // Only add non sensitive fields from base credentials to avoid conflicts with authentication methods
    const keysToExclude = [
        ...sensitiveCredentialsFieldNames,
        'authenticationType',
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

export enum SupportedDbtVersions {
    V1_4 = 'v1.4',
    V1_5 = 'v1.5',
    V1_6 = 'v1.6',
    V1_7 = 'v1.7',
    V1_8 = 'v1.8',
    V1_9 = 'v1.9',
    V1_10 = 'v1.10',
    V1_11 = 'v1.11',
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

export const getLatestSupportDbtVersion = (): SupportedDbtVersions => {
    const versions = Object.values(SupportedDbtVersions);
    return versions[versions.length - 1];
};

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
        ...(!isRemoteType(connection) && overrides.environment
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
    createdByUserUuid: string | null;
    organizationWarehouseCredentialsUuid?: string;
};

export type ProjectSummary = Pick<
    Project,
    'name' | 'projectUuid' | 'organizationUuid' | 'type' | 'upstreamProjectUuid'
>;

export type ApiProjectResponse = {
    status: 'ok';
    results: Project;
};

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
    schedulerTimezone: string;
};
