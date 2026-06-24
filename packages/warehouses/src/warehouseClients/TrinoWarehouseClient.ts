import { DuckDBInstance } from '@duckdb/node-api';
import {
    AnyType,
    CreateTrinoCredentials,
    DimensionType,
    Metric,
    MetricType,
    getErrorMessage as originalGetErrorMessage,
    SupportedDbtAdapter,
    TimeIntervalUnit,
    WarehouseConnectionError,
    WarehouseExecuteAsyncQuery,
    WarehouseExecuteAsyncQueryArgs,
    WarehouseQueryError,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import {
    BasicAuth,
    ConnectionOptions,
    Iterator,
    QueryError,
    QueryResult,
    Trino,
} from 'trino-client';
import { WarehouseCatalog } from '../types';
import {
    DEFAULT_BATCH_SIZE,
    processPromisesInBatches,
} from '../utils/processPromisesInBatches';
import { normalizeUnicode } from '../utils/sql';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

// PivotQueryBuilder always wraps the base query as the first CTE:
//   WITH original_query AS (<base query>), group_by_query AS (...), ...
// We detect that signature, run the inner <base query> on Trino, and run the
// remaining pivot SQL in DuckDB over the Trino results.
const PIVOT_QUERY_PREFIX = 'WITH original_query AS (';
const DUCKDB_PIVOT_FLAT_TABLE = 'flat_results';

/**
 * Finds the index of the `)` that closes the `(` at `openIndex`, accounting for
 * nested parens and skipping over single-quoted strings and double-quoted
 * identifiers. Returns -1 if unbalanced.
 */
const findMatchingCloseParen = (sql: string, openIndex: number): number => {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    for (let i = openIndex; i < sql.length; i += 1) {
        const char = sql[i];
        if (inSingleQuote) {
            if (char === "'") {
                if (sql[i + 1] === "'") i += 1;
                else inSingleQuote = false;
            }
        } else if (inDoubleQuote) {
            if (char === '"') {
                if (sql[i + 1] === '"') i += 1;
                else inDoubleQuote = false;
            }
        } else if (char === "'") {
            inSingleQuote = true;
        } else if (char === '"') {
            inDoubleQuote = true;
        } else if (char === '(') {
            depth += 1;
        } else if (char === ')') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
};

/**
 * If `sql` is a PivotQueryBuilder output, splits it into the inner base query
 * (to run on Trino) and a rewrite that swaps that base query for a flat table
 * reference (to run the pivot in DuckDB). Returns null for non-pivot SQL.
 */
const splitPivotQuery = (
    sql: string,
): {
    originalQuery: string;
    rewriteWithFlatTable: (flatTableName: string) => string;
} | null => {
    const leadingWhitespace = sql.match(/^\s*/)?.[0].length ?? 0;
    if (!sql.startsWith(PIVOT_QUERY_PREFIX, leadingWhitespace)) {
        return null;
    }

    const openParenIndex = leadingWhitespace + PIVOT_QUERY_PREFIX.length - 1;
    const closeParenIndex = findMatchingCloseParen(sql, openParenIndex);
    if (closeParenIndex === -1) {
        return null;
    }

    const innerStart = openParenIndex + 1;
    return {
        originalQuery: sql.slice(innerStart, closeParenIndex).trim(),
        rewriteWithFlatTable: (flatTableName) =>
            `${sql.slice(0, innerStart)}SELECT * FROM ${flatTableName}${sql.slice(
                closeParenIndex,
            )}`,
    };
};

type DuckdbPivotConnection = {
    run: (sql: string) => Promise<{
        getRowObjects: () => Promise<Record<string, unknown>[]>;
    }>;
    closeSync?: () => void;
    disconnectSync?: () => void;
};

const duckdbColumnTypeFromDimension = (type: DimensionType): string => {
    if (type === DimensionType.NUMBER) return 'DOUBLE';
    if (type === DimensionType.BOOLEAN) return 'BOOLEAN';
    return 'VARCHAR';
};

const duckdbPivotLiteral = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return `'${String(value).replace(/'/g, "''")}'`;
};

const duckdbPivotDimensionType = (value: unknown): DimensionType => {
    if (typeof value === 'number' || typeof value === 'bigint') {
        return DimensionType.NUMBER;
    }
    if (typeof value === 'boolean') return DimensionType.BOOLEAN;
    return DimensionType.STRING;
};

const createDuckdbFlatTable = async (
    db: DuckdbPivotConnection,
    tableName: string,
    fields: WarehouseResults['fields'],
): Promise<string[]> => {
    const columns = Object.keys(fields);
    if (columns.length === 0) {
        await db.run(`CREATE TABLE ${tableName} (dummy INTEGER)`);
        return columns;
    }
    const columnDefs = columns
        .map(
            (col) =>
                `"${col}" ${duckdbColumnTypeFromDimension(fields[col].type)}`,
        )
        .join(', ');
    await db.run(`CREATE TABLE ${tableName} (${columnDefs})`);
    return columns;
};

const insertBatchIntoDuckdb = async (
    db: DuckdbPivotConnection,
    tableName: string,
    columns: string[],
    rows: WarehouseResults['rows'],
): Promise<void> => {
    if (rows.length === 0 || columns.length === 0) return;
    const valuesSql = rows
        .map(
            (row) =>
                `(${columns
                    .map((col) => duckdbPivotLiteral(row[col]))
                    .join(', ')})`,
        )
        .join(', ');
    await db.run(
        `INSERT INTO ${tableName} (${columns
            .map((col) => `"${col}"`)
            .join(', ')}) VALUES ${valuesSql}`,
    );
};

export enum TrinoTypes {
    BOOLEAN = 'boolean',
    TINYINT = 'tinyint',
    SMALLINT = 'smallint',
    INTEGER = 'integer',
    BIGINT = 'bigint',
    REAL = 'real',
    DOUBLE = 'double',
    DECIMAL = 'decimal',
    VARCHAR = 'varchar',
    CHAR = 'char',
    VARBINARY = 'varbinary',
    JSON = 'json',
    DATE = 'date',
    TIME = 'time',
    TIME_TZ = 'time with time zone',
    TIMESTAMP = 'timestamp',
    TIMESTAMP_TZ = 'timestamp with time zone',
    INTERVAL_YEAR_MONTH = 'interval year to month',
    INTERVAL_DAY_TIME = 'interval day to second',
    ARRAY = 'array',
    MAP = 'map',
    ROW = 'row',
    IPADDRESS = 'ipaddress',
    UUID = 'uuid',
}

interface TableInfo {
    database: string;
    schema: string;
    table: string;
}

const getErrorMessage = (e: QueryError) => {
    // Trino returns Object of type QueryError
    if (e.message) {
        // Convert Object to Error
        return originalGetErrorMessage(new Error(e.message, { cause: e }));
    }
    return originalGetErrorMessage(e);
};
const queryTableSchema = ({
    database,
    schema,
    table,
}: TableInfo) => `SELECT table_catalog
                                                                         , table_schema
                                                                         , table_name
                                                                         , column_name
                                                                         , data_type
                                                                    FROM ${database}.information_schema.columns
                                                                    WHERE table_catalog = '${database}'
                                                                      AND table_schema = '${schema}'
                                                                      AND table_name = '${table}'
                                                                    ORDER BY 1, 2, 3, ordinal_position`;

const convertDataTypeToDimensionType = (
    type: TrinoTypes | string,
): DimensionType => {
    const typeWithoutTimePrecision = type.replace(/\(\d\)/, '');
    switch (typeWithoutTimePrecision) {
        case TrinoTypes.BOOLEAN:
            return DimensionType.BOOLEAN;
        case TrinoTypes.TINYINT:
            return DimensionType.NUMBER;
        case TrinoTypes.SMALLINT:
            return DimensionType.NUMBER;
        case TrinoTypes.INTEGER:
            return DimensionType.NUMBER;
        case TrinoTypes.BIGINT:
            return DimensionType.NUMBER;
        case TrinoTypes.REAL:
            return DimensionType.NUMBER;
        case TrinoTypes.DOUBLE:
            return DimensionType.NUMBER;
        case TrinoTypes.DECIMAL:
            return DimensionType.NUMBER;
        case TrinoTypes.DATE:
            return DimensionType.DATE;
        case TrinoTypes.TIMESTAMP:
            return DimensionType.TIMESTAMP;
        case TrinoTypes.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        default:
            return DimensionType.STRING;
    }
};

const catalogToSchema = (results: string[][][]): WarehouseCatalog => {
    const warehouseCatalog: WarehouseCatalog = {};
    Object.values(results).forEach((catalog) => {
        Object.values(catalog).forEach(
            ([
                table_catalog,
                table_schema,
                table_name,
                column_name,
                data_type,
            ]) => {
                warehouseCatalog[table_catalog] =
                    warehouseCatalog[table_catalog] || {};
                warehouseCatalog[table_catalog][table_schema] =
                    warehouseCatalog[table_catalog][table_schema] || {};
                warehouseCatalog[table_catalog][table_schema][table_name] =
                    warehouseCatalog[table_catalog][table_schema][table_name] ||
                    {};
                warehouseCatalog[table_catalog][table_schema][table_name][
                    column_name
                ] = convertDataTypeToDimensionType(data_type);
            },
        );
    });
    return warehouseCatalog;
};

/*
    Force lowercase for Trino column names
    When using trino and snowflake, some columns can be returned uppercase
    and we can't enforce "ALTER SESSION SET QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE;"
    like we do in snowflake client
*/
const normalizeColumnName = (columnName: string) => columnName.toLowerCase();

const resultHandler = (
    schema: { [key: string]: AnyType }[],
    data: AnyType[][],
) => {
    const s: string[] = schema.map((e) => e.name);
    return data.map((i) => {
        const item: { [key: string]: AnyType } = {};
        i.map((column, index) => {
            item[normalizeColumnName(s[index])] = column;
            return null;
        });
        return item;
    });
};

export class TrinoSqlBuilder extends WarehouseBaseSqlBuilder {
    readonly type = WarehouseTypes.TRINO;

    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.TRINO;
    }

    getEscapeStringQuoteChar(): string {
        return "'";
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `APPROX_PERCENTILE(${sql}, ${
                    (metric.percentile ?? 50) / 100
                })`;
            case MetricType.MEDIAN:
                return `APPROX_PERCENTILE(${sql},0.5)`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    getFloatingType(): string {
        return 'DOUBLE';
    }

    escapeString(value: string): string {
        if (typeof value !== 'string') {
            return value;
        }

        return (
            normalizeUnicode(value)
                // Trino uses single quote doubling like PostgreSQL
                .replaceAll("'", "''")
                // Escape backslashes first (before LIKE wildcards)
                .replaceAll('\\', '\\\\')
                // Remove SQL comments (-- and /* */)
                .replace(/--.*$/gm, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                // Remove null bytes
                .replaceAll('\0', '')
        );
    }

    getIntervalSql(value: number, unit: TimeIntervalUnit): string {
        // Trino uses INTERVAL with quoted value and separate unit keyword
        const unitStr = TrinoSqlBuilder.intervalUnitsSingular[unit];
        return `INTERVAL '${value}' ${unitStr}`;
    }

    getTimestampDiffSeconds(
        startTimestampSql: string,
        endTimestampSql: string,
    ): string {
        // Trino uses date_diff function
        return `DATE_DIFF('second', ${startTimestampSql}, ${endTimestampSql})`;
    }

    getMedianSql(valueSql: string): string {
        // Trino uses APPROX_PERCENTILE for median
        return `APPROX_PERCENTILE(${valueSql}, 0.5)`;
    }
}

export class TrinoWarehouseClient extends WarehouseBaseClient<CreateTrinoCredentials> {
    connectionOptions: ConnectionOptions;

    constructor(credentials: CreateTrinoCredentials) {
        super(credentials, new TrinoSqlBuilder(credentials.startOfWeek));
        this.connectionOptions = {
            auth: new BasicAuth(credentials.user, credentials.password),
            catalog: credentials.dbname,
            schema: credentials.schema,
            server: `${credentials.http_scheme}://${credentials.host}:${credentials.port}`,
            ...(credentials.source && { source: credentials.source }),
        };
    }

    private async getSession() {
        const client = Trino;

        let session: Trino;
        try {
            session = await client.create(this.connectionOptions);
        } catch (e: AnyType) {
            throw new WarehouseConnectionError(getErrorMessage(e));
        }

        return {
            session,
            close: async () => {
                console.info('Close trino connection');
            },
        };
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        const { session, close } = await this.getSession();
        let query: Iterator<QueryResult>;
        try {
            let alteredQuery = sql;
            if (options?.tags) {
                alteredQuery = `${alteredQuery}\n-- ${JSON.stringify(
                    options?.tags,
                )}`;
            }
            if (options?.timezone) {
                console.debug(`Setting Trino timezone to ${options?.timezone}`);
                await session.query(`SET TIME ZONE '${options?.timezone}'`);
            }
            query = await session.query(alteredQuery);

            let queryResult = await query.next();

            if (queryResult.value.error) {
                throw new WarehouseQueryError(
                    getErrorMessage(queryResult.value.error) ??
                        'Unexpected error in query execution',
                );
            }

            const schema: {
                name: string;
                type: string;
                typeSignature: { rawType: string };
            }[] = queryResult.value.columns ?? [];
            const fields = schema.reduce(
                (acc, column) => ({
                    ...acc,
                    [normalizeColumnName(column.name)]: {
                        type: convertDataTypeToDimensionType(
                            column.typeSignature.rawType ?? TrinoTypes.VARCHAR,
                        ),
                    },
                }),
                {},
            );

            // stream initial data, if available
            if (queryResult.value.data) {
                await streamCallback({
                    fields,
                    rows: resultHandler(schema, queryResult.value.data ?? []),
                });
            }
            // Using `await` in this loop ensures data chunks are fetched and processed sequentially.
            // This maintains order and data integrity.
            while (!queryResult.done) {
                // Per Trino protocol, absence of nextUri means the query is complete.
                // Some setups (like Honeydew semantic layer) return done=false with no nextUri,
                // which causes the trino-client library to return duplicate data on subsequent next() calls.
                // See: https://trino.io/docs/current/develop/client-protocol.html
                if (!queryResult.value.nextUri) {
                    // eslint-disable-next-line no-await-in-loop
                    queryResult = await query.next(); // Call .next() one more time to avoid warehouse timeouts
                    // Don't write data here - it would be duplicate. Continue to let loop exit naturally.
                    // eslint-disable-next-line no-continue
                    continue;
                }

                // eslint-disable-next-line no-await-in-loop
                queryResult = await query.next();

                // stream next chunk of data
                // eslint-disable-next-line no-await-in-loop
                await streamCallback({
                    fields,
                    rows: resultHandler(schema, queryResult.value.data ?? []),
                });
            }
        } catch (e: AnyType) {
            throw new WarehouseQueryError(getErrorMessage(e));
        } finally {
            await close();
        }
    }

    /**
     * Transparently pivots in DuckDB instead of pushing the pivot down to Trino.
     *
     * When the incoming SQL is a PivotQueryBuilder output (it starts with
     * `WITH original_query AS (...)`), we extract the inner base query, run only
     * that on Trino, and run the remaining pivot SQL in DuckDB over the Trino
     * results. Non-pivot queries are delegated to the base implementation
     * unchanged. Because we override the standard entrypoint, the services need
     * no changes — they keep passing the already-pivoted SQL.
     */
    async executeAsyncQuery(
        args: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback?: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void | Promise<void>,
    ): Promise<WarehouseExecuteAsyncQuery> {
        const pivot = splitPivotQuery(args.sql);
        if (!pivot) {
            return super.executeAsyncQuery(args, resultsStreamCallback);
        }

        const startTime = performance.now();

        // Create the in-memory DuckDB up front so we can stream Trino rows
        // straight into it batch-by-batch — we never hold the full flat result
        // set in a JS array. Uses @duckdb/node-api — the same DuckDB engine the
        // DuckDB warehouse adapter uses — so it never conflicts with another
        // DuckDB native addon in-process.
        const instance = await DuckDBInstance.create(':memory:');
        const db =
            (await instance.connect()) as unknown as DuckdbPivotConnection;

        let rows: WarehouseResults['rows'];
        let fields: WarehouseResults['fields'];
        try {
            // 1. Run ONLY the original (flat) query on Trino, inserting each
            //    streamed batch directly into the DuckDB flat table.
            let flatColumns: string[] | undefined;
            await this.streamQuery(
                pivot.originalQuery,
                async ({ rows: batch, fields: batchFields }) => {
                    if (!flatColumns) {
                        flatColumns = await createDuckdbFlatTable(
                            db,
                            DUCKDB_PIVOT_FLAT_TABLE,
                            batchFields,
                        );
                    }
                    await insertBatchIntoDuckdb(
                        db,
                        DUCKDB_PIVOT_FLAT_TABLE,
                        flatColumns,
                        batch,
                    );
                },
                { tags: args.tags, timezone: args.timezone },
            );

            if (!flatColumns) {
                // Trino streamed no batches, so there's nothing to pivot.
                rows = [];
                fields = {};
            } else {
                // 2. Run the pivot portion of the SQL in DuckDB (base query
                //    swapped for the flat table).
                const result = await db.run(
                    pivot.rewriteWithFlatTable(DUCKDB_PIVOT_FLAT_TABLE),
                );
                const rawRows = await result.getRowObjects();

                // Normalise DuckDB BIGINT (bigint) → number so downstream
                // JSON/transform handling matches the warehouse path.
                rows = rawRows.map((row) =>
                    Object.fromEntries(
                        Object.entries(row).map(([key, value]) => [
                            key,
                            typeof value === 'bigint' ? Number(value) : value,
                        ]),
                    ),
                );

                const firstRow = rows[0] ?? {};
                fields = Object.fromEntries(
                    Object.entries(firstRow).map(([name, value]) => [
                        name,
                        { type: duckdbPivotDimensionType(value) },
                    ]),
                );
            }
        } finally {
            db.closeSync?.();
            db.disconnectSync?.();
        }

        await resultsStreamCallback?.(rows, fields);

        return {
            queryId: null,
            queryMetadata: null,
            durationMs: performance.now() - startTime,
            totalRows: rows.length,
        };
    }

    async getCatalog(requests: TableInfo[]): Promise<WarehouseCatalog> {
        const { session, close } = await this.getSession();
        let results: string[][][];

        try {
            results = await processPromisesInBatches(
                requests,
                DEFAULT_BATCH_SIZE,
                async (request) => {
                    let query: Iterator<QueryResult> | null = null;

                    try {
                        query = await session.query(queryTableSchema(request));
                        const result = (await query.next()).value.data ?? [];
                        return result;
                    } catch (e: AnyType) {
                        throw new WarehouseQueryError(getErrorMessage(e));
                    } finally {
                        if (query) void close();
                    }
                },
            );
        } finally {
            await close();
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
        const schemaFilter = schema
            ? `AND table_schema = '${this.sanitizeInput(schema)}'`
            : '';
        const query = `
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE' 
            ${schemaFilter}
            ORDER BY 1,2,3
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
        const query = `
            SELECT table_catalog,
                   table_schema,
                   table_name,
                   column_name, 
                   data_type
            FROM information_schema.columns
            WHERE table_name = '${this.sanitizeInput(tableName)}'
            ${
                schema
                    ? `AND table_schema = '${this.sanitizeInput(schema)}'`
                    : ''
            }
            ${
                database
                    ? `AND table_catalog = '${this.sanitizeInput(database)}'`
                    : ''
            }
        `;
        const { rows } = await this.runQuery(query, tags);

        return this.parseWarehouseCatalog(rows, convertDataTypeToDimensionType);
    }

    async getAllTables() {
        const databaseName = this.connectionOptions.catalog;
        const whereSql = databaseName
            ? `AND table_catalog = '${this.sanitizeInput(databaseName)}'`
            : '';
        const filterSystemTables = `AND table_schema NOT IN ('information_schema', 'pg_catalog')`;
        const query = `
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
                ${whereSql}
                ${filterSystemTables}
            ORDER BY 1, 2, 3
        `;
        const { rows } = await this.runQuery(query, {}, undefined);
        return rows.map((row) => ({
            database: row.table_catalog,
            schema: row.table_schema,
            table: row.table_name,
        }));
    }
}
