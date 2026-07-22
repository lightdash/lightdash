import {
    AnyType,
    CreateDorisCredentials,
    DimensionType,
    getErrorMessage,
    Metric,
    MetricType,
    SupportedDbtAdapter,
    TimeIntervalUnit,
    WarehouseConnectionError,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import * as mysql from 'mysql2';
import { WarehouseCatalog } from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import { normalizeUnicode } from '../utils/sql';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

// Doris column types as reported by `information_schema.columns.DATA_TYPE`.
// Doris is MySQL-protocol compatible, so the catalog type names mirror MySQL.
export enum DorisTypes {
    BOOLEAN = 'boolean',
    TINYINT = 'tinyint',
    SMALLINT = 'smallint',
    INT = 'int',
    BIGINT = 'bigint',
    LARGEINT = 'largeint',
    FLOAT = 'float',
    DOUBLE = 'double',
    DECIMAL = 'decimal',
    DECIMALV3 = 'decimalv3',
    DATE = 'date',
    DATEV2 = 'datev2',
    DATETIME = 'datetime',
    DATETIMEV2 = 'datetimev2',
    CHAR = 'char',
    VARCHAR = 'varchar',
    STRING = 'string',
    TEXT = 'text',
    JSON = 'json',
    JSONB = 'jsonb',
}

interface TableInfo {
    database: string;
    schema?: string;
    table: string;
}

// MySQL protocol numeric field type codes (mysql2 `fields[i].type`).
// Used to map streamed result columns to Lightdash DimensionType.
const mysqlFieldTypeToDimensionType = (typeCode: number): DimensionType => {
    switch (typeCode) {
        case 1: // TINY
        case 2: // SHORT
        case 3: // LONG
        case 4: // FLOAT
        case 5: // DOUBLE
        case 8: // LONGLONG
        case 9: // INT24
        case 0: // DECIMAL
        case 246: // NEWDECIMAL
            return DimensionType.NUMBER;
        case 10: // DATE
        case 14: // NEWDATE
            return DimensionType.DATE;
        case 7: // TIMESTAMP
        case 12: // DATETIME
            return DimensionType.TIMESTAMP;
        case 16: // BIT (used by Doris BOOLEAN)
            return DimensionType.BOOLEAN;
        default:
            return DimensionType.STRING;
    }
};

export const convertDataTypeToDimensionType = (
    type: DorisTypes | string,
): DimensionType => {
    // Strip parenthesised args, e.g. decimal(18,2) -> decimal, varchar(255) -> varchar
    const cleanType = type.toLowerCase().replace(/\(.*\)$/, '').trim();

    switch (cleanType) {
        case DorisTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case DorisTypes.TINYINT:
        case DorisTypes.SMALLINT:
        case DorisTypes.INT:
        case DorisTypes.BIGINT:
        case DorisTypes.LARGEINT:
        case DorisTypes.FLOAT:
        case DorisTypes.DOUBLE:
        case DorisTypes.DECIMAL:
        case DorisTypes.DECIMALV3:
            return DimensionType.NUMBER;
        case DorisTypes.DATE:
        case DorisTypes.DATEV2:
            return DimensionType.DATE;
        case DorisTypes.DATETIME:
        case DorisTypes.DATETIMEV2:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

const catalogToSchema = (
    results: Record<string, unknown>[][],
): WarehouseCatalog => {
    const warehouseCatalog: WarehouseCatalog = {};
    results.forEach((result) => {
        result.forEach((row) => {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const {
                table_catalog: database,
                table_schema: tableSchema,
                table_name: tableName,
                column_name: columnName,
                data_type: dataType,
            } = row as Record<string, string>;

            warehouseCatalog[database] = warehouseCatalog[database] || {};
            warehouseCatalog[database][tableSchema] =
                warehouseCatalog[database][tableSchema] || {};
            warehouseCatalog[database][tableSchema][tableName] =
                warehouseCatalog[database][tableSchema][tableName] || {};
            warehouseCatalog[database][tableSchema][tableName][columnName] =
                convertDataTypeToDimensionType(dataType);
        });
    });
    return warehouseCatalog;
};

export class DorisSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.DORIS;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.DORIS;
    }

    getFieldQuoteChar(): string {
        // Doris/MySQL identifiers are quoted with backticks.
        return '`';
    }

    getEscapeStringQuoteChar(): string {
        return "'";
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                // Doris: PERCENTILE(expr, p) with p in [0, 1].
                return `PERCENTILE(${sql}, ${(metric.percentile ?? 50) / 100})`;
            case MetricType.MEDIAN:
                return `PERCENTILE(${sql}, 0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    escapeString(value: string): string {
        if (typeof value !== 'string') {
            return value;
        }

        return (
            normalizeUnicode(value)
                // Doris/MySQL: escape single quotes by doubling
                .replaceAll("'", "''")
                // Escape backslashes (MySQL treats backslash as escape char)
                .replaceAll('\\', '\\\\')
                // Remove SQL comments
                .replace(/--.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Remove null bytes
                .replaceAll('\0', '')
        );
    }

    castToTimestamp(date: Date): string {
        // Doris DATETIME literal (no timezone).
        const iso = date.toISOString().replace('T', ' ').replace('Z', '');
        return `CAST('${iso}' AS DATETIME)`;
    }

    getIntervalSql(value: number, unit: TimeIntervalUnit): string {
        // Doris/MySQL: INTERVAL <value> <UNIT> (no quotes around the literal).
        const unitStr = DorisSqlBuilder.intervalUnitsSingular[unit];
        return `INTERVAL ${value} ${unitStr}`;
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // Doris/MySQL: TIMESTAMPDIFF(unit, start, end)
        return `TIMESTAMPDIFF(SECOND, ${startTimestampSql}, ${endTimestampSql})`;
    }

    getMedianSql(valueSql: string): string {
        return `PERCENTILE(${valueSql}, 0.5)`;
    }

    buildArray(elements: string[]): string {
        // Doris array literal.
        return `[${elements.join(', ')}]`;
    }
}

export class DorisWarehouseClient extends WarehouseBaseClient<CreateDorisCredentials> {
    connectionOptions: mysql.ConnectionOptions;

    constructor(credentials: CreateDorisCredentials) {
        super(credentials, new DorisSqlBuilder(credentials.startOfWeek));

        this.connectionOptions = {
            host: credentials.host,
            port: credentials.port,
            user: credentials.user,
            password: credentials.password,
            database: credentials.schema, // Doris database == Lightdash schema
            connectTimeout: (credentials.timeoutSeconds || 30) * 1000,
            // Return DATE/DATETIME as strings to avoid JS Date timezone shifts.
            dateStrings: true,
            // Keep large integers safe.
            supportBigNumbers: true,
            bigNumberStrings: true,
            // TLS/SSL support
            ssl: credentials.ssl ? { rejectUnauthorized: false } : undefined,
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
        const connection = mysql.createConnection(this.connectionOptions);
        const queryTimeoutMs =
            (this.credentials.timeoutSeconds || 30) * 1000;
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
        try {
            // Inject query tags as a leading SQL comment for traceability.
            const taggedSql = options?.tags
                ? `-- ${JSON.stringify(options.tags)}\n${sql}`
                : sql;

            await new Promise<void>((resolve, reject) => {
                const fields: Record<string, { type: DimensionType }> = {};
                let fieldsEmitted = false;
                let processingPromise: Promise<void> = Promise.resolve();
                let settled = false;

                // Query-level timeout: cancel the query if it exceeds
                // timeoutSeconds. Separate from connectTimeout (TCP handshake only).
                timeoutTimer = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        connection.destroy();
                        reject(
                            new WarehouseQueryError(
                                `Query cancelled after ${queryTimeoutMs}ms (timeoutSeconds)`,
                            ),
                        );
                    }
                }, queryTimeoutMs);

                // Canonical mysql2 streaming: events on the Query object with
                // connection.pause()/resume() for backpressure. `?` placeholders
                // are bound with parameterised values to prevent SQL injection.
                const query = connection.query(taggedSql, options?.values ?? []);

                query.on('error', (err) => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeoutTimer);
                        reject(err);
                    }
                });

                query.on('fields', (queryFields: mysql.FieldPacket[]) => {
                    queryFields.forEach((f) => {
                        fields[f.name] = {
                            type: mysqlFieldTypeToDimensionType(
                                f.type as number,
                            ),
                        };
                    });
                });

                query.on('result', (row: Record<string, unknown>) => {
                    connection.pause();
                    processingPromise = processingPromise
                        .then(async () => {
                            if (!fieldsEmitted) {
                                fieldsEmitted = true;
                                await streamCallback({ fields, rows: [] });
                            }
                            await streamCallback({ fields, rows: [row] });
                        })
                        .catch((err) => {
                            if (!settled) {
                                settled = true;
                                clearTimeout(timeoutTimer);
                                reject(err);
                            }
                        })
                        .finally(() => {
                            connection.resume();
                        });
                });

                query.on('end', () => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeoutTimer);
                        processingPromise.then(resolve).catch(reject);
                    }
                });
            });
        } catch (e: unknown) {
            throw new WarehouseQueryError(getErrorMessage(e));
        } finally {
            clearTimeout(timeoutTimer);
            connection.end();
        }
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        const query = `
            SELECT
                table_schema AS \`table_catalog\`,
                table_schema AS \`table_schema\`,
                table_name   AS \`table_name\`,
                column_name  AS \`column_name\`,
                data_type    AS \`data_type\`
            FROM information_schema.columns
            WHERE table_schema = ?
              AND table_name = ?
            ORDER BY ordinal_position
        `;
        let results: Record<string, unknown>[][];
        try {
            results = await processPromisesInBatches(
                requests,
                DEFAULT_BATCH_SIZE,
                async (request) => {
                    const { rows } = await this.runQuery(
                        query,
                        {},
                        undefined,
                        [request.schema, request.table],
                    );
                    return rows;
                },
            );
        } catch (e: unknown) {
            throw new WarehouseQueryError(getErrorMessage(e));
        }
        return catalogToSchema(results);
    }

    async getFields(
        tableName: string,
        schema?: string,
        _database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const dbName = schema || this.credentials.schema;
        const query = `
            SELECT
                table_schema AS \`table_catalog\`,
                table_schema AS \`table_schema\`,
                table_name   AS \`table_name\`,
                column_name  AS \`column_name\`,
                data_type    AS \`data_type\`
            FROM information_schema.columns
            WHERE table_schema = ?
              AND table_name = ?
            ORDER BY ordinal_position
        `;
        const { rows } = await this.runQuery(query, tags, undefined, [
            dbName,
            tableName,
        ]);
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getAllTables() {
        const databaseName = this.credentials.schema;
        const query = `
            SELECT
                table_schema AS \`table_catalog\`,
                table_schema AS \`table_schema\`,
                table_name   AS \`table_name\`
            FROM information_schema.tables
            WHERE table_schema = ?
            ORDER BY table_schema, table_name
        `;
        const { rows } = await this.runQuery(query, {}, undefined, [
            databaseName,
        ]);
        return rows.map((row) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
    }

    async test(): Promise<void> {
        try {
            await this.runQuery('SELECT 1');
        } catch (e: unknown) {
            throw new WarehouseConnectionError(getErrorMessage(e));
        }
    }
}
