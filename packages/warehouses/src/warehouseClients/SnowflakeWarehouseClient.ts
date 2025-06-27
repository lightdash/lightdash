import {
    AnyType,
    CreateSnowflakeCredentials,
    DimensionType,
    getErrorMessage,
    isWeekDay,
    Metric,
    MetricType,
    ParseError,
    SupportedDbtAdapter,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
    type WarehouseExecuteAsyncQuery,
    type WarehouseExecuteAsyncQueryArgs,
} from '@lightdash/common';
import * as crypto from 'crypto';
import {
    configure,
    Connection,
    ConnectionOptions,
    createConnection,
    SnowflakeError,
    type FileAndStageBindStatement,
    type RowStatement,
} from 'snowflake-sdk';
import { pipeline, Transform, Writable } from 'stream';
import * as Util from 'util';
import { WarehouseCatalog } from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

const assertIsSnowflakeLoggingLevel = (
    x: string | undefined,
): x is 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' =>
    x !== undefined && ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].includes(x);

// Prevent snowflake sdk from flooding the output with info logs
configure({
    logLevel: assertIsSnowflakeLoggingLevel(process.env.SNOWFLAKE_SDK_LOG_LEVEL)
        ? process.env.SNOWFLAKE_SDK_LOG_LEVEL
        : 'ERROR',
});

export enum SnowflakeTypes {
    NUMBER = 'NUMBER',
    DECIMAL = 'DECIMAL',
    NUMERIC = 'NUMERIC',
    INTEGER = 'INTEGER',
    INT = 'INT',
    BIGINT = 'BIGINT',
    SMALLINT = 'SMALLINT',
    FLOAT = 'FLOAT',
    FLOAT4 = 'FLOAT4',
    FLOAT8 = 'FLOAT8',
    DOUBLE = 'DOUBLE',
    DOUBLE_PRECISION = 'DOUBLE PRECISION',
    REAL = 'REAL',
    FIXED = 'FIXED',
    STRING = 'STRING',
    TEXT = 'TEXT',
    BOOLEAN = 'BOOLEAN',
    DATE = 'DATE',
    DATETIME = 'DATETIME',
    TIME = 'TIME',
    TIMESTAMP = 'TIMESTAMP',
    TIMESTAMP_LTZ = 'TIMESTAMP_LTZ',
    TIMESTAMP_NTZ = 'TIMESTAMP_NTZ',
    TIMESTAMP_TZ = 'TIMESTAMP_TZ',
    VARIANT = 'VARIANT',
    OBJECT = 'OBJECT',
    ARRAY = 'ARRAY',
    GEOGRAPHY = 'GEOGRAPHY',
}

const normaliseSnowflakeType = (type: string): string => {
    const r = /^[A-Z]+/;
    const match = r.exec(type);
    if (match === null) {
        throw new ParseError(
            `Cannot understand type from Snowflake: ${type}`,
            {},
        );
    }
    return match[0];
};

export const mapFieldType = (type: string): DimensionType => {
    switch (normaliseSnowflakeType(type)) {
        case SnowflakeTypes.NUMBER:
        case SnowflakeTypes.DECIMAL:
        case SnowflakeTypes.NUMERIC:
        case SnowflakeTypes.INTEGER:
        case SnowflakeTypes.INT:
        case SnowflakeTypes.BIGINT:
        case SnowflakeTypes.SMALLINT:
        case SnowflakeTypes.FLOAT:
        case SnowflakeTypes.FLOAT4:
        case SnowflakeTypes.FLOAT8:
        case SnowflakeTypes.DOUBLE:
        case SnowflakeTypes.DOUBLE_PRECISION:
        case SnowflakeTypes.REAL:
        case SnowflakeTypes.FIXED:
            return DimensionType.NUMBER;
        case SnowflakeTypes.DATE:
            return DimensionType.DATE;
        case SnowflakeTypes.DATETIME:
        case SnowflakeTypes.TIME:
        case SnowflakeTypes.TIMESTAMP:
        case SnowflakeTypes.TIMESTAMP_LTZ:
        case SnowflakeTypes.TIMESTAMP_NTZ:
        case SnowflakeTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        case SnowflakeTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

const parseCell = (cell: AnyType) => {
    if (cell instanceof Date) {
        return new Date(cell);
    }

    return cell;
};

const parseRow = (row: Record<string, AnyType>) =>
    Object.fromEntries(
        Object.entries(row).map(([name, value]) => [name, parseCell(value)]),
    );
const parseRows = (rows: Record<string, AnyType>[]) => rows.map(parseRow);

export class SnowflakeSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.SNOWFLAKE;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.SNOWFLAKE;
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `PERCENTILE_CONT(${
                    (metric.percentile ?? 50) / 100
                }) WITHIN GROUP (ORDER BY ${sql})`;
            case MetricType.MEDIAN:
                return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${sql})`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }
}

export class SnowflakeWarehouseClient extends WarehouseBaseClient<CreateSnowflakeCredentials> {
    connectionOptions: ConnectionOptions;

    quotedIdentifiersIgnoreCase?: boolean;

    constructor(credentials: CreateSnowflakeCredentials) {
        super(credentials, new SnowflakeSqlBuilder(credentials.startOfWeek));

        if (typeof credentials.quotedIdentifiersIgnoreCase !== 'undefined') {
            this.quotedIdentifiersIgnoreCase =
                credentials.quotedIdentifiersIgnoreCase;
        }

        let authenticationOptions: Partial<ConnectionOptions> = {};

        // if authenticationType is undefined, we assume it is a password authentication, for backwards compatibility
        if (credentials.authenticationType === 'sso') {
            authenticationOptions = {
                token: credentials.token,
                authenticator: 'OAUTH',
            };
        } else if (
            credentials.privateKey &&
            (!credentials.password ||
                credentials.authenticationType === 'private_key')
        ) {
            if (!credentials.privateKeyPass) {
                authenticationOptions = {
                    privateKey: credentials.privateKey,
                    authenticator: 'SNOWFLAKE_JWT',
                };
            } else {
                /**
                 * @ref https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate#use-key-pair-authentication-and-key-pair-rotation
                 */
                const privateKeyObject = crypto.createPrivateKey({
                    key: credentials.privateKey,
                    format: 'pem',
                    passphrase: credentials.privateKeyPass,
                });

                // Extract the private key from the object as a PEM-encoded string.
                const privateKey = privateKeyObject.export({
                    format: 'pem',
                    type: 'pkcs8',
                });

                authenticationOptions = {
                    privateKey: privateKey.toString(),
                    authenticator: 'SNOWFLAKE_JWT',
                };
            }
        } else if (credentials.password) {
            authenticationOptions = {
                password: credentials.password,
                authenticator: 'SNOWFLAKE',
            };
        }

        this.connectionOptions = {
            account: credentials.account,
            // When using SSO, username and role can cause conflict
            ...(credentials.authenticationType !== 'sso'
                ? {
                      username: credentials.user,
                      role: credentials.role,
                  }
                : {}),
            ...authenticationOptions,
            database: credentials.database,
            schema: credentials.schema,
            warehouse: credentials.warehouse,
            ...(credentials.accessUrl?.length
                ? { accessUrl: credentials.accessUrl }
                : {}),
        };
    }

    private async getConnection(
        connectionOptionsOverrides?: Partial<ConnectionOptions>,
    ) {
        let connection: Connection;
        try {
            connection = createConnection({
                ...this.connectionOptions,
                ...connectionOptionsOverrides,
            });
            await Util.promisify(connection.connect.bind(connection))();
        } catch (e: unknown) {
            throw new WarehouseConnectionError(
                `Snowflake error: ${getErrorMessage(e)}`,
            );
        }
        return connection;
    }

    private async prepareWarehouse(
        connection: Connection,
        options?: {
            timezone?: string;
            tags?: Record<string, string>;
        },
    ) {
        const sqlStatements: string[] = [];

        if (this.connectionOptions.warehouse) {
            // eslint-disable-next-line no-console
            console.debug(
                `Running snowflake query on warehouse: ${this.connectionOptions.warehouse}`,
            );
            sqlStatements.push(
                `USE WAREHOUSE ${this.connectionOptions.warehouse};`,
            );
        }

        const startOfWeek = this.getStartOfWeek();
        if (isWeekDay(startOfWeek)) {
            const snowflakeStartOfWeekIndex = startOfWeek + 1; // 1 (Monday) to 7 (Sunday):
            sqlStatements.push(
                `ALTER SESSION SET WEEK_START = ${snowflakeStartOfWeekIndex};`,
            );
        }

        if (options?.tags) {
            sqlStatements.push(
                `ALTER SESSION SET QUERY_TAG = '${JSON.stringify(
                    options?.tags,
                )}';`,
            );
        }

        const timezoneQuery = options?.timezone || 'UTC';
        console.debug(`Setting Snowflake session timezone to ${timezoneQuery}`);
        sqlStatements.push(`ALTER SESSION SET TIMEZONE = '${timezoneQuery}';`);

        /**
         * Force QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE to avoid casing inconsistencies
         * between Snowflake <> Lightdash
         */
        console.debug(
            'Setting Snowflake session QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE',
        );
        sqlStatements.push(
            `ALTER SESSION SET QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE;`,
        );

        await this.executeStatements(
            connection,
            sqlStatements.join('\n'),
            sqlStatements.length,
        );
    }

    private getFieldsFromStatement(
        stmt: RowStatement | FileAndStageBindStatement,
    ) {
        const columns = stmt.getColumns();
        return columns
            ? columns.reduce(
                  (acc, column) => ({
                      ...acc,
                      [column.getName()]: {
                          type: mapFieldType(column.getType().toUpperCase()),
                      },
                  }),
                  {},
              )
            : {};
    }

    async executeAsyncQuery(
        { sql, values, tags, timezone }: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void,
    ): Promise<WarehouseExecuteAsyncQuery> {
        const connection = await this.getConnection();
        await this.prepareWarehouse(connection, {
            timezone,
            tags,
        });

        const { queryId, durationMs, totalRows } =
            await this.executeAsyncStatement(
                connection,
                sql,
                resultsStreamCallback,
                {
                    values,
                },
            );

        return {
            queryId,
            queryMetadata: null,
            totalRows,
            durationMs,
        };
    }

    private async executeAsyncStatement(
        connection: Connection,
        sql: string,
        resultsStreamCallback?: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void,
        options?: {
            values?: AnyType[];
        },
    ) {
        const startTime = performance.now();
        const { queryId, totalRows, durationMs, fields } = await new Promise<{
            queryId: string;
            totalRows: number;
            durationMs: number;
            fields: WarehouseResults['fields'];
        }>((resolve, reject) => {
            connection.execute({
                sqlText: sql,
                binds: options?.values,
                asyncExec: true,
                complete: (err, stmt) => {
                    if (err) {
                        reject(this.parseError(err, sql));
                        return;
                    }

                    // Calling `getNumRows` from current statement returns undefined
                    void connection
                        .getResultsFromQueryId({
                            sqlText: '',
                            queryId: stmt.getQueryId(),
                            complete: (err2, stmt2) => {
                                if (err2) {
                                    reject(this.parseError(err2, sql));
                                    return;
                                }

                                resolve({
                                    queryId: stmt.getQueryId(),
                                    totalRows: stmt2.getNumRows(),
                                    durationMs: performance.now() - startTime,
                                    fields: this.getFieldsFromStatement(stmt2),
                                });
                            },
                        })
                        .catch((err3) => {
                            reject(this.parseError(err3, sql));
                        });
                },
            });
        });

        // If we have a callback, stream the rows to the callback.
        // This is used when writing to the results cache.
        if (resultsStreamCallback) {
            const completedStatement = await connection.getResultsFromQueryId({
                sqlText: '',
                queryId,
            });
            await new Promise<void>((resolve, reject) => {
                completedStatement
                    .streamRows()
                    .on('error', (e) => {
                        reject(e);
                    })
                    .on('data', (row) => {
                        resultsStreamCallback([row], fields);
                    })
                    .on('end', () => {
                        resolve();
                    });
            });
        }

        return {
            queryId,
            queryMetadata: null,
            totalRows,
            durationMs,
        };
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
            values?: AnyType[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        const connection = await this.getConnection();

        try {
            await this.prepareWarehouse(connection, options);

            await this.executeStreamStatement(
                connection,
                sql,
                streamCallback,
                options,
            );
        } catch (e) {
            const error = e as SnowflakeError;
            throw this.parseError(error, sql);
        } finally {
            await new Promise((resolve, reject) => {
                connection.destroy((err, conn) => {
                    if (err) {
                        reject(new WarehouseConnectionError(err.message));
                    }
                    resolve(conn);
                });
            });
        }
    }

    private async executeStreamStatement(
        connection: Connection,
        sqlText: string,
        streamCallback: (data: WarehouseResults) => void,
        options?: {
            values?: AnyType[];
        },
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            connection.execute({
                sqlText,
                binds: options?.values,
                streamResult: true,
                complete: (err, stmt) => {
                    if (err) {
                        reject(err);
                    }

                    const fields = this.getFieldsFromStatement(stmt);

                    pipeline(
                        stmt.streamRows(),
                        new Transform({
                            objectMode: true,
                            transform(chunk, encoding, callback) {
                                callback(null, parseRow(chunk));
                            },
                        }),
                        new Writable({
                            objectMode: true,
                            write(chunk, encoding, callback) {
                                streamCallback({ fields, rows: [chunk] });
                                callback();
                            },
                        }),
                        (error) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        },
                    );
                },
            });
        });
    }

    // eslint-disable-next-line class-methods-use-this
    private async executeStatements(
        connection: Connection,
        sqlText: string,
        statementsCount: number = 1,
    ) {
        return new Promise<{
            fields: Record<string, { type: DimensionType }>;
            rows: AnyType[];
        }>((resolve, reject) => {
            connection.execute({
                sqlText,
                ...(statementsCount > 1
                    ? { parameters: { MULTI_STATEMENT_COUNT: statementsCount } }
                    : {}),
                complete: (err, stmt, data) => {
                    if (err) {
                        reject(err);
                    }
                    if (data) {
                        const fields = stmt.getColumns().reduce(
                            (acc, column) => ({
                                ...acc,
                                [column.getName()]: {
                                    type: mapFieldType(
                                        column.getType().toUpperCase(),
                                    ),
                                },
                            }),
                            {},
                        );
                        resolve({ fields, rows: parseRows(data) });
                    } else {
                        reject(
                            new WarehouseQueryError(
                                'Query result is undefined',
                            ),
                        );
                    }
                },
            });
        });
    }

    private async runTableCatalogQuery(
        database: string,
        schema: string,
        table: string,
    ) {
        const sqlText = `SHOW COLUMNS IN TABLE ${table}`;
        const connection = await this.getConnection({
            schema,
            database,
        });

        try {
            return await this.executeStatements(connection, sqlText);
        } catch (e) {
            console.error(
                `\nError running catalog query for table ${database}.${schema}.${table}:`,
            );
            console.error(e);

            // Ignore error and let UI show invalid table
            return undefined;
        } finally {
            await new Promise((resolve, reject) => {
                connection.destroy((err, conn) => {
                    if (err) {
                        reject(new WarehouseConnectionError(err.message));
                    }
                    resolve(conn);
                });
            });
        }
    }

    async getCatalog(
        config: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) {
        const tablesMetadata = await processPromisesInBatches(
            config,
            DEFAULT_BATCH_SIZE,
            async ({ database, schema, table }) =>
                this.runTableCatalogQuery(database, schema, table),
        );

        return tablesMetadata.reduce<WarehouseCatalog>((acc, tableMetadata) => {
            if (tableMetadata) {
                tableMetadata.rows.forEach((row) => {
                    const match = config.find(
                        ({ database, schema, table }) =>
                            database.toLowerCase() ===
                                row.database_name.toLowerCase() &&
                            schema.toLowerCase() ===
                                row.schema_name.toLowerCase() &&
                            table.toLowerCase() ===
                                row.table_name.toLowerCase(),
                    );
                    // Unquoted identifiers will always be
                    if (row.kind === 'COLUMN' && !!match) {
                        acc[match.database] = acc[match.database] || {};
                        acc[match.database][match.schema] =
                            acc[match.database][match.schema] || {};
                        acc[match.database][match.schema][match.table] =
                            acc[match.database][match.schema][match.table] ||
                            {};
                        acc[match.database][match.schema][match.table][
                            row.column_name
                        ] = mapFieldType(JSON.parse(row.data_type).type);
                    }
                });
            }
            return acc;
        }, {});
    }

    async getAllTables() {
        const databaseName = this.connectionOptions.database;
        const whereSql = databaseName ? `AND TABLE_CATALOG ILIKE ?` : '';
        const query = `
            SELECT
                TABLE_CATALOG as "table_catalog",
                TABLE_SCHEMA as "table_schema",
                TABLE_NAME as "table_name"
            FROM information_schema.tables
            WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
            ${whereSql}
            ORDER BY 1,2,3
        `;
        console.debug('Running query to fetch all tables: ', {
            query,
            databaseName,
        });
        const { rows } = await this.runQuery(
            query,
            {},
            undefined,
            databaseName ? [databaseName] : undefined,
        );
        return rows.map((row: Record<string, AnyType>) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        if (tableName && database && schema) {
            // When having all three we can use the catalog to get the fields using the correct connection args and table names
            return this.getCatalog([{ database, schema, table: tableName }]);
        }

        const query = `
            SELECT TABLE_CATALOG as "table_catalog",
                   TABLE_SCHEMA  as "table_schema",
                   TABLE_NAME    as "table_name",
                   COLUMN_NAME   as "column_name",
                   DATA_TYPE            as "data_type"
            FROM information_schema.columns
            WHERE TABLE_NAME = ?
            ${schema ? 'AND TABLE_SCHEMA = ?' : ''}
            ${database ? 'AND TABLE_CATALOG = ?' : ''}
            ORDER BY 1, 2, 3;
        `;
        const values = [tableName];
        if (schema) {
            values.push(schema);
        }
        if (database) {
            values.push(database);
        }
        console.debug('Running query to fetch fields: ', {
            query,
            values,
        });
        const { rows } = await this.runQuery(query, tags, undefined, values);
        return this.parseWarehouseCatalog(rows, mapFieldType);
    }

    parseError(error: SnowflakeError, query: string = '') {
        // if the error has no code or data, return a generic error
        if (!error?.code && !error.data) {
            return new WarehouseQueryError(error?.message || 'Unknown error');
        }
        // pull error type from data object
        const errorType = error.data?.type || error.code;
        switch (errorType) {
            // if query is mistyped (compilation error)
            case 'COMPILATION':
                // The query will look something like this:
                // 'WITH user_sql AS (
                //     SELECT * FROM `lightdash-database-staging`.`e2e_jaffle_shop`.`users`;
                // ) select * from user_sql limit 500';
                // We want to check for the first part of the query, if so strip the first and last lines
                const queryMatch = query.match(
                    /(?:WITH\s+[a-zA-Z_]+\s+AS\s*\()\s*?/i,
                );
                // also match the line number and character number in the error message
                const lineMatch = error.message.match(
                    /line\s+(\d+)\s+at\s+position\s+(\d+)/,
                );
                if (lineMatch) {
                    // parse out line number and character number
                    let lineNumber = Number(lineMatch[1]) || undefined;
                    const charNumber = Number(lineMatch[2]) + 1 || undefined; // Note the + 1 as it is 0 indexed
                    // if query match, subtract the number of lines from the line number
                    if (queryMatch && lineNumber && lineNumber > 1) {
                        lineNumber -= 1;
                    }
                    // re-inject the line and character number into the error message
                    const message = error.message.replace(
                        /line\s+\d+\s+at\s+position\s+\d+/,
                        `line ${lineNumber} at position ${charNumber}`,
                    );
                    // return a new error with the line and character number in data object
                    return new WarehouseQueryError(message, {
                        lineNumber,
                        charNumber,
                    });
                }
                break;
            default:
                break;
        }
        // otherwise return a generic error
        return new WarehouseQueryError(error?.message || 'Unknown error');
    }
}
