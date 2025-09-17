import { createClient, type ClickHouseClient } from '@clickhouse/client';
import {
    AnyType,
    CreateClickhouseCredentials,
    DimensionType,
    Metric,
    MetricType,
    getErrorMessage as originalGetErrorMessage,
    SupportedDbtAdapter,
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

const getErrorMessage = (e: Error) => originalGetErrorMessage(e);

const queryTableSchema = ({ database, table }: TableInfo) => `SELECT 
    database,
    '' as table_schema,
    table,
    name as column_name,
    type as data_type
FROM system.columns
WHERE database = '${database}'
  AND table = '${table}'
ORDER BY position`;

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

const catalogToSchema = (results: unknown[][]): WarehouseCatalog => {
    const warehouseCatalog: WarehouseCatalog = {};
    results.forEach((result) => {
        result.forEach((row) => {
            const [database, tableSchema, tableName, columnName, dataType] =
                row as [string, string, string, string, string];
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

const normalizeColumnName = (columnName: string) => columnName.toLowerCase();

const resultHandler = (
    data: Record<string, unknown>[],
): Record<string, AnyType>[] =>
    data.map((row) => {
        const item: Record<string, AnyType> = {};
        Object.keys(row).forEach((key) => {
            item[normalizeColumnName(key)] = row[key];
        });
        return item;
    });

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
            database: credentials.dbname,
            request_timeout: (credentials.timeoutSeconds || 30) * 1000,
        });
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
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

            if (options?.timezone) {
                console.debug(
                    `Setting ClickHouse timezone to ${options?.timezone}`,
                );
                await this.client.command({
                    query: `SET timezone = '${options?.timezone}'`,
                });
            }

            const resultSet = await this.client.query({
                query: alteredQuery,
                format: 'JSONEachRow',
            });

            const data = await resultSet.json();

            if (!Array.isArray(data)) {
                throw new WarehouseQueryError(
                    'Expected array result from ClickHouse',
                );
            }

            if (data.length === 0) {
                streamCallback({
                    fields: {},
                    rows: [],
                });
                return;
            }

            // Infer fields from first row
            const firstRow = data[0] as Record<string, unknown>;
            const fields = Object.keys(firstRow).reduce(
                (acc, key) => ({
                    ...acc,
                    [normalizeColumnName(key)]: {
                        type: this.inferTypeFromValue(firstRow[key]),
                    },
                }),
                {},
            );

            streamCallback({
                fields,
                rows: resultHandler(data as Record<string, unknown>[]),
            });
        } catch (e: unknown) {
            throw new WarehouseQueryError(getErrorMessage(e as Error));
        }
    }

    private inferTypeFromValue(value: unknown): DimensionType {
        if (value === null || value === undefined) {
            return DimensionType.STRING;
        }

        if (typeof value === 'boolean') {
            return DimensionType.BOOLEAN;
        }

        if (typeof value === 'number') {
            return DimensionType.NUMBER;
        }

        if (typeof value === 'string') {
            // Try to detect dates
            if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return DimensionType.DATE;
            }
            if (value.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/)) {
                return DimensionType.TIMESTAMP;
            }
        }

        return DimensionType.STRING;
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        let results: unknown[][];

        try {
            results = await processPromisesInBatches(
                requests,
                DEFAULT_BATCH_SIZE,
                async (request) => {
                    const resultSet = await this.client.query({
                        query: queryTableSchema(request),
                        format: 'JSONEachRow',
                    });
                    const data = await resultSet.json();
                    return Array.isArray(data)
                        ? data.map((row) =>
                              Object.values(row as Record<string, unknown>),
                          )
                        : [];
                },
            );
        } catch (e: unknown) {
            throw new WarehouseQueryError(getErrorMessage(e as Error));
        }

        return catalogToSchema(results);
    }

    private sanitizeInput(sql: string) {
        return sql.replaceAll(
            this.sqlBuilder.getStringQuoteChar(),
            this.sqlBuilder.getEscapeStringQuoteChar() +
                this.sqlBuilder.getStringQuoteChar(),
        );
    }

    async getTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const databaseName = this.credentials.dbname;
        const query = `
            SELECT 
                database,
                '' as table_schema,
                name as table_name
            FROM system.tables
            WHERE database = '${this.sanitizeInput(databaseName)}'
            ORDER BY database, name
        `;
        const { rows } = await this.runQuery(query, tags || {});
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const dbName = database || this.credentials.dbname;
        const query = `
            SELECT 
                database,
                '' as table_schema,
                table,
                name as column_name,
                type as data_type
            FROM system.columns
            WHERE database = '${this.sanitizeInput(dbName)}'
              AND table = '${this.sanitizeInput(tableName)}'
            ORDER BY position
        `;
        const { rows } = await this.runQuery(query, tags || {});
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getAllTables() {
        const databaseName = this.credentials.dbname;
        const query = `
            SELECT 
                database,
                '' as table_schema,
                name as table_name
            FROM system.tables
            WHERE database = '${this.sanitizeInput(databaseName)}'
            ORDER BY database, name
        `;
        const { rows } = await this.runQuery(query, {}, undefined);
        return rows.map((row) => ({
            database: row.database,
            schema: row.table_schema || 'default',
            table: row.table_name,
        }));
    }

    async test(): Promise<void> {
        try {
            await this.client.query({
                query: 'SELECT 1 as test',
                format: 'JSONEachRow',
            });
        } catch (e: unknown) {
            throw new WarehouseConnectionError(getErrorMessage(e as Error));
        }
    }
}
