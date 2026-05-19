import {
    AnyType,
    assertUnreachable,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    CreateWarehouseCredentials,
    DucklakeCatalogType,
    DucklakeDataPathType,
    ParameterError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import path from 'path';

export const LIGHTDASH_PROFILE_NAME = 'lightdash_profile';
export const LIGHTDASH_TARGET_NAME = 'prod';
const DEFAULT_THREADS = 1;

const envVar = (v: string) => `LIGHTDASH_DBT_PROFILE_VAR_${v.toUpperCase()}`;
const envVarReference = (v: string) => `{{ env_var('${envVar(v)}') }}`;

type CredentialsTarget = {
    target: Record<string, AnyType>;
    environment: Record<string, string>;
    files?: Record<string, string>;
};

const credentialsTarget = (
    credentials: CreateWarehouseCredentials,
    profilesDir: string,
): CredentialsTarget => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            const bqResult: CredentialsTarget = {
                target: {
                    type: credentials.type,
                    project: credentials.project,
                    dataset: credentials.dataset,
                    threads: DEFAULT_THREADS,
                    timeout_seconds: credentials.timeoutSeconds,
                    priority: credentials.priority,
                    retries: credentials.retries,
                    maximum_bytes_billed:
                        credentials.maximumBytesBilled || undefined, // form allows empty string, converting to undefined here
                    execution_project: credentials.executionProject,
                },
                environment: {},
            };
            switch (credentials.authenticationType) {
                // for backwards compatibility, handle undefined authenticationType as private key.
                case BigqueryAuthenticationType.PRIVATE_KEY:
                case BigqueryAuthenticationType.SSO:
                case undefined:
                    bqResult.target.method = 'service-account-json';
                    // Ensure keyfileContents exists and is not null/undefined
                    if (
                        !credentials.keyfileContents ||
                        typeof credentials.keyfileContents !== 'object'
                    ) {
                        throw new ParameterError(
                            'BigQuery private key/SSO authentication requires keyfileContents to be provided',
                        );
                    }
                    bqResult.target.keyfile_json = Object.fromEntries(
                        Object.keys(credentials.keyfileContents).map((key) => [
                            key,
                            envVarReference(key),
                        ]),
                    );
                    bqResult.environment = Object.fromEntries(
                        Object.entries(credentials.keyfileContents).map(
                            ([key, value]) => [envVar(key), value],
                        ),
                    );
                    return bqResult;
                case BigqueryAuthenticationType.ADC:
                    // With oauth method and no keyfile contents, dbt will use the
                    // application default credentials (ADC) to authenticate
                    bqResult.target.method = 'oauth';
                    return bqResult;
                default:
                    const { authenticationType } = credentials;
                    return assertUnreachable(
                        credentials,
                        `Incorrect BigQuery profile. Received authenticationType: ${authenticationType}`,
                    );
            }
        case WarehouseTypes.REDSHIFT:
            return {
                target: {
                    type: credentials.type,
                    host: credentials.host,
                    user: envVarReference('user'),
                    password: envVarReference('password'),
                    port: credentials.port,
                    dbname: credentials.dbname,
                    schema: credentials.schema,
                    threads: DEFAULT_THREADS,
                    keepalives_idle: credentials.keepalivesIdle,
                    sslmode: credentials.sslmode,
                    sslrootcert:
                        require.resolve('@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-redshift.crt'),
                    ra3_node: credentials.ra3Node || true,
                },
                environment: {
                    [envVar('user')]: credentials.user,
                    [envVar('password')]: credentials.password,
                },
            };
        case WarehouseTypes.POSTGRES:
            return {
                target: {
                    type: credentials.type,
                    host: credentials.host,
                    user: envVarReference('user'),
                    password: envVarReference('password'),
                    port: credentials.port,
                    dbname: credentials.dbname,
                    schema: credentials.schema,
                    threads: DEFAULT_THREADS,
                    keepalives_idle: credentials.keepalivesIdle,
                    search_path: credentials.searchPath,
                    role: credentials.role,
                    sslmode: credentials.sslmode,
                    ...(credentials.host.endsWith('.rds.amazonaws.com')
                        ? {
                              sslrootcert:
                                  require.resolve('@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-rds-global.pem'),
                          }
                        : {}),
                },
                environment: {
                    [envVar('user')]: credentials.user,
                    [envVar('password')]: credentials.password,
                },
            };
        case WarehouseTypes.TRINO:
            return {
                target: {
                    type: credentials.type,
                    host: credentials.host,
                    method: 'ldap',
                    user: envVarReference('user'),
                    password: envVarReference('password'),
                    port: credentials.port,
                    database: credentials.dbname,
                    schema: credentials.schema,
                    http_scheme: credentials.http_scheme,
                },
                environment: {
                    [envVar('user')]: credentials.user,
                    [envVar('password')]: credentials.password,
                },
            };
        case WarehouseTypes.SNOWFLAKE: {
            const result: CredentialsTarget = {
                target: {
                    type: credentials.type,
                    account: credentials.account,
                    user: envVarReference('user'),
                    password: envVarReference('password'),
                    role: credentials.role,
                    database: credentials.database,
                    warehouse: credentials.warehouse,
                    schema: credentials.schema,
                    threads: DEFAULT_THREADS,
                    client_session_keep_alive:
                        credentials.clientSessionKeepAlive,
                    query_tag: credentials.queryTag,
                },
                environment: {
                    [envVar('user')]: credentials.user,
                },
            };
            if (
                credentials.authenticationType ===
                SnowflakeAuthenticationType.SSO
            ) {
                // Credentials from SSO will be loaded on _resolveWarehouseClientCredentials in ProjectService
                console.debug('Snowflake authentication type is SSO');
            } else if (
                (!credentials.authenticationType ||
                    credentials.authenticationType === 'password') &&
                credentials.password
            ) {
                result.target.password = envVarReference('password');
                result.environment[envVar('password')] = credentials.password;
            } else if (credentials.privateKey) {
                result.target.private_key = envVarReference('privateKey');
                result.environment[envVar('privateKey')] =
                    credentials.privateKey;

                if (credentials.privateKeyPass) {
                    result.target.private_key_passphrase =
                        envVarReference('privateKeyPass');
                    result.environment[envVar('privateKeyPass')] =
                        credentials.privateKeyPass;
                }
            } else {
                throw new Error(
                    `Incorrect snowflake profile. Profile should have SSO credentials, password or private key.`,
                );
            }
            return result;
        }
        case WarehouseTypes.DATABRICKS: {
            const tokenValue =
                credentials.token ?? credentials.personalAccessToken;
            if (!tokenValue) {
                throw new Error(
                    'Databricks credentials must have either token or personalAccessToken',
                );
            }
            return {
                target: {
                    type: WarehouseTypes.DATABRICKS,
                    catalog: credentials.catalog,
                    // this supposed to be a `schema` but changing it will break for existing customers
                    schema: credentials.database,
                    host: credentials.serverHostName,
                    token: envVarReference('token'),
                    http_path: credentials.httpPath,
                },
                environment: {
                    [envVar('token')]:
                        credentials.personalAccessToken ||
                        credentials.token ||
                        '',
                },
            };
        }
        case WarehouseTypes.CLICKHOUSE:
            return {
                target: {
                    type: WarehouseTypes.CLICKHOUSE,
                    host: credentials.host,
                    port: credentials.port,
                    user: envVarReference('user'),
                    password: envVarReference('password'),
                    schema: credentials.schema,
                    secure: credentials.secure,
                },
                environment: {
                    [envVar('user')]: credentials.user,
                    [envVar('password')]: credentials.password,
                },
            };
        case WarehouseTypes.DUCKDB:
            return {
                target: {
                    type: 'duckdb',
                    path: `md:${credentials.database}`,
                    schema: credentials.schema,
                    threads: credentials.threads || DEFAULT_THREADS,
                    extensions: ['motherduck'],
                    settings: {
                        motherduck_token: envVarReference('token'),
                    },
                },
                environment: {
                    [envVar('token')]: credentials.token,
                },
            };
        case WarehouseTypes.DUCKLAKE: {
            const alias = credentials.catalogAlias ?? 'ducklake';
            const extensions: string[] = ['ducklake'];
            const environment: Record<string, string> = {};
            const secrets: Record<string, AnyType>[] = [];
            const CATALOG_SECRET = 'ld_ducklake_catalog';
            const DATA_SECRET = 'ld_ducklake_data';
            const DUCKLAKE_SECRET = 'ld_ducklake';

            let catalogIsPostgres = false;
            let inlineCatalogPath: string | null = null;
            switch (credentials.catalog.type) {
                case DucklakeCatalogType.POSTGRES: {
                    extensions.push('postgres');
                    catalogIsPostgres = true;
                    environment[envVar('catalog_user')] =
                        credentials.catalog.user;
                    environment[envVar('catalog_password')] =
                        credentials.catalog.password;
                    secrets.push({
                        name: CATALOG_SECRET,
                        type: 'postgres',
                        host: credentials.catalog.host,
                        port: credentials.catalog.port,
                        database: credentials.catalog.database,
                        user: envVarReference('catalog_user'),
                        password: envVarReference('catalog_password'),
                    });
                    break;
                }
                case DucklakeCatalogType.SQLITE:
                    extensions.push('sqlite');
                    inlineCatalogPath = `ducklake:sqlite:${credentials.catalog.path}`;
                    break;
                case DucklakeCatalogType.DUCKDB:
                    inlineCatalogPath = `ducklake:${credentials.catalog.path}`;
                    break;
                default:
                    return assertUnreachable(
                        credentials.catalog,
                        'Unknown DuckLake catalog type',
                    );
            }

            let dataPathValue: string;
            switch (credentials.dataPath.type) {
                case DucklakeDataPathType.S3: {
                    extensions.push('httpfs');
                    dataPathValue = credentials.dataPath.url;
                    const s3: Record<string, AnyType> = {
                        name: DATA_SECRET,
                        type: 's3',
                        scope: credentials.dataPath.url,
                    };
                    if (credentials.dataPath.region)
                        s3.region = credentials.dataPath.region;
                    if (credentials.dataPath.endpoint)
                        s3.endpoint = credentials.dataPath.endpoint;
                    if (credentials.dataPath.forcePathStyle !== undefined)
                        s3.url_style = credentials.dataPath.forcePathStyle
                            ? 'path'
                            : 'vhost';
                    if (credentials.dataPath.useSsl !== undefined)
                        s3.use_ssl = credentials.dataPath.useSsl;
                    if (
                        credentials.dataPath.accessKeyId &&
                        credentials.dataPath.secretAccessKey
                    ) {
                        environment[envVar('s3_key')] =
                            credentials.dataPath.accessKeyId;
                        environment[envVar('s3_secret')] =
                            credentials.dataPath.secretAccessKey;
                        s3.key_id = envVarReference('s3_key');
                        s3.secret = envVarReference('s3_secret');
                    } else {
                        s3.provider = 'credential_chain';
                    }
                    secrets.push(s3);
                    break;
                }
                case DucklakeDataPathType.GCS: {
                    extensions.push('httpfs');
                    dataPathValue = credentials.dataPath.url;
                    const gcs: Record<string, AnyType> = {
                        name: DATA_SECRET,
                        type: 'gcs',
                        scope: credentials.dataPath.url,
                    };
                    if (
                        credentials.dataPath.hmacKeyId &&
                        credentials.dataPath.hmacSecret
                    ) {
                        environment[envVar('gcs_key')] =
                            credentials.dataPath.hmacKeyId;
                        environment[envVar('gcs_secret')] =
                            credentials.dataPath.hmacSecret;
                        gcs.key_id = envVarReference('gcs_key');
                        gcs.secret = envVarReference('gcs_secret');
                    } else {
                        gcs.provider = 'credential_chain';
                    }
                    secrets.push(gcs);
                    break;
                }
                case DucklakeDataPathType.AZURE: {
                    extensions.push('azure');
                    dataPathValue = credentials.dataPath.url;
                    const az: Record<string, AnyType> = {
                        name: DATA_SECRET,
                        type: 'azure',
                        scope: credentials.dataPath.url,
                    };
                    if (credentials.dataPath.connectionString) {
                        environment[envVar('azure_connection_string')] =
                            credentials.dataPath.connectionString;
                        az.connection_string = envVarReference(
                            'azure_connection_string',
                        );
                    } else if (
                        credentials.dataPath.accountName &&
                        credentials.dataPath.accountKey
                    ) {
                        environment[envVar('azure_account_key')] =
                            credentials.dataPath.accountKey;
                        az.account_name = credentials.dataPath.accountName;
                        az.account_key = envVarReference('azure_account_key');
                    } else if (credentials.dataPath.accountName) {
                        az.account_name = credentials.dataPath.accountName;
                        az.provider = 'credential_chain';
                    }
                    secrets.push(az);
                    break;
                }
                case DucklakeDataPathType.LOCAL:
                    dataPathValue = credentials.dataPath.path;
                    break;
                default:
                    return assertUnreachable(
                        credentials.dataPath,
                        'Unknown DuckLake data path type',
                    );
            }

            let attachPath: string;
            const attachEntry: Record<string, AnyType> = { alias };
            if (catalogIsPostgres) {
                secrets.push({
                    name: DUCKLAKE_SECRET,
                    type: 'ducklake',
                    metadata_path: '',
                    data_path: dataPathValue,
                    metadata_parameters: {
                        TYPE: 'postgres',
                        SECRET: CATALOG_SECRET,
                    },
                });
                attachPath = `ducklake:${DUCKLAKE_SECRET}`;
            } else {
                attachPath = inlineCatalogPath!;
                attachEntry.options = { data_path: dataPathValue };
            }
            attachEntry.path = attachPath;

            const target: Record<string, AnyType> = {
                type: 'duckdb',
                path: ':memory:',
                database: alias,
                schema: credentials.schema,
                threads: credentials.threads || DEFAULT_THREADS,
                extensions: Array.from(new Set(extensions)),
                settings: {
                    autoinstall_known_extensions: true,
                    autoload_known_extensions: true,
                },
                attach: [attachEntry],
            };
            if (secrets.length > 0) target.secrets = secrets;
            return { target, environment };
        }
        case WarehouseTypes.ATHENA:
            const athenaAuthenticationType =
                credentials.authenticationType ??
                AthenaAuthenticationType.ACCESS_KEY;

            const { accessKeyId, secretAccessKey } = credentials;

            if (
                athenaAuthenticationType ===
                    AthenaAuthenticationType.ACCESS_KEY &&
                (!accessKeyId || !secretAccessKey)
            ) {
                throw new ParameterError(
                    'Athena access key authentication requires accessKeyId and secretAccessKey',
                );
            }

            return {
                target: {
                    type: WarehouseTypes.ATHENA,
                    region_name: credentials.region,
                    database: credentials.database,
                    schema: credentials.schema,
                    s3_staging_dir: credentials.s3StagingDir,
                    s3_data_dir: credentials.s3DataDir || undefined,
                    work_group: credentials.workGroup || undefined,
                    threads: credentials.threads || DEFAULT_THREADS,
                    num_retries: credentials.numRetries || undefined,
                    aws_assume_role_arn: credentials.assumeRoleArn || undefined,
                    aws_assume_role_external_id:
                        credentials.assumeRoleExternalId || undefined,
                    ...(athenaAuthenticationType ===
                    AthenaAuthenticationType.ACCESS_KEY
                        ? {
                              aws_access_key_id: envVarReference('accessKeyId'),
                              aws_secret_access_key:
                                  envVarReference('secretAccessKey'),
                          }
                        : {}),
                },
                environment:
                    athenaAuthenticationType ===
                    AthenaAuthenticationType.ACCESS_KEY
                        ? {
                              [envVar('accessKeyId')]: accessKeyId!,
                              [envVar('secretAccessKey')]: secretAccessKey!,
                          }
                        : {},
            };
        default:
            const { type } = credentials;
            return assertUnreachable(
                credentials,
                `No profile implemented for warehouse type: ${type}`,
            );
    }
};
export const profileFromCredentials = (
    credentials: CreateWarehouseCredentials,
    profilesDir: string,
    customTargetName: string | undefined = undefined,
) => {
    const targetName = customTargetName || LIGHTDASH_TARGET_NAME;
    const { target, environment, files } = credentialsTarget(
        credentials,
        profilesDir,
    );

    const profile = yaml.dump({
        [LIGHTDASH_PROFILE_NAME]: {
            target: targetName,
            outputs: {
                [targetName]: target,
            },
        },
    });

    return {
        profile,
        environment,
        files,
    };
};
