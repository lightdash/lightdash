import { createClient, Row, type ClickHouseClient } from '@clickhouse/client';
import {
    AnyType,
    CreateClickhouseCredentials,
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
import { WarehouseCatalog } from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import { normalizeUnicode } from '../utils/sql';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

export enum ClickhouseTypes {
    UINT8 = 'UInt8',
    UINT16 = 'UInt16',
    UINT32 = 'UInt32',
    UINT64 = 'UInt64',
    INT8 = 'Int8',
    INT16 = 'Int16',
    INT32 = 'Int32',
    INT64 = 'Int64',
    FLOAT32 = 'Float32',
    FLOAT64 = 'Float64',
    DECIMAL = 'Decimal',
    DECIMAL32 = 'Decimal32',
    DECIMAL64 = 'Decimal64',
    DECIMAL128 = 'Decimal128',
    DECIMAL256 = 'Decimal256',
    BOOL = 'Bool',
    STRING = 'String',
    FIXEDSTRING = 'FixedString',
    UUID = 'UUID',
    DATE = 'Date',
    DATE32 = 'Date32',
    DATETIME = 'DateTime',
    DATETIME64 = 'DateTime64',
    ENUM8 = 'Enum8',
    ENUM16 = 'Enum16',
    ARRAY = 'Array',
    TUPLE = 'Tuple',
    MAP = 'Map',
    NULLABLE = 'Nullable',
    LOWCARDINALITY = 'LowCardinality',
    IPV4 = 'IPv4',
    IPV6 = 'IPv6',
}

interface TableInfo {
    database: string;
    schema?: string;
    table: string;
}

const convertDataTypeToDimensionType = (
    type: ClickhouseTypes | string,
): DimensionType => {
    // Remove nullable wrapper and low cardinality wrapper
    const cleanType = type
        .replace(/^Nullable\((.+)\)$/, '$1')
        .replace(/^LowCardinality\((.+)\)$/, '$1')
        .replace(/\(\d+\)/, ''); // Remove precision from decimals and fixed strings

    switch (cleanType) {
        case ClickhouseTypes.BOOL:
            return DimensionType.BOOLEAN;
        case ClickhouseTypes.UINT8:
        case ClickhouseTypes.UINT16:
        case ClickhouseTypes.UINT32:
        case ClickhouseTypes.UINT64:
        case ClickhouseTypes.INT8:
        case ClickhouseTypes.INT16:
        case ClickhouseTypes.INT32:
        case ClickhouseTypes.INT64:
        case ClickhouseTypes.FLOAT32:
        case ClickhouseTypes.FLOAT64:
        case ClickhouseTypes.DECIMAL:
        case ClickhouseTypes.DECIMAL32:
        case ClickhouseTypes.DECIMAL64:
        case ClickhouseTypes.DECIMAL128:
        case ClickhouseTypes.DECIMAL256:
            return DimensionType.NUMBER;
        case ClickhouseTypes.DATE:
        case ClickhouseTypes.DATE32:
            return DimensionType.DATE;
        case ClickhouseTypes.DATETIME:
        case ClickhouseTypes.DATETIME64:
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
            // Map column names from snake_case to camelCase
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const {
                table_catalog: database,
                table_schema: tableSchema,
                table_name: tableName,
                column_name: columnName,
                data_type: dataType,
            } = row as Record<string, string>;

            warehouseCatalog[database] = warehouseCatalog[database] || {};
            warehouseCatalog[database][tableSchema || 'default'] =
                warehouseCatalog[database][tableSchema || 'default'] || {};
            warehouseCatalog[database][tableSchema || 'default'][tableName] =
                warehouseCatalog[database][tableSchema || 'default'][
                    tableName
                ] || {};
            warehouseCatalog[database][tableSchema || 'default'][tableName][
                columnName
            ] = convertDataTypeToDimensionType(dataType);
        });
    });
    return warehouseCatalog;
};

export class ClickhouseSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.CLICKHOUSE;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.CLICKHOUSE;
    }

    getEscapeStringQuoteChar(): string {
        return "'";
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `quantile(${(metric.percentile ?? 50) / 100})(${sql})`;
            case MetricType.MEDIAN:
                return `median(${sql})`;
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
                // ClickHouse uses single quote doubling like PostgreSQL
                .replaceAll("'", "''")
                // Escape backslashes
                .replaceAll('\\', '\\\\')
                // Remove SQL comments
                .replace(/--.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Remove null bytes
                .replaceAll('\0', '')
        );
    }

    castToTimestamp(date: Date): string {
        // ClickHouse uses toDateTime function with ISO 8601 format
        return `toDateTime('${date.toISOString()}')`;
    }

    getIntervalSql(value: number, unit: TimeIntervalUnit): string {
        // ClickHouse uses INTERVAL with value and keyword unit (no quotes)
        const unitStr = ClickhouseSqlBuilder.intervalUnitsSingular[unit];
        return `INTERVAL ${value} ${unitStr}`;
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // ClickHouse uses dateDiff function
        return `dateDiff('second', ${startTimestampSql}, ${endTimestampSql})`;
    }

    getMedianSql(valueSql: string): string {
        // ClickHouse has a native median function
        return `median(${valueSql})`;
    }
}

export class ClickhouseWarehouseClient extends WarehouseBaseClient<CreateClickhouseCredentials> {
    client: ClickHouseClient;

    constructor(credentials: CreateClickhouseCredentials) {
        super(credentials, new ClickhouseSqlBuilder(credentials.startOfWeek));

        const protocol = credentials.secure ? 'https' : 'http';
        const url = `${protocol}://${credentials.host}:${credentials.port}`;

        this.client = createClient({
            url,
            username: credentials.user,
            password: credentials.password,
            database: credentials.schema, // In clickhouse schema = database
            request_timeout: (credentials.timeoutSeconds || 30) * 1000,
        });
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            queryParams?: Record<string, AnyType>;
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        try {
            let alteredQuery = sql;
            if (options?.tags) {
                alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(
                    options?.tags,
                )}`;
            }

            const resultSet = await this.client.query({
                query: alteredQuery,
                format: 'JSONCompactEachRowWithNamesAndTypes',
                query_params: options?.queryParams,
                clickhouse_settings: options?.timezone
                    ? { timezone: options.timezone }
                    : undefined,
            });

            const columnNames: string[] = [];
            const fields: Record<string, { type: DimensionType }> = {};

            const stream = resultSet.stream();

            // Track async callback completion to handle backpressure
            let processingPromise: Promise<void> = Promise.resolve();

            // Process rows sequentially to handle backpressure
            const processRows = async (
                rows: Row<unknown, 'JSONCompactEachRowWithNamesAndTypes'>[],
            ): Promise<void> => {
                for (let i = 0; i < rows.length; i += 1) {
                    const row: unknown[] = rows[i].json();
                    // handle first row with column names
                    if (columnNames.length === 0) {
                        row.forEach((c) => {
                            if (typeof c === 'string') {
                                columnNames.push(c);
                            } else {
                                columnNames.push(String(c));
                            }
                        });
                    } else if (Object.keys(fields).length === 0) {
                        // handle second row with column types
                        columnNames.forEach((c, index) => {
                            fields[c] = {
                                type: convertDataTypeToDimensionType(
                                    String(row[index]),
                                ),
                            };
                        });
                        // eslint-disable-next-line no-await-in-loop
                        await streamCallback({
                            fields,
                            rows: [],
                        });
                    } else {
                        // eslint-disable-next-line no-await-in-loop
                        await streamCallback({
                            fields,
                            rows: [
                                // convert value array to object
                                columnNames.reduce<Record<string, unknown>>(
                                    (acc, c, index) => {
                                        acc[c] = row[index];
                                        return acc;
                                    },
                                    {},
                                ),
                            ],
                        });
                    }
                }
            };

            stream.on(
                'data',
                (
                    rows: Row<unknown, 'JSONCompactEachRowWithNamesAndTypes'>[],
                ) => {
                    // Pause stream to handle backpressure while processing
                    stream.pause();

                    // Chain processing to ensure sequential handling
                    processingPromise = processingPromise
                        .then(async () => {
                            await processRows(rows);
                        })
                        .finally(() => {
                            // Always resume stream, even on error
                            stream.resume();
                        });
                },
            );
            await new Promise<void>((resolve, reject) => {
                stream.on('end', () => {
                    // Wait for any pending processing to complete before resolving
                    processingPromise.then(resolve).catch(reject);
                });
                stream.on('error', reject);
            });
        } catch (e: unknown) {
            throw new WarehouseQueryError(getErrorMessage(e));
        }
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        let results: Record<string, unknown>[][];
        const query = `SELECT 
                            '' as "table_catalog",
                            database as "table_schema",
                            table as "table_name",
                            name as "column_name",
                            type as "data_type"
                        FROM system.columns
                        WHERE database = {databaseName: String}
                          AND table = {tableName: String}
                        ORDER BY position`;
        try {
            results = await processPromisesInBatches(
                requests,
                DEFAULT_BATCH_SIZE,
                async (request) => {
                    const { rows } = await this.runQuery(
                        query,
                        {},
                        undefined,
                        undefined,
                        {
                            databaseName: request.schema,
                            tableName: request.table,
                        },
                    );
                    return rows;
                },
            );
        } catch (e: unknown) {
            throw new WarehouseQueryError(getErrorMessage(e));
        }

        return catalogToSchema(results);
    }

    async getTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const databaseName = schema || this.credentials.schema; // In clickhouse schema = database
        const query = `
            SELECT 
                '' as "table_catalog",
                database as "table_schema",
                name as "table_name"
            FROM system.tables
            WHERE database = {databaseName: String}
            ORDER BY database, name
        `;
        const { rows } = await this.runQuery(
            query,
            tags,
            undefined,
            undefined,
            {
                databaseName,
            },
        );
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string, // always empty string in clickhouse
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const dbName = schema || this.credentials.schema; // In clickhouse schema = database
        const query = `
            SELECT 
                '' as "table_catalog",
                database as "table_schema",
                table as "table_name",
                name as "column_name",
                type as "data_type"
            FROM system.columns
            WHERE database = {databaseName: String}
              AND table = {tableName: String}
            ORDER BY position
        `;
        const { rows } = await this.runQuery(
            query,
            tags,
            undefined,
            undefined,
            {
                databaseName: dbName,
                tableName,
            },
        );
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getAllTables() {
        const databaseName = this.credentials.schema; // In clickhouse schema = database
        const query = `
            SELECT 
                '' as "table_catalog",
                database as "table_schema",
                name as "table_name"
            FROM system.tables
            WHERE database = {databaseName: String}
            ORDER BY database, name
        `;
        const { rows } = await this.runQuery(query, {}, undefined, undefined, {
            databaseName,
        });
        return rows.map((row) => ({
            database: row.table_catalog,
            schema: row.table_schema || 'default',
            table: row.table_name,
        }));
    }

    async test(): Promise<void> {
        try {
            await this.client.query({
                query: 'SELECT 1 as test',
                format: 'JSON',
            });
        } catch (e: unknown) {
            throw new WarehouseConnectionError(getErrorMessage(e));
        }
    }
}
