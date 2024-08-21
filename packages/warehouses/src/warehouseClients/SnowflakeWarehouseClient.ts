import {
    CreateSnowflakeCredentials,
    DimensionType,
    isWeekDay,
    Metric,
    MetricType,
    ParseError,
    SupportedDbtAdapter,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
} from '@lightdash/common';
import * as crypto from 'crypto';
import {
    configure,
    Connection,
    ConnectionOptions,
    createConnection,
    SnowflakeError,
    SnowflakeErrorExternal,
} from 'snowflake-sdk';
import { pipeline, Transform, Writable } from 'stream';
import * as Util from 'util';
import { WarehouseCatalog } from '../types';
import WarehouseBaseClient from './WarehouseBaseClient';

// Prevent snowflake sdk from flooding the output with info logs
configure({ logLevel: 'ERROR' });

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

const parseCell = (cell: any) => {
    if (cell instanceof Date) {
        return new Date(cell);
    }

    return cell;
};

const parseRow = (row: Record<string, any>) =>
    Object.fromEntries(
        Object.entries(row).map(([name, value]) => [name, parseCell(value)]),
    );
const parseRows = (rows: Record<string, any>[]) => rows.map(parseRow);

export class SnowflakeWarehouseClient extends WarehouseBaseClient<CreateSnowflakeCredentials> {
    connectionOptions: ConnectionOptions;

    quotedIdentifiersIgnoreCase?: boolean;

    constructor(credentials: CreateSnowflakeCredentials) {
        super(credentials);
        let decodedPrivateKey: string | Buffer | undefined =
            credentials.privateKey;
        if (credentials.privateKey && credentials.privateKeyPass) {
            // Get the private key from the file as an object.
            const privateKeyObject = crypto.createPrivateKey({
                key: credentials.privateKey,
                format: 'pem',
                passphrase: credentials.privateKeyPass,
            });

            // Extract the private key from the object as a PEM-encoded string.
            decodedPrivateKey = privateKeyObject.export({
                format: 'pem',
                type: 'pkcs8',
            });
        }

        if (typeof credentials.quotedIdentifiersIgnoreCase !== 'undefined') {
            this.quotedIdentifiersIgnoreCase =
                credentials.quotedIdentifiersIgnoreCase;
        }

        let authenticationOptions: Partial<ConnectionOptions> = {};

        if (credentials.password) {
            authenticationOptions = {
                password: credentials.password,
                authenticator: 'SNOWFLAKE',
            };
        } else if (decodedPrivateKey) {
            authenticationOptions = {
                privateKey: decodedPrivateKey,
                authenticator: 'SNOWFLAKE_JWT',
            };
        }
        this.connectionOptions = {
            account: credentials.account,
            username: credentials.user,
            ...authenticationOptions,
            database: credentials.database,
            schema: credentials.schema,
            warehouse: credentials.warehouse,
            role: credentials.role,
            ...(credentials.accessUrl?.length
                ? { accessUrl: credentials.accessUrl }
                : {}),
        } as ConnectionOptions; // force type because accessUrl property is not recognised
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
            values?: any[];
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        let connection: Connection;
        try {
            connection = createConnection(this.connectionOptions);
            await Util.promisify(connection.connect)();
        } catch (e) {
            throw new WarehouseConnectionError(`Snowflake error: ${e.message}`);
        }
        try {
            if (this.connectionOptions.warehouse) {
                // eslint-disable-next-line no-console
                console.debug(
                    `Running snowflake query on warehouse: ${this.connectionOptions.warehouse}`,
                );
                await this.executeStatement(
                    connection,
                    `USE WAREHOUSE ${this.connectionOptions.warehouse};`,
                );
            }
            if (isWeekDay(this.startOfWeek)) {
                const snowflakeStartOfWeekIndex = this.startOfWeek + 1; // 1 (Monday) to 7 (Sunday):
                await this.executeStatement(
                    connection,
                    `ALTER SESSION SET WEEK_START = ${snowflakeStartOfWeekIndex};`,
                );
            }
            if (options?.tags) {
                await this.executeStatement(
                    connection,
                    `ALTER SESSION SET QUERY_TAG = '${JSON.stringify(
                        options?.tags,
                    )}';`,
                );
            }
            const timezoneQuery = options?.timezone || 'UTC';
            console.debug(
                `Setting Snowflake session timezone to ${timezoneQuery}`,
            );
            await this.executeStatement(
                connection,
                `ALTER SESSION SET TIMEZONE = '${timezoneQuery}';`,
            );

            /**
             * Force QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE to avoid casing inconsistencies
             * between Snowflake <> Lightdash
             */
            console.debug(
                'Setting Snowflake session QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE',
            );
            await this.executeStatement(
                connection,
                `ALTER SESSION SET QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE;`,
            );

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
            values?: any[];
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

                    const columns = stmt.getColumns();
                    const fields = columns
                        ? columns.reduce(
                              (acc, column) => ({
                                  ...acc,
                                  [column.getName()]: {
                                      type: mapFieldType(
                                          column.getType().toUpperCase(),
                                      ),
                                  },
                              }),
                              {},
                          )
                        : {};

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
    private async executeStatement(connection: Connection, sqlText: string) {
        return new Promise<{
            fields: Record<string, { type: DimensionType }>;
            rows: any[];
        }>((resolve, reject) => {
            connection.execute({
                sqlText,
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
        let connection: Connection;
        const sqlText = `SHOW COLUMNS IN TABLE ${table}`;
        try {
            connection = createConnection({
                ...this.connectionOptions,
                schema,
                database,
            });
            await Util.promisify(connection.connect)();
        } catch (e) {
            throw new WarehouseConnectionError(`Snowflake error: ${e.message}`);
        }
        try {
            return await this.executeStatement(connection, sqlText);
        } catch (e) {
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
        const tablesMetadataPromises = config.map(
            ({ database, schema, table }) =>
                this.runTableCatalogQuery(database, schema, table),
        );

        const tablesMetadata = await Promise.all(tablesMetadataPromises);

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

    getStringQuoteChar() {
        return "'";
    }

    getEscapeStringQuoteChar() {
        return '\\';
    }

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.SNOWFLAKE;
    }

    getMetricSql(sql: string, metric: Metric) {
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

    async getAllTables() {
        const databaseName = this.connectionOptions.database;
        const whereSql = databaseName ? `AND TABLE_CATALOG ILIKE ?` : '';
        const query = `
            SELECT
                LOWER(TABLE_CATALOG) as "table_catalog",
                LOWER(TABLE_SCHEMA) as "table_schema",
                LOWER(TABLE_NAME) as "table_name"
            FROM information_schema.tables
            WHERE TABLE_TYPE = 'BASE TABLE'
            ${whereSql}
            ORDER BY 1,2,3
        `;
        const { rows } = await this.runQuery(
            query,
            {},
            undefined,
            databaseName ? [databaseName] : undefined,
        );
        return rows.map((row: Record<string, any>) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
    }

    async getFields(
        tableName: string,
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const schemaFilter = schema ? `AND TABLE_SCHEMA ILIKE ?` : '';

        const query = `
            SELECT LOWER(TABLE_CATALOG) as "table_catalog",
                   LOWER(TABLE_SCHEMA)  as "table_schema",
                   LOWER(TABLE_NAME)    as "table_name",
                   LOWER(COLUMN_NAME)   as "column_name",
                   DATA_TYPE            as "data_type"
            FROM information_schema.columns
            WHERE TABLE_NAME ILIKE ? ${schemaFilter}
            ORDER BY 1, 2, 3;
        `;
        const { rows } = await this.runQuery(
            query,
            tags,
            undefined,
            schema ? [tableName, schema] : [tableName],
        );
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
                // the query will look something like this:
                // 'WITH user_sql AS (SELECT * FROM `lightdash-database-staging`.`e2e_jaffle_shop`.`users`;) select * from user_sql limit 500';
                // we want to take the inner query and count the number of characters in the first part
                const queryMatch = query.match(
                    /WITH\s+[a-zA-Z_]+\s+AS\s*\(\s*([\s\S]*?)\s*\)\s*select\s+\*\s+from\s+[a-zA-Z_]+\s+limit\s+\d+/i,
                );
                // also match the line number and character number in the error message
                const lineMatch = error.message.match(
                    /syntax error line\s+(\d+)\s+at\s+position\s+(\d+)/,
                );
                if (lineMatch) {
                    // Find the position of the inner query within the full query
                    const innerQuery =
                        queryMatch && queryMatch.length > 0
                            ? queryMatch[1]
                            : query;
                    const innerQueryStartIndex = query.indexOf(innerQuery);
                    // parse out line number and character number
                    const lineNumber = Number(lineMatch[1]) || undefined;
                    let charNumber = Number(lineMatch[2]) + 1 || undefined; // Note the + 1 as it is 0 indexed
                    console.log('index', innerQueryStartIndex);
                    // subtract the length of the first part of the query from the character number
                    // so long as the charnumber ends up > 0
                    if (
                        charNumber && // only do this if we found a char number
                        innerQueryStartIndex > -1 && // only do this if we found the inner query
                        lineNumber === 1 // only do this if the error is on the first line
                    ) {
                        const n = charNumber - innerQueryStartIndex;
                        if (n > 0) {
                            charNumber = n; // set the new char number
                        }
                        // if char number is greater than the length of the inner query, set it to the end of the inner query
                        if (charNumber > innerQuery.length) {
                            charNumber = innerQuery.length;
                        }
                    }
                    return new WarehouseQueryError(error.message, {
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
