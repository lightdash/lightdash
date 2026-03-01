import {
    AnyType,
    assertUnreachable,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    CreateWarehouseCredentials,
    DatabricksAuthenticationType,
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
            let tokenValue: string | undefined;
            if (
                !credentials.authenticationType ||
                credentials.authenticationType ===
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN
            ) {
                tokenValue = credentials.personalAccessToken;
            } else if (
                credentials.authenticationType ===
                    DatabricksAuthenticationType.OAUTH_M2M ||
                credentials.authenticationType ===
                    DatabricksAuthenticationType.OAUTH_U2M
            ) {
                tokenValue = credentials.token;
            }
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
                    [envVar('token')]: tokenValue,
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
