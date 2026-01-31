import { Database, OPEN_READONLY, Connection } from 'duckdb-async';
import {
    AnyType,
    CreateDuckdbCredentials,
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
import { normalizeUnicode } from '../utils/sql';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

export enum DuckdbTypes {
    // Integer types
    TINYINT = 'TINYINT',
    SMALLINT = 'SMALLINT',
    INTEGER = 'INTEGER',
    BIGINT = 'BIGINT',
    HUGEINT = 'HUGEINT',
    UTINYINT = 'UTINYINT',
    USMALLINT = 'USMALLINT',
    UINTEGER = 'UINTEGER',
    UBIGINT = 'UBIGINT',
    UHUGEINT = 'UHUGEINT',
    // Floating point types
    FLOAT = 'FLOAT',
    REAL = 'REAL',
    DOUBLE = 'DOUBLE',
    DECIMAL = 'DECIMAL',
    NUMERIC = 'NUMERIC',
    // Boolean type
    BOOLEAN = 'BOOLEAN',
    BOOL = 'BOOL',
    // String types
    VARCHAR = 'VARCHAR',
    CHAR = 'CHAR',
    BPCHAR = 'BPCHAR',
    TEXT = 'TEXT',
    STRING = 'STRING',
    // Date/Time types
    DATE = 'DATE',
    TIME = 'TIME',
    TIMESTAMP = 'TIMESTAMP',
    TIMESTAMPTZ = 'TIMESTAMPTZ',
    TIMESTAMP_S = 'TIMESTAMP_S',
    TIMESTAMP_MS = 'TIMESTAMP_MS',
    TIMESTAMP_NS = 'TIMESTAMP_NS',
    TIMESTAMP_WITH_TIME_ZONE = 'TIMESTAMP WITH TIME ZONE',
    // Other types
    UUID = 'UUID',
    BLOB = 'BLOB',
    INTERVAL = 'INTERVAL',
    JSON = 'JSON',
}

interface TableInfo {
    database: string;
    schema?: string;
    table: string;
}

const convertDataTypeToDimensionType = (
    type: DuckdbTypes | string,
): DimensionType => {
    // Normalize and extract base type (remove precision/scale)
    const cleanType = type
        .toUpperCase()
        .replace(/\(\d+(?:,\s*\d+)?\)/, '') // Remove (n) or (n, m)
        .trim();

    switch (cleanType) {
        case DuckdbTypes.BOOLEAN:
        case DuckdbTypes.BOOL:
            return DimensionType.BOOLEAN;
        case DuckdbTypes.TINYINT:
        case DuckdbTypes.SMALLINT:
        case DuckdbTypes.INTEGER:
        case DuckdbTypes.BIGINT:
        case DuckdbTypes.HUGEINT:
        case DuckdbTypes.UTINYINT:
        case DuckdbTypes.USMALLINT:
        case DuckdbTypes.UINTEGER:
        case DuckdbTypes.UBIGINT:
        case DuckdbTypes.UHUGEINT:
        case DuckdbTypes.FLOAT:
        case DuckdbTypes.REAL:
        case DuckdbTypes.DOUBLE:
        case DuckdbTypes.DECIMAL:
        case DuckdbTypes.NUMERIC:
            return DimensionType.NUMBER;
        case DuckdbTypes.DATE:
            return DimensionType.DATE;
        case DuckdbTypes.TIMESTAMP:
        case DuckdbTypes.TIMESTAMPTZ:
        case DuckdbTypes.TIMESTAMP_S:
        case DuckdbTypes.TIMESTAMP_MS:
        case DuckdbTypes.TIMESTAMP_NS:
        case DuckdbTypes.TIMESTAMP_WITH_TIME_ZONE:
        case DuckdbTypes.TIME:
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
            warehouseCatalog[database][tableSchema || 'main'] =
                warehouseCatalog[database][tableSchema || 'main'] || {};
            warehouseCatalog[database][tableSchema || 'main'][tableName] =
                warehouseCatalog[database][tableSchema || 'main'][tableName] ||
                {};
            warehouseCatalog[database][tableSchema || 'main'][tableName][
                columnName
            ] = convertDataTypeToDimensionType(dataType);
        });
    });
    return warehouseCatalog;
};

export class DuckdbSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.DUCKDB;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.DUCKDB;
    }

    getEscapeStringQuoteChar(): string {
        // DuckDB uses '' to escape single quotes (like PostgreSQL)
        return "'";
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                // DuckDB has approx_quantile for approximate percentiles
                return `quantile_cont(${sql}, ${(metric.percentile ?? 50) / 100})`;
            case MetricType.MEDIAN:
                return `median(${sql})`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    concatString(...args: string[]): string {
        // DuckDB supports both CONCAT() and || operator
        return `(${args.join(' || ')})`;
    }

    escapeString(value: string): string {
        if (typeof value !== 'string') {
            return value;
        }

        return (
            normalizeUnicode(value)
                // DuckDB uses single quote doubling like PostgreSQL
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
        // DuckDB accepts ISO 8601 format
        return `TIMESTAMP '${date.toISOString()}'`;
    }

    getIntervalSql(value: number, unit: TimeIntervalUnit): string {
        // DuckDB uses PostgreSQL-style intervals
        const unitStr = DuckdbSqlBuilder.intervalUnitsSingular[unit];
        return `INTERVAL ${value} ${unitStr}`;
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // DuckDB has datediff function similar to ClickHouse
        return `datediff('second', ${startTimestampSql}, ${endTimestampSql})`;
    }

    getMedianSql(valueSql: string): string {
        // DuckDB has a native median function
        return `median(${valueSql})`;
    }
}

export class DuckdbWarehouseClient extends WarehouseBaseClient<CreateDuckdbCredentials> {
    private db: Database | null = null;

    private connection: Connection | null = null;

    constructor(credentials: CreateDuckdbCredentials) {
        super(credentials, new DuckdbSqlBuilder(credentials.startOfWeek));
    }

    private async getConnection(): Promise<Connection> {
        if (!this.connection) {
            // Open database in read-only mode for safety
            this.db = await Database.create(
                this.credentials.path,
                OPEN_READONLY,
            );
            this.connection = await this.db.connect();

            // Set timezone if schema is specified
            if (this.credentials.schema) {
                await this.connection.run(
                    `SET schema = '${this.credentials.schema}'`,
                );
            }
        }
        return this.connection;
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            values?: AnyType[];
            queryParams?: Record<string, AnyType>;
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        try {
            const connection = await this.getConnection();

            let alteredQuery = sql;
            if (options?.tags) {
                alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(
                    options?.tags,
                )}`;
            }

            // Set timezone if specified
            if (options?.timezone) {
                await connection.run(`SET TimeZone = '${options.timezone}'`);
            }

            // Execute query and get all rows
            const rows = await connection.all(alteredQuery);

            if (rows.length === 0) {
                // No rows, return empty fields
                await streamCallback({
                    fields: {},
                    rows: [],
                });
                return;
            }

            // Get column names from first row
            const columnNames = Object.keys(rows[0]);

            // Infer types from first row values
            const fields: Record<string, { type: DimensionType }> = {};
            columnNames.forEach((col) => {
                const value = rows[0][col];
                let type = DimensionType.STRING;
                if (typeof value === 'number') {
                    type = DimensionType.NUMBER;
                } else if (typeof value === 'boolean') {
                    type = DimensionType.BOOLEAN;
                } else if (value instanceof Date) {
                    type = DimensionType.TIMESTAMP;
                }
                fields[col] = { type };
            });

            // First callback with fields
            await streamCallback({
                fields,
                rows: [],
            });

            // Stream rows one at a time
            for (let i = 0; i < rows.length; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                await streamCallback({
                    fields,
                    rows: [rows[i] as Record<string, unknown>],
                });
            }
        } catch (e: unknown) {
            throw new WarehouseQueryError(getErrorMessage(e));
        }
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        let results: Record<string, unknown>[][];

        try {
            const connection = await this.getConnection();

            results = await Promise.all(
                requests.map(async (request) => {
                    const query = `
                        SELECT
                            table_catalog,
                            table_schema,
                            table_name,
                            column_name,
                            data_type
                        FROM information_schema.columns
                        WHERE table_schema = '${request.schema || 'main'}'
                          AND table_name = '${request.table}'
                        ORDER BY ordinal_position
                    `;
                    const rows = await connection.all(query);
                    return rows as Record<string, unknown>[];
                }),
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
        const schemaName = schema || this.credentials.schema || 'main';
        const query = `
            SELECT
                table_catalog,
                table_schema,
                table_name
            FROM information_schema.tables
            WHERE table_schema = '${schemaName}'
            ORDER BY table_schema, table_name
        `;
        const { rows } = await this.runQuery(query, tags);
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const schemaName = schema || this.credentials.schema || 'main';
        const query = `
            SELECT
                table_catalog,
                table_schema,
                table_name,
                column_name,
                data_type
            FROM information_schema.columns
            WHERE table_schema = '${schemaName}'
              AND table_name = '${tableName}'
            ORDER BY ordinal_position
        `;
        const { rows } = await this.runQuery(query, tags);
        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getAllTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<
        { database: string; schema: string; table: string }[]
    > {
        const schemaName = schema || this.credentials.schema || 'main';
        const query = `
            SELECT
                table_catalog,
                table_schema,
                table_name
            FROM information_schema.tables
            WHERE table_schema = '${schemaName}'
            ORDER BY table_schema, table_name
        `;
        const { rows } = await this.runQuery(query, tags);
        return rows.map((row) => ({
            database: row.table_catalog as string,
            schema: (row.table_schema as string) || 'main',
            table: row.table_name as string,
        }));
    }

    async test(): Promise<void> {
        try {
            const connection = await this.getConnection();
            await connection.all('SELECT 1 as test');
        } catch (e: unknown) {
            throw new WarehouseConnectionError(getErrorMessage(e));
        }
    }

    async close(): Promise<void> {
        if (this.connection) {
            await this.connection.close();
            this.connection = null;
        }
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }
}
