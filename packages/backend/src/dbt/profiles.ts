import {
    AnyType,
    assertUnreachable,
    BigqueryAuthenticationType,
    CreateWarehouseCredentials,
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
                    maximum_bytes_billed: credentials.maximumBytesBilled,
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
                    sslrootcert: require.resolve(
                        '@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-redshift.crt',
                    ),
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
                              sslrootcert: require.resolve(
                                  '@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-rds-global.pem',
                              ),
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
        case WarehouseTypes.DATABRICKS:
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
                    [envVar('token')]: credentials.personalAccessToken,
                },
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
