import {
    assertUnreachable,
    CreateWarehouseCredentials,
    DatabricksAuthenticationType,
    getErrorMessage,
    isSupportedDbtAdapterType,
    isWeekDay,
    ParseError,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseTableSchema,
    WarehouseTypes,
} from '@lightdash/common';
import {
    exchangeDatabricksOAuthCredentials,
    warehouseClientFromCredentials,
} from '@lightdash/warehouses';
import crypto from 'crypto';
import execa from 'execa';
import path from 'path';
import { getConfig } from '../../config';
import {
    loadDbtTarget,
    warehouseCredentialsFromDbtTarget,
} from '../../dbt/profile';
import { performDatabricksOAuthFlow } from '../../dbt/targets/Databricks/oauth';
import GlobalState from '../../globalState';
import * as styles from '../../styles';
import { lightdashApi } from './apiClient';

/**
 * Cache warehouse clients to avoid repeated authentication prompts
 * Currently used for:
 * - Snowflake external browser auth (avoids opening multiple browser tabs)
 */
const warehouseClientCache = new Map<
    string,
    ReturnType<typeof warehouseClientFromCredentials>
>();

/**
 * Generates a unique cache key for warehouse credentials by hashing the credentials
 */
function getWarehouseClientCacheKey(
    credentials: CreateWarehouseCredentials,
): string {
    // Create a hash of the stringified credentials
    // This provides a unique key regardless of warehouse type
    const credentialsString = JSON.stringify(credentials);
    const hash = crypto
        .createHash('sha256')
        .update(credentialsString)
        .digest('hex');
    return hash;
}

type GetTableCatalogProps = {
    projectUuid: string;
    tableName: string;
    schemaName: string;
    databaseName?: string;
};

export const getTableSchema = async ({
    projectUuid,
    tableName,
    schemaName,
    databaseName,
}: GetTableCatalogProps) =>
    lightdashApi<WarehouseTableSchema>({
        method: 'GET',
        url: `/api/v1/projects/${projectUuid}/sqlRunner/fields?tableName=${tableName}&schemaName=${schemaName}&databaseName=${databaseName}`,
        body: undefined,
    });

const DBT_CLOUD_CONNECTION_TYPE_REGEX = /Connection type\s+(\w+)/;

const getDbtCloudConnectionType = async (): Promise<SupportedDbtAdapter> => {
    try {
        const { all } = await execa('dbt', ['environment', 'show'], {
            all: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const logs = all || '';
        const connectionType = logs.match(DBT_CLOUD_CONNECTION_TYPE_REGEX);
        if (connectionType === null || connectionType.length === 0) {
            throw new ParseError(
                `Can't locate connection type in 'dbt environment show' response`,
            );
        }
        if (!isSupportedDbtAdapterType(connectionType[1])) {
            throw new ParseError(
                `Unsupported dbt adaptor type ${connectionType[1]}`,
            );
        }
        return connectionType[1];
    } catch (e: unknown) {
        throw new ParseError(
            `Failed to get connection type:\n  ${getErrorMessage(e)}`,
        );
    }
};

function getMockCredentials(
    dbtAdaptorType: SupportedDbtAdapter,
): CreateWarehouseCredentials {
    let credentials: CreateWarehouseCredentials;
    switch (dbtAdaptorType) {
        case SupportedDbtAdapter.BIGQUERY:
            credentials = {
                type: WarehouseTypes.BIGQUERY,
                project: '',
                dataset: '',
                timeoutSeconds: undefined,
                priority: undefined,
                keyfileContents: {},
                retries: undefined,
                location: undefined,
                maximumBytesBilled: undefined,
            };
            break;
        case SupportedDbtAdapter.POSTGRES:
            credentials = {
                type: WarehouseTypes.POSTGRES,
                host: '',
                user: '',
                password: '',
                port: 5432,
                dbname: '',
                schema: '',
            };
            break;
        case SupportedDbtAdapter.REDSHIFT:
            credentials = {
                type: WarehouseTypes.REDSHIFT,
                host: '',
                user: '',
                password: '',
                port: 5432,
                dbname: '',
                schema: '',
            };
            break;
        case SupportedDbtAdapter.SNOWFLAKE:
            credentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: '',
                user: '',
                password: '',
                warehouse: '',
                database: '',
                schema: '',
                role: '',
            };
            break;

        case SupportedDbtAdapter.DATABRICKS:
            credentials = {
                type: WarehouseTypes.DATABRICKS,
                catalog: '',
                database: '',
                serverHostName: '',
                httpPath: '',
                personalAccessToken: '',
            };
            break;
        case SupportedDbtAdapter.TRINO:
            credentials = {
                type: WarehouseTypes.TRINO,
                host: '',
                user: '',
                password: '',
                port: 5432,
                dbname: '',
                schema: '',
                http_scheme: '',
            };
            break;
        case SupportedDbtAdapter.CLICKHOUSE:
            credentials = {
                type: WarehouseTypes.CLICKHOUSE,
                host: '',
                user: '',
                password: '',
                port: 8443,
                schema: '',
                secure: true,
                timeoutSeconds: 300,
            };
            break;
        default:
            assertUnreachable(
                dbtAdaptorType,
                `Unsupported dbt adaptor type ${dbtAdaptorType}`,
            );
    }
    return credentials;
}

type GetWarehouseClientOptions = {
    isDbtCloudCLI: boolean;
    profilesDir: string;
    profile: string;
    target?: string;
    startOfWeek?: number;
};

type GetWarehouseClientReturn = {
    warehouseClient: ReturnType<typeof warehouseClientFromCredentials>;
    credentials: CreateWarehouseCredentials;
};

export default async function getWarehouseClient(
    options: GetWarehouseClientOptions,
): Promise<GetWarehouseClientReturn> {
    let warehouseClient;
    let credentials;
    if (options.isDbtCloudCLI) {
        const dbtAdaptorType = await getDbtCloudConnectionType();
        GlobalState.debug(`> Using ${dbtAdaptorType} client mock`);
        credentials = getMockCredentials(dbtAdaptorType);

        warehouseClient = warehouseClientFromCredentials({
            ...credentials,
            startOfWeek: isWeekDay(options.startOfWeek)
                ? options.startOfWeek
                : undefined,
        });
        const config = await getConfig();
        // Overwrite methods that need to connect to the warehouse
        warehouseClient.getCatalog = async (refs) =>
            refs.reduce<Promise<WarehouseCatalog>>(async (accPromise, ref) => {
                const acc = await accPromise; // Wait for the previous step's result
                if (!config.context?.project) {
                    // If the project is not set(eg: on first project create), we can't fetch the schema
                    return acc;
                }
                try {
                    GlobalState.debug(
                        `> Warehouse schema information is not available in dbt Cloud CLI. The schema ${ref.database}.${ref.schema}.${ref.table} will be fetched from the active project.`,
                    );
                    const fields = await getTableSchema({
                        projectUuid: config.context.project,
                        tableName: ref.table,
                        schemaName: ref.schema,
                        databaseName: ref.database,
                    });
                    acc[ref.database] = {
                        [ref.schema]: {
                            [ref.table]: fields,
                        },
                    };
                } catch (e) {
                    GlobalState.debug(
                        `Failed to get schema for ${ref.database}.${ref.schema}.${ref.table}.`,
                    );
                }
                return acc;
            }, Promise.resolve({}));
        warehouseClient.streamQuery = async (_query, streamCallback) => {
            GlobalState.debug(
                `> WarehouseClient.streamQuery() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return streamCallback({ fields: {}, rows: [] });
        };
        warehouseClient.runQuery = async () => {
            GlobalState.debug(
                `> WarehouseClient.runQuery() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return { fields: {}, rows: [] };
        };
        warehouseClient.test = async () => {
            GlobalState.debug(
                `> WarehouseClient.test() is not supported with dbt Cloud CLI. No test will be run.`,
            );
        };
        warehouseClient.getAllTables = async () => {
            GlobalState.debug(
                `> WarehouseClient.getAllTables() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return [];
        };
        warehouseClient.getFields = async () => {
            GlobalState.debug(
                `> WarehouseClient.getFields() is not supported with dbt Cloud CLI. An empty result will be used.`,
            );
            return { fields: {} };
        };
    } else {
        const absoluteProfilesPath = path.resolve(options.profilesDir);
        GlobalState.debug(
            `> Using profiles dir ${absoluteProfilesPath} and profile ${options.profile}`,
        );
        const { target } = await loadDbtTarget({
            profilesDir: absoluteProfilesPath,
            profileName: options.profile,
            targetName: options.target,
        });
        GlobalState.debug(`> Using target ${target.type}`);
        credentials = await warehouseCredentialsFromDbtTarget(target);

        // Exchange Databricks OAuth M2M credentials for access token if needed
        if (
            credentials.type === WarehouseTypes.DATABRICKS &&
            credentials.authenticationType ===
                DatabricksAuthenticationType.OAUTH_M2M &&
            credentials.oauthClientId &&
            credentials.oauthClientSecret &&
            !credentials.token
        ) {
            GlobalState.debug(
                `> Exchanging Databricks OAuth credentials for access token`,
            );
            try {
                const { accessToken } =
                    await exchangeDatabricksOAuthCredentials(
                        credentials.serverHostName,
                        credentials.oauthClientId,
                        credentials.oauthClientSecret,
                    );
                credentials.token = accessToken;
            } catch (e) {
                GlobalState.debug(
                    `> Failed to exchange Databricks OAuth credentials for access token: ${getErrorMessage(
                        e,
                    )}`,
                );
                console.warn(
                    styles.error(
                        `\nFailed to authenticate with Databricks using M2M OAuth (client_id and client_secret). ` +
                            `Perhaps you meant to use U2M OAuth instead? Set DATABRICKS_OAUTH=u2m environment variable to force U2M authentication.`,
                    ),
                );
                process.exit(1);
            }
        }

        // Handle Databricks OAuth U2M authentication
        if (
            credentials.type === WarehouseTypes.DATABRICKS &&
            credentials.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M &&
            !credentials.token
        ) {
            // No tokens - perform OAuth flow (tokens kept in memory only)
            console.error(
                `\nDatabricks OAuth authentication required for ${credentials.serverHostName}`,
            );
            const clientId = credentials.oauthClientId || 'dbt-databricks'; // Use the same default dbt client for databricks
            const tokens = await performDatabricksOAuthFlow(
                credentials.serverHostName,
                clientId,
                credentials.oauthClientSecret,
            );

            // Store tokens in memory only
            credentials.token = tokens.accessToken;
            credentials.refreshToken = tokens.refreshToken;

            console.error(`\n✓ Successfully authenticated with Databricks\n`);
        }

        // Check if we should use cached client (e.g., for auth methods requiring user interaction)
        const cacheKey = getWarehouseClientCacheKey(credentials);

        if (warehouseClientCache.has(cacheKey)) {
            GlobalState.debug(
                `> Reusing cached warehouse client (${credentials.type})`,
            );
            warehouseClient = warehouseClientCache.get(cacheKey)!;
        } else {
            GlobalState.debug(
                `> Creating new warehouse client to cache (${credentials.type})`,
            );

            warehouseClient = warehouseClientFromCredentials({
                ...credentials,
                startOfWeek: isWeekDay(options.startOfWeek)
                    ? options.startOfWeek
                    : undefined,
            });

            warehouseClientCache.set(cacheKey, warehouseClient);
        }
    }
    return {
        warehouseClient,
        credentials,
    };
}
