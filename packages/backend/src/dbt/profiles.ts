import {
    assertUnreachable,
    CreateWarehouseCredentials,
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
    target: Record<string, any>;
    environment: Record<string, string>;
    files?: Record<string, string>;
};
const credentialsTarget = (
    credentials: CreateWarehouseCredentials,
    profilesDir: string,
): CredentialsTarget => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return {
                target: {
                    type: credentials.type,
                    method: 'service-account-json',
                    project: credentials.project,
                    dataset: credentials.dataset,
                    threads: DEFAULT_THREADS,
                    timeout_seconds: credentials.timeoutSeconds,
                    priority: credentials.priority,
                    retries: credentials.retries,
                    maximum_bytes_billed: credentials.maximumBytesBilled,
                    keyfile_json: Object.fromEntries(
                        Object.keys(credentials.keyfileContents).map((key) => [
                            key,
                            envVarReference(key),
                        ]),
                    ),
                },
                environment: Object.fromEntries(
                    Object.entries(credentials.keyfileContents).map(
                        ([key, value]) => [envVar(key), value],
                    ),
                ),
            };
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
            if (credentials.password) {
                result.target.password = envVarReference('password');
                result.environment[envVar('password')] = credentials.password;
            } else if (credentials.privateKey) {
                const privateKeyPath = path.join(profilesDir, 'rsa_key.p8');
                result.target.private_key_path =
                    envVarReference('privateKeyPath');
                result.environment[envVar('privateKeyPath')] = privateKeyPath;
                result.files = { [privateKeyPath]: credentials.privateKey };
                if (credentials.privateKeyPass) {
                    result.target.private_key_passphrase =
                        envVarReference('privateKeyPass');
                    result.environment[envVar('privateKeyPass')] =
                        credentials.privateKeyPass;
                }
            } else {
                throw new Error(
                    `Incorrect snowflake profile. Profile should have password or private key.`,
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
        case WarehouseTypes.ATHENA:
            return {
                target: {
                    type: WarehouseTypes.ATHENA,
                    // all dbt config
                    work_group: credentials.workgroup,
                    region_name: credentials.awsRegion,
                    s3_staging_dir: credentials.outputLocation,
                    schema: credentials.schema,
                    database: credentials.database,
                    aws_access_key_id: credentials.awsAccessKeyId,
                    aws_secret_access_key: credentials.awsSecretKey,
                },
                environment: {
                    [envVar('AWS_ACCESS_KEY_ID')]: credentials.awsAccessKeyId,
                    [envVar('AWS_SECRET_ACCESS_KEY')]: credentials.awsSecretKey,
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
        config: {
            partial_parse: false,
            send_anonymous_usage_stats: false,
        },
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
