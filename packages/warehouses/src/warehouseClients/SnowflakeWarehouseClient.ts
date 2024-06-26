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

            await this.executeStreamStatement(connection, sql, streamCallback);
        } catch (e) {
            throw new WarehouseQueryError(e.message);
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
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            connection.execute({
                sqlText,
                streamResult: true,
                complete: (err, stmt) => {
                    if (err) {
                        reject(new WarehouseQueryError(err.message));
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
                                reject(new WarehouseQueryError(error.message));
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

    async getTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const schemaFilter = schema
            ? `AND TABLE_SCHEMA ILIKE '${this.sanitizeInput(schema)}'`
            : '';
        const query = `
            SELECT 
                LOWER(TABLE_CATALOG) as "table_catalog", 
                LOWER(TABLE_SCHEMA) as "table_schema",
                LOWER(TABLE_NAME) as "table_name"
            FROM information_schema.tables
            WHERE TABLE_TYPE = 'BASE TABLE' 
            ${schemaFilter}
            ORDER BY 1,2,3
        `;
        const { rows } = await this.runQuery(query, tags);
        return this.parseWarehouseCatalog(rows, mapFieldType);
    }

    async getFields(
        tableName: string,
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const schemaFilter = schema
            ? `AND TABLE_SCHEMA ILIKE '${this.sanitizeInput(schema)}'`
            : '';

        const query = `
            SELECT 
                LOWER(TABLE_CATALOG) as "table_catalog",
                LOWER(TABLE_SCHEMA) as "table_schema",
                LOWER(TABLE_NAME) as "table_name",
                LOWER(COLUMN_NAME) as "column_name",
                DATA_TYPE as "data_type"
            FROM information_schema.columns
            WHERE TABLE_NAME ILIKE '${this.sanitizeInput(tableName)}'
            ${schemaFilter}
            ORDER BY 1,2,3;
        `;
        const { rows } = await this.runQuery(query, tags);
        return this.parseWarehouseCatalog(rows, mapFieldType);
    }
}
