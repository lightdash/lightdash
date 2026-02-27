import { DBSQLClient } from '@databricks/sql';
import IDBSQLClient, {
    ConnectionOptions,
} from '@databricks/sql/dist/contracts/IDBSQLClient';
import IDBSQLSession from '@databricks/sql/dist/contracts/IDBSQLSession';
import IOperation from '@databricks/sql/dist/contracts/IOperation';
import { TTypeId as DatabricksDataTypes } from '@databricks/sql/thrift/TCLIService_types';
import {
    AnyType,
    CreateDatabricksCredentials,
    DatabricksAuthenticationType,
    DimensionType,
    getErrorMessage,
    Metric,
    MetricType,
    ParseError,
    SupportedDbtAdapter,
    TimeIntervalUnit,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import fetch from 'node-fetch';
import { WarehouseCatalog } from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import { normalizeUnicode } from '../utils/sql';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

/**
 * Pre-registered Databricks public OAuth client ID for U2M authentication.
 * This is a built-in client that doesn't require registering a custom OAuth app.
 * This client id only works on the CLI redirect URIs. For the UI we require a custom OAuth app
 * with a valid whitelisted redirect URI.
 * https://docs.databricks.com/en/dev-tools/auth/oauth-u2m.html
 */
export const DATABRICKS_DEFAULT_OAUTH_CLIENT_ID = 'databricks-cli';

/** Client IDs that only work with CLI redirect URIs, not browser OAuth flows */
const DATABRICKS_CLI_OAUTH_CLIENT_IDS = new Set([
    'databricks-cli',
    'dbt-databricks',
]);

export const isDatabricksCliOAuthClientId = (
    clientId: string | undefined,
): boolean => !!clientId && DATABRICKS_CLI_OAUTH_CLIENT_IDS.has(clientId);

type SchemaResult = {
    TABLE_CAT: string;
    TABLE_SCHEM: string;
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: number;
    TYPE_NAME: string;
    // additional props
    // COLUMN_SIZE: null,
    // BUFFER_LENGTH: null,
    // DECIMAL_DIGITS: null,
    // NUM_PREC_RADIX: null,
    // NULLABLE: 1,
    // REMARKS: '',
    // COLUMN_DEF: null,
    // SQL_DATA_TYPE: null,
    // SQL_DATETIME_SUB: null,
    // CHAR_OCTET_LENGTH: null,
    // ORDINAL_POSITION: 5,
    // IS_NULLABLE: 'YES',
    // SCOPE_CATALOG: null,
    // SCOPE_SCHEMA: null,
    // SCOPE_TABLE: null,
    // SOURCE_DATA_TYPE: null,
    // IS_AUTO_INCREMENT: 'NO'
};

const convertDataTypeToDimensionType = (
    type: DatabricksDataTypes,
): DimensionType => {
    switch (type) {
        case DatabricksDataTypes.BOOLEAN_TYPE:
            return DimensionType.BOOLEAN;
        case DatabricksDataTypes.TINYINT_TYPE:
        case DatabricksDataTypes.SMALLINT_TYPE:
        case DatabricksDataTypes.INT_TYPE:
        case DatabricksDataTypes.BIGINT_TYPE:
        case DatabricksDataTypes.FLOAT_TYPE:
        case DatabricksDataTypes.DOUBLE_TYPE:
        case DatabricksDataTypes.DECIMAL_TYPE:
            return DimensionType.NUMBER;
        case DatabricksDataTypes.DATE_TYPE:
            return DimensionType.DATE;
        case DatabricksDataTypes.TIMESTAMP_TYPE:
            return DimensionType.TIMESTAMP;
        case DatabricksDataTypes.STRING_TYPE:
        case DatabricksDataTypes.BINARY_TYPE:
        case DatabricksDataTypes.ARRAY_TYPE:
        case DatabricksDataTypes.STRUCT_TYPE:
        case DatabricksDataTypes.UNION_TYPE:
        case DatabricksDataTypes.USER_DEFINED_TYPE:
        case DatabricksDataTypes.INTERVAL_YEAR_MONTH_TYPE:
        case DatabricksDataTypes.INTERVAL_DAY_TIME_TYPE:
        case DatabricksDataTypes.NULL_TYPE:
        case DatabricksDataTypes.MAP_TYPE:
        case DatabricksDataTypes.CHAR_TYPE:
        case DatabricksDataTypes.VARCHAR_TYPE:
            return DimensionType.STRING;
        default:
            return DimensionType.STRING;
    }
};

enum DatabricksTypes {
    BOOLEAN = 'BOOLEAN',
    BYTE = 'BYTE',
    TINYINT = 'TINYINT',
    SHORT = 'SHORT',
    SMALLINT = 'SMALLINT',
    INT = 'INT',
    INTEGER = 'INTEGER',
    LONG = 'LONG',
    BIGINT = 'BIGINT',
    FLOAT = 'FLOAT',
    REAL = 'REAL',
    DOUBLE = 'DOUBLE',
    DATE = 'DATE',
    TIMESTAMP = 'TIMESTAMP',
    STRING = 'STRING',
    BINARY = 'BINARY',
    DECIMAL = 'DECIMAL',
    DEC = 'DEC',
    NUMERIC = 'NUMERIC',
    INTERVAL = 'INTERVAL', // INTERVAL HOUR
    ARRAY = 'ARRAY', // ARRAY<type>
    STRUCT = 'STRUCT', // STRUCT<type,type...>
    MAP = 'MAP',
    CHAR = 'CHAR',
    VARCHAR = 'VARCHAR',
}

const normaliseDatabricksType = (type: string): DatabricksTypes => {
    const r = /^[A-Z]+/;
    const match = r.exec(type);
    if (match === null) {
        throw new ParseError(
            `Cannot understand type from Databricks: ${type}`,
            {},
        );
    }
    return match[0] as DatabricksTypes;
};

const mapFieldType = (type: string): DimensionType => {
    const normalizedType = normaliseDatabricksType(type);

    switch (normalizedType) {
        case DatabricksTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case DatabricksTypes.TINYINT:
        case DatabricksTypes.SHORT:
        case DatabricksTypes.SMALLINT:
        case DatabricksTypes.INT:
        case DatabricksTypes.INTEGER:
        case DatabricksTypes.BIGINT:
        case DatabricksTypes.LONG:
        case DatabricksTypes.FLOAT:
        case DatabricksTypes.REAL:
        case DatabricksTypes.DOUBLE:
        case DatabricksTypes.DECIMAL:
        case DatabricksTypes.DEC:
        case DatabricksTypes.NUMERIC:
            return DimensionType.NUMBER;
        case DatabricksTypes.STRING:
        case DatabricksTypes.BINARY:
        case DatabricksTypes.INTERVAL:
        case DatabricksTypes.ARRAY:
        case DatabricksTypes.STRUCT:
        case DatabricksTypes.MAP:
        case DatabricksTypes.CHAR:
        case DatabricksTypes.VARCHAR:
        case DatabricksTypes.BYTE:
            return DimensionType.STRING;
        case DatabricksTypes.DATE:
            return DimensionType.DATE;
        case DatabricksTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

export class DatabricksSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.DATABRICKS;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.DATABRICKS;
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `PERCENTILE(${sql}, ${(metric.percentile ?? 50) / 100})`;
            case MetricType.MEDIAN:
                return `PERCENTILE(${sql}, 0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    getFieldQuoteChar(): string {
        return '`';
    }

    escapeString(value: string): string {
        if (typeof value !== 'string') {
            return value;
        }

        return (
            normalizeUnicode(value)
                // Databricks/Spark uses backslash escaping like BigQuery
                .replaceAll('\\', '\\\\')
                .replaceAll("'", "\\'")
                .replaceAll('"', '\\"')
                // Remove SQL comments (Spark SQL supports --, /* */ comments)
                .replace(/--.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Remove null bytes
                .replaceAll('\0', '')
        );
    }

    getIntervalSql(value: number, unit: TimeIntervalUnit): string {
        // Databricks/Spark uses INTERVAL with value and keyword unit (no quotes)
        const unitStr = DatabricksSqlBuilder.intervalUnitsSingular[unit];
        return `INTERVAL ${value} ${unitStr}`;
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // Databricks uses unix_timestamp for conversion to seconds
        return `(UNIX_TIMESTAMP(${endTimestampSql}) - UNIX_TIMESTAMP(${startTimestampSql}))`;
    }

    getMedianSql(valueSql: string): string {
        // Databricks uses PERCENTILE function
        return `PERCENTILE(${valueSql}, 0.5)`;
    }

    buildArray(elements: string[]): string {
        // Databricks/Spark SQL array construction syntax
        return `ARRAY(${elements.join(', ')})`;
    }

    buildArrayAgg(expression: string, orderBy?: string): string {
        // Databricks uses COLLECT_LIST for array aggregation
        // Note: COLLECT_LIST doesn't support ORDER BY directly, need to sort array after collection
        if (orderBy) {
            return `SORT_ARRAY(COLLECT_LIST(${expression}))`;
        }
        return `COLLECT_LIST(${expression})`;
    }
}

const DATABRICKS_SOCKET_TIMEOUT_MS = 60000;
const DATABRICKS_QUERY_TIMEOUT_SECONDS = 300;

export class DatabricksWarehouseClient extends WarehouseBaseClient<CreateDatabricksCredentials> {
    schema: string;

    catalog?: string;

    connectionOptions: ConnectionOptions;

    private readonly enableTimeouts: boolean;

    constructor(credentials: CreateDatabricksCredentials) {
        super(credentials, new DatabricksSqlBuilder(credentials.startOfWeek));
        this.schema = credentials.database;
        this.catalog = credentials.catalog;
        this.enableTimeouts = process.env.DATABRICKS_ENABLE_TIMEOUTS === 'true';

        // Build connection options based on authentication type
        if (
            credentials.authenticationType ===
                DatabricksAuthenticationType.OAUTH_M2M ||
            credentials.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M
        ) {
            if (!credentials.token) {
                throw new UnexpectedServerError(
                    `Databricks OAuth access token is required for OAuth ${credentials.authenticationType} authentication`,
                );
            }
            this.connectionOptions = {
                authType: 'access-token',
                token: credentials.token,
                host: credentials.serverHostName,
                path: credentials.httpPath.startsWith('/')
                    ? credentials.httpPath
                    : `/${credentials.httpPath}`,
                ...(this.enableTimeouts && {
                    socketTimeout: DATABRICKS_SOCKET_TIMEOUT_MS,
                }),
            };
        } else {
            // Default to personal access token authentication
            if (!credentials.personalAccessToken) {
                throw new UnexpectedServerError(
                    'Databricks personal access token is required for token authentication',
                );
            }
            this.connectionOptions = {
                token: credentials.personalAccessToken,
                host: credentials.serverHostName,
                path: credentials.httpPath.startsWith('/')
                    ? credentials.httpPath
                    : `/${credentials.httpPath}`,
                ...(this.enableTimeouts && {
                    socketTimeout: DATABRICKS_SOCKET_TIMEOUT_MS,
                }),
            };
        }
    }

    private async getSession() {
        const client = new DBSQLClient({});
        let connection: IDBSQLClient;
        let session: IDBSQLSession;

        try {
            connection = await client.connect(this.connectionOptions);
        } catch (e: AnyType) {
            throw new WarehouseConnectionError(getErrorMessage(e));
        }

        try {
            session = await connection.openSession({
                initialCatalog: this.catalog,
                initialSchema: this.schema,
            });
        } catch (e: AnyType) {
            try {
                await connection.close();
            } catch (closeError: AnyType) {
                console.error(
                    'Error closing connection after session failure',
                    closeError,
                );
            }
            throw new WarehouseConnectionError(getErrorMessage(e));
        }

        return {
            session,
            close: async () => {
                await session.close();
                await connection.close();
            },
        };
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            values?: AnyType[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        const { session, close } = await this.getSession();
        let query: IOperation | null = null;

        let alteredQuery = sql;
        if (options?.tags) {
            alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(
                options?.tags,
            )}`;
        }

        try {
            if (options?.timezone) {
                console.debug(
                    `Setting databricks timezone to ${options?.timezone}`,
                );
                await session.executeStatement(
                    `SET TIME ZONE '${options?.timezone}'`,
                    {
                        runAsync: false,
                    },
                );
            }

            query = await session.executeStatement(alteredQuery, {
                runAsync: true,
                ...(this.enableTimeouts && {
                    queryTimeout: DATABRICKS_QUERY_TIMEOUT_SECONDS,
                }),
                ordinalParameters: options?.values,
            });

            const schema = await query.getSchema();
            const fields = (schema?.columns ?? []).reduce<
                Record<string, { type: DimensionType }>
            >(
                (acc, column) => ({
                    ...acc,
                    [column.columnName]: {
                        type: convertDataTypeToDimensionType(
                            column.typeDesc.types[0]?.primitiveEntry?.type ??
                                DatabricksDataTypes.STRING_TYPE,
                        ),
                    },
                }),
                {},
            );

            do {
                // eslint-disable-next-line no-await-in-loop
                const chunk = await query.fetchChunk();
                // eslint-disable-next-line no-await-in-loop
                await streamCallback({ fields, rows: chunk });
                // eslint-disable-next-line no-await-in-loop
            } while (await query.hasMoreRows());
        } catch (e: AnyType) {
            throw new WarehouseQueryError(getErrorMessage(e));
        } finally {
            try {
                if (query) await query.close();
                await close();
            } catch (e: AnyType) {
                // Only console error. Don't allow close errors to override the original error
                console.error(
                    'Error closing Databricks session on streamQuery',
                    e,
                );
            }
        }
    }

    async getCatalog(
        requests: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) {
        const { session, close } = await this.getSession();
        let results: SchemaResult[][];

        try {
            results = await processPromisesInBatches(
                requests,
                DEFAULT_BATCH_SIZE,
                async (request) => {
                    let query: IOperation | null = null;
                    try {
                        query = await session.getColumns({
                            catalogName: request.database,
                            schemaName: request.schema,
                            tableName: request.table,
                        });
                        return (await query.fetchAll()) as SchemaResult[];
                    } catch (e: AnyType) {
                        throw new WarehouseQueryError(getErrorMessage(e));
                    } finally {
                        try {
                            if (query) await query.close();
                        } catch (e: AnyType) {
                            // Only console error. Don't allow close errors to override the original error
                            console.error(
                                'Error closing Databricks query on getCatalog',
                                e,
                            );
                        }
                    }
                },
            );
        } catch (e: AnyType) {
            throw new WarehouseQueryError(getErrorMessage(e));
        } finally {
            try {
                await close();
            } catch (e: AnyType) {
                // Only console error. Don't allow close errors to override the original error
                console.error(
                    'Error closing Databricks session on getCatalog',
                    e,
                );
            }
        }

        const catalog = this.catalog || 'DEFAULT';
        return results.reduce<WarehouseCatalog>(
            (acc, result, index) => {
                const columns = Object.fromEntries<DimensionType>(
                    result.map((col) => [
                        col.COLUMN_NAME,
                        mapFieldType(col.TYPE_NAME),
                    ]),
                );
                const { schema, table } = requests[index];

                acc[catalog][schema] = acc[catalog][schema] || {};
                acc[catalog][schema][table] = columns;

                return acc;
            },
            { [catalog]: {} } as WarehouseCatalog,
        );
    }

    async getAllTables() {
        const query = `
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'MANAGED' 
            ORDER BY 1,2,3
        `;
        const { rows } = await this.runQuery(query, {}, undefined, undefined);
        return rows.map((row) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
    }

    async getTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const schemaFilter = schema ? `AND table_schema = ?` : '';
        const query = `
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE' 
            ${schemaFilter}
            ORDER BY 1,2,3
        `;
        const { rows } = await this.runQuery(
            query,
            tags,
            undefined,
            schema ? [schema] : undefined,
        );
        return this.parseWarehouseCatalog(rows, mapFieldType);
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const query = `
            SELECT table_catalog,
                   table_schema,
                   table_name,
                   column_name, 
                   data_type
            FROM information_schema.columns
            WHERE table_name = ?
            ${schema ? 'AND table_schema = ?' : ''}
            ${database ? 'AND table_catalog = ?' : ''}
        `;
        const values = [tableName];
        if (schema) {
            values.push(schema);
        }
        if (database) {
            values.push(database);
        }
        const { rows } = await this.runQuery(query, tags, undefined, values);
        return this.parseWarehouseCatalog(rows, mapFieldType);
    }
}

type DatabricksTokenResponse = {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
};

/**
 * Decode the payload of a Databricks JWT access token (no verification).
 * Returns the parsed claims object, or undefined if decoding fails.
 */
const decodeDatabricksJwtPayload = (
    token: string,
): Record<string, unknown> | undefined => {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return undefined;
        const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
        return JSON.parse(payload) as Record<string, unknown>;
    } catch {
        return undefined;
    }
};

/**
 * Single entry point for all Databricks OIDC token requests.
 */
export const databricksTokenRequest = async (
    host: string,
    params: Record<string, string>,
): Promise<DatabricksTokenResponse> => {
    const tokenUrl = `https://${host}/oidc/v1/token`;
    console.log(`[Databricks] ${params.grant_type} request:`, {
        tokenUrl,
        params,
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(
            `Failed Databricks token request (${params.grant_type}): ${response.status} ${responseText}`,
        );
    }

    const parsed = JSON.parse(responseText) as DatabricksTokenResponse;
    console.log(`[Databricks] ${params.grant_type} response:`, parsed);

    return parsed;
};

/** Exchange authorization code for tokens (U2M browser flow) */
export const exchangeDatabricksAuthorizationCode = async (
    host: string,
    clientId: string,
    code: string,
    redirectUri: string,
    codeVerifier: string,
    clientSecret?: string,
): Promise<{
    accessToken: string;
    /** Undefined when the OAuth app does not have offline_access scope enabled. */
    refreshToken: string | undefined;
    /** The client_id claim from the JWT — the actual client Databricks authenticated. */
    jwtClientId: string | undefined;
}> => {
    const params: Record<string, string> = {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
    };
    if (clientSecret) params.client_secret = clientSecret;

    const data = await databricksTokenRequest(host, params);
    const claims = decodeDatabricksJwtPayload(data.access_token);
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        jwtClientId:
            typeof claims?.client_id === 'string'
                ? claims.client_id
                : undefined,
    };
};

/** Exchange M2M client credentials for tokens */
export const exchangeDatabricksOAuthCredentials = async (
    host: string,
    clientId: string,
    clientSecret: string,
): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    /** The client_id claim from the JWT — the actual client Databricks authenticated. */
    jwtClientId: string | undefined;
}> => {
    const data = await databricksTokenRequest(host, {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'sql',
    });
    const claims = decodeDatabricksJwtPayload(data.access_token);
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        jwtClientId:
            typeof claims?.client_id === 'string'
                ? claims.client_id
                : undefined,
    };
};

/** Refresh an OAuth token */
export const refreshDatabricksOAuthToken = async (
    host: string,
    clientId: string,
    refreshToken: string,
    clientSecret?: string,
): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}> => {
    const params: Record<string, string> = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
    };
    if (clientSecret) params.client_secret = clientSecret;

    const data = await databricksTokenRequest(host, params);
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token!,
        expiresIn: data.expires_in!,
    };
};
