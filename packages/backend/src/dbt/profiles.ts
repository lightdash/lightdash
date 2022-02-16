import { CreateWarehouseCredentials, WarehouseTypes } from 'common';
import * as yaml from 'js-yaml';
import path from 'path';

export const LIGHTDASH_PROFILE_NAME = 'lightdash_profile';
export const LIGHTDASH_TARGET_NAME = 'prod';

const envVar = (v: string) => `LIGHTDASH_DBT_PROFILE_VAR_${v.toUpperCase()}`;
const envVarReference = (v: string) => `{{ env_var('${envVar(v)}') }}`;
const credentialsTarget = (
    credentials: CreateWarehouseCredentials,
): { target: Record<string, any>; environment: Record<string, string> } => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return {
                target: {
                    type: credentials.type,
                    method: 'service-account-json',
                    project: credentials.project,
                    dataset: credentials.dataset,
                    threads: credentials.threads,
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
                    threads: credentials.threads,
                    keepalives_idle: credentials.keepalivesIdle,
                    sslmode: credentials.sslmode,
                    sslrootcert: path.resolve(
                        __dirname,
                        '../services/warehouseClients/amazon-trust-ca-bundle.crt',
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
                    threads: credentials.threads,
                    keepalives_idle: credentials.keepalivesIdle,
                    search_path: credentials.searchPath,
                    role: credentials.role,
                    sslmode: credentials.sslmode,
                },
                environment: {
                    [envVar('user')]: credentials.user,
                    [envVar('password')]: credentials.password,
                },
            };
        case WarehouseTypes.SNOWFLAKE:
            return {
                target: {
                    type: credentials.type,
                    account: credentials.account,
                    user: envVarReference('user'),
                    password: envVarReference('password'),
                    role: credentials.role,
                    database: credentials.database,
                    warehouse: credentials.warehouse,
                    schema: credentials.schema,
                    threads: credentials.threads,
                    client_session_keep_alive:
                        credentials.clientSessionKeepAlive,
                    query_tag: credentials.queryTag,
                },
                environment: {
                    [envVar('user')]: credentials.user,
                    [envVar('password')]: credentials.password,
                },
            };
        case WarehouseTypes.DATABRICKS:
            return {
                target: {
                    type: WarehouseTypes.DATABRICKS,
                    schema: credentials.database,
                    host: credentials.serverHostName,
                    token: envVarReference('token'),
                    http_path: credentials.httpPath,
                    port: credentials.port,
                },
                environment: {
                    [envVar('token')]: credentials.personalAccessToken,
                },
            };
        default: {
            const { type } = credentials;
            const nope: never = credentials;
            throw new Error(
                `No profile implemented for warehouse type: ${type}`,
            );
        }
    }
};
export const profileFromCredentials = (
    credentials: CreateWarehouseCredentials,
    customTargetName: string | undefined = undefined,
) => {
    const targetName = customTargetName || LIGHTDASH_TARGET_NAME;
    const { target, environment } = credentialsTarget(credentials);
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
    };
};
