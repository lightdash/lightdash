import { DuckDBInstance, DuckDBTypeId } from '@duckdb/node-api';
import {
    AnyType,
    CreatePostgresCredentials,
    DimensionType,
    Metric,
    MetricType,
    NotImplementedError,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import WarehouseBaseClient from './WarehouseBaseClient';
import WarehouseBaseSqlBuilder from './WarehouseBaseSqlBuilder';

type DuckdbStreamResult = {
    columnCount: number;
    columnNames: () => string[];
    columnTypeId: (columnIndex: number) => number;
    yieldRowObjectJson: () => AsyncIterableIterator<Record<string, AnyType>[]>;
};

type DuckdbPreparedStatement = {
    statementType: number;
    destroySync: () => void;
};

type DuckdbExtractedStatements = {
    count: number;
    prepare: (index: number) => Promise<DuckdbPreparedStatement>;
};

type DuckdbConnection = {
    run: (
        sql: string,
        values?: AnyType[] | Record<string, AnyType>,
    ) => Promise<unknown>;
    stream: (
        sql: string,
        values?: AnyType[] | Record<string, AnyType>,
    ) => Promise<DuckdbStreamResult>;
    extractStatements: (sql: string) => Promise<DuckdbExtractedStatements>;
    closeSync?: () => void;
    disconnectSync?: () => void;
};

type DuckdbInstance = {
    connect: () => Promise<DuckdbConnection>;
    closeSync?: () => void;
};

export type DuckdbS3SessionConfig = {
    endpoint: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
    useSsl: boolean;
};

export type DuckdbResourceLimits = {
    memoryLimit: string; // e.g. '256MB'
    threads: number; // e.g. 1
};

export type DuckdbLogger = {
    info: (message: string, metadata?: Record<string, unknown>) => void;
};

export type DuckdbQueryProfileMetrics = {
    latencyMs: number;
    cpuMs: number;
    waitMs: number;
    readParquetMs: number | null;
    bytesRead: number | null;
    rowsReturned: number | null;
    rowsScanned: number | null;
    scanAmplification: number | null;
};

export type DuckdbWarehouseClientArgs = {
    databasePath?: string;
    s3Config?: DuckdbS3SessionConfig;
    resourceLimits?: DuckdbResourceLimits;
    bufferPoolSize?: string; // e.g. '256MB' — controls DuckDB's buffer_pool_size for parquet/HTTP caching
    logger?: DuckdbLogger;
    onQueryProfile?: (profile: DuckdbQueryProfileMetrics) => void;
};

const DUCKDB_INTERNAL_CREDENTIALS: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    port: 5432,
    dbname: 'duckdb',
    schema: 'main',
    user: 'duckdb',
    password: 'duckdb',
};

export const mapFieldTypeFromTypeId = (typeId: number): DimensionType => {
    switch (typeId) {
        case DuckDBTypeId.DATE:
            return DimensionType.DATE;
        case DuckDBTypeId.TIME:
        case DuckDBTypeId.TIME_TZ:
        case DuckDBTypeId.TIMESTAMP:
        case DuckDBTypeId.TIMESTAMP_S:
        case DuckDBTypeId.TIMESTAMP_MS:
        case DuckDBTypeId.TIMESTAMP_NS:
        case DuckDBTypeId.TIMESTAMP_TZ:
            return DimensionType.TIMESTAMP;
        case DuckDBTypeId.BOOLEAN:
            return DimensionType.BOOLEAN;
        case DuckDBTypeId.TINYINT:
        case DuckDBTypeId.SMALLINT:
        case DuckDBTypeId.INTEGER:
        case DuckDBTypeId.BIGINT:
        case DuckDBTypeId.HUGEINT:
        case DuckDBTypeId.UTINYINT:
        case DuckDBTypeId.USMALLINT:
        case DuckDBTypeId.UINTEGER:
        case DuckDBTypeId.UBIGINT:
        case DuckDBTypeId.UHUGEINT:
        case DuckDBTypeId.FLOAT:
        case DuckDBTypeId.DOUBLE:
        case DuckDBTypeId.DECIMAL:
            return DimensionType.NUMBER;
        default:
            return DimensionType.STRING;
    }
};

export class DuckdbSqlBuilder extends WarehouseBaseSqlBuilder {
    getAdapterType(): SupportedDbtAdapter {
        return SupportedDbtAdapter.DUCKDB;
    }

    getFloatingType(): string {
        return 'DOUBLE';
    }

    getMetricSql(sql: string, metric: Metric): string {
        switch (metric.type) {
            case MetricType.PERCENTILE:
                return `QUANTILE_CONT(${sql}, ${(metric.percentile ?? 50) / 100})`;
            case MetricType.MEDIAN:
                return `MEDIAN(${sql})`;
            default:
                return super.getMetricSql(sql, metric);
        }
    }

    concatString(...args: string[]): string {
        return `(${args.join(' || ')})`;
    }
}

/**
 * Shared DuckDB instance — one per worker process.
 * All DuckdbWarehouseClient instances share the same underlying DuckDB instance
 * to maximize cache hits (parquet metadata, HTTP metadata, buffer pool).
 */
let sharedInstance: DuckdbInstance | null = null;
let httpfsInstalled = false;
let cachesConfigured = false;
let s3SecretConfigured = false;
let sharedBootstrapQueue: Promise<void> = Promise.resolve();

/**
 * Simple single-permit semaphore (mutex) for async code.
 * Ensures only one caller at a time enters the critical section,
 * while others await their turn.
 */
class AsyncSemaphore {
    private queue: Array<() => void> = [];

    private held = false;

    acquire(): Promise<void> {
        if (!this.held) {
            this.held = true;
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            this.queue.push(resolve);
        });
    }

    release(): void {
        const next = this.queue.shift();
        if (next) {
            next();
        } else {
            this.held = false;
        }
    }
}

const instanceSemaphore = new AsyncSemaphore();

async function getOrCreateSharedInstance(
    databasePath: string,
    logger?: DuckdbLogger,
): Promise<DuckdbInstance> {
    if (sharedInstance) return sharedInstance;
    await instanceSemaphore.acquire();
    try {
        if (sharedInstance) return sharedInstance;

        const t0 = performance.now();
        sharedInstance = await DuckDBInstance.create(databasePath);
        const createMs = performance.now() - t0;
        httpfsInstalled = false;
        cachesConfigured = false;
        s3SecretConfigured = false;
        logger?.info(
            `DuckDB shared instance created: path=${databasePath} createMs=${Math.round(createMs)}ms`,
        );
        return sharedInstance;
    } finally {
        instanceSemaphore.release();
    }
}

function clearSharedInstance(logger?: DuckdbLogger): void {
    if (sharedInstance) {
        try {
            sharedInstance.closeSync?.();
        } catch {
            // best-effort cleanup
        }
        sharedInstance = null;
        httpfsInstalled = false;
        cachesConfigured = false;
        s3SecretConfigured = false;
        sharedBootstrapQueue = Promise.resolve();
        logger?.info('DuckDB shared instance cleared');
    }
}

/** Reset shared state without closing — for use in tests with mocked instances. */
export function resetSharedDuckdbStateForTesting(): void {
    sharedInstance = null;
    httpfsInstalled = false;
    cachesConfigured = false;
    s3SecretConfigured = false;
    sharedBootstrapQueue = Promise.resolve();
}

async function withSharedBootstrapLock<T>(
    callback: () => Promise<T>,
): Promise<T> {
    const run = sharedBootstrapQueue.then(callback, callback);
    sharedBootstrapQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

// DuckDB StatementType values — see duckdb/common/enums/statement_type.hpp
const ALLOWED_STATEMENT_TYPES_USER_SQL = new Set([1 /* SELECT */]);

const BLOCKED_STATEMENT_TYPES_INTERNAL_SQL = new Set([
    12, // VARIABLE_SET
    20, // SET
    21, // LOAD
    23, // EXTENSION (INSTALL)
    25, // ATTACH
    26, // DETACH
]);

const BLOCKED_FUNCTION_PATTERN =
    /\b(current_setting|duckdb_settings|duckdb_secrets)\s*\(/i;

export class DuckdbWarehouseClient extends WarehouseBaseClient<CreatePostgresCredentials> {
    private readonly databasePath: string;

    private readonly s3Config?: DuckdbS3SessionConfig;

    private readonly resourceLimits?: DuckdbResourceLimits;

    private readonly bufferPoolSize?: string;

    private readonly logger?: DuckdbLogger;

    private readonly onQueryProfile?: (
        profile: DuckdbQueryProfileMetrics,
    ) => void;

    constructor(args: DuckdbWarehouseClientArgs = {}) {
        super(DUCKDB_INTERNAL_CREDENTIALS, new DuckdbSqlBuilder());
        this.databasePath = args.databasePath ?? ':memory:';
        this.s3Config = args.s3Config;
        this.resourceLimits = args.resourceLimits;
        this.bufferPoolSize = args.bufferPoolSize;
        this.logger = args.logger;
        this.onQueryProfile = args.onQueryProfile;
    }

    async close(): Promise<void> {
        clearSharedInstance(this.logger);
    }

    private getSQLWithMetadata(sql: string, tags?: Record<string, string>) {
        if (!tags) {
            return sql;
        }

        return `${sql}\n-- ${JSON.stringify(tags)}`;
    }

    private async connectWithRetry(): Promise<DuckdbConnection> {
        const instance = await getOrCreateSharedInstance(
            this.databasePath,
            this.logger,
        );
        try {
            return await instance.connect();
        } catch (firstError) {
            this.logger?.info(
                `DuckDB connect failed, retrying with fresh instance: ${firstError}`,
            );
            clearSharedInstance(this.logger);
            const freshInstance = await getOrCreateSharedInstance(
                this.databasePath,
                this.logger,
            );
            return freshInstance.connect();
        }
    }

    private async withSession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const sessionStart = performance.now();

        const connection = await this.connectWithRetry();
        const connectMs = performance.now() - sessionStart;

        // Only create a temp dir when resource limits are set (spill to disk).
        const tempDir = this.resourceLimits
            ? await fs.mkdtemp(path.join(os.tmpdir(), 'duckdb-temp-'))
            : undefined;

        try {
            const bootstrapStart = performance.now();
            await this.bootstrapSession(connection, tempDir);
            const bootstrapMs = performance.now() - bootstrapStart;

            const queryStart = performance.now();
            const result = await callback(connection);
            const queryMs = performance.now() - queryStart;

            const totalMs = performance.now() - sessionStart;
            this.logger?.info(
                `DuckDB session timing: connect=${Math.round(connectMs)}ms bootstrap=${Math.round(bootstrapMs)}ms query=${Math.round(queryMs)}ms total=${Math.round(totalMs)}ms`,
            );

            return result;
        } finally {
            connection.closeSync?.();
            connection.disconnectSync?.();
            // Note: we do NOT close the instance — it's shared across queries
            if (tempDir) {
                await fs.rm(tempDir, { recursive: true, force: true }).catch(
                    () => {}, // best-effort cleanup
                );
            }
        }
    }

    private async bootstrapSession(
        db: DuckdbConnection,
        tempDir: string | undefined,
    ): Promise<void> {
        // INSTALL httpfs and global settings are instance-level — serialize and
        // deduplicate them via the shared bootstrap lock.
        const installMs = await withSharedBootstrapLock(async () => {
            let nextInstallMs = 0;

            if (!httpfsInstalled) {
                const t0 = performance.now();
                await db.run('INSTALL httpfs;');
                nextInstallMs = performance.now() - t0;
                httpfsInstalled = true;
                this.logger?.info(
                    `DuckDB httpfs installed (first use): ${Math.round(nextInstallMs)}ms`,
                );
            }

            // Enable built-in caches. These are global settings and should not
            // be mutated concurrently on the shared instance.
            if (!cachesConfigured) {
                await db.run('SET enable_http_metadata_cache = true;');
                await db.run('SET enable_external_file_cache = true;');
                await db.run('SET parquet_metadata_cache = true;');

                await db.run('SET allow_community_extensions = false;');
                await db.run('SET autoinstall_known_extensions = false;');
                await db.run('SET autoload_known_extensions = false;');
                await db.run('SET allow_unredacted_secrets = false;');

                cachesConfigured = true;

                if (this.bufferPoolSize) {
                    await db.run(
                        `SET buffer_pool_size = '${this.bufferPoolSize}';`,
                    );
                }

                this.logger?.info(
                    `DuckDB caches enabled: http_metadata=true external_file=true parquet_metadata=true buffer_pool_size=${this.bufferPoolSize ?? 'default'}`,
                );
            }

            return nextInstallMs;
        });

        // LOAD httpfs is per-connection — always run it.
        const t1 = performance.now();
        await db.run('LOAD httpfs;');
        const loadMs = performance.now() - t1;

        if (this.resourceLimits && tempDir) {
            await db.run(
                `SET memory_limit = '${this.resourceLimits.memoryLimit}';`,
            );
            await db.run(`SET temp_directory = '${tempDir}';`);
            await db.run(`SET threads = ${this.resourceLimits.threads};`);
        }

        if (!this.s3Config) {
            this.logger?.info(
                `DuckDB bootstrap timing: install_httpfs=${Math.round(installMs)}ms load_httpfs=${Math.round(loadMs)}ms`,
            );
            return;
        }

        // DuckDB secrets are instance-level — they persist across all
        // connections on the same instance. Create once and skip on
        // subsequent connections.
        const s3ConfigMs = await withSharedBootstrapLock(async () => {
            if (s3SecretConfigured) return 0;

            const t2 = performance.now();

            const regionClause = this.s3Config!.region
                ? `REGION '${this.escapeString(this.s3Config!.region)}',`
                : '';
            const keyIdClause = this.s3Config!.accessKey
                ? `KEY_ID '${this.escapeString(this.s3Config!.accessKey)}',`
                : '';
            const secretClause = this.s3Config!.secretKey
                ? `SECRET '${this.escapeString(this.s3Config!.secretKey)}',`
                : '';

            await db.run(`CREATE OR REPLACE SECRET __lightdash_s3 (
                TYPE s3,
                ${keyIdClause}
                ${secretClause}
                ENDPOINT '${this.escapeString(this.s3Config!.endpoint)}',
                ${regionClause}
                URL_STYLE '${this.s3Config!.forcePathStyle ? 'path' : 'vhost'}',
                USE_SSL ${this.s3Config!.useSsl}
            );`);

            s3SecretConfigured = true;
            this.logger?.info(
                `DuckDB S3 secret configured (first use): ${Math.round(performance.now() - t2)}ms`,
            );

            return performance.now() - t2;
        });

        this.logger?.info(
            `DuckDB bootstrap timing: install_httpfs=${Math.round(installMs)}ms load_httpfs=${Math.round(loadMs)}ms s3_config=${Math.round(s3ConfigMs)}ms`,
        );
    }

    private getBindValues(options?: {
        values?: AnyType[];
        queryParams?: Record<string, AnyType>;
    }): AnyType[] | Record<string, AnyType> | undefined {
        const hasValues = !!options?.values && options.values.length > 0;
        const hasQueryParams =
            !!options?.queryParams &&
            Object.keys(options.queryParams).length > 0;

        if (hasValues && hasQueryParams) {
            throw new NotImplementedError(
                'DuckDB streamQuery does not support using values and queryParams together',
            );
        }

        if (hasValues) {
            return options?.values;
        }

        if (hasQueryParams) {
            return options?.queryParams;
        }

        return undefined;
    }

    private async logQueryProfile(
        profilePath: string,
        logger: DuckdbLogger,
        tags?: Record<string, string>,
    ): Promise<void> {
        try {
            const raw = await fs.readFile(profilePath, 'utf-8');
            const profile = JSON.parse(raw);

            const operators: {
                name: string;
                timingMs: number;
                rows: number;
            }[] = [];
            const walk = (node: AnyType): void => {
                if (node.operator_name) {
                    operators.push({
                        name: String(node.operator_name).trim(),
                        timingMs: Math.round(
                            (node.operator_timing ?? 0) * 1000,
                        ),
                        rows: node.operator_cardinality ?? 0,
                    });
                }
                // eslint-disable-next-line no-restricted-syntax
                for (const child of node.children ?? []) {
                    walk(child);
                }
            };
            walk(profile);

            const operatorStr = operators
                .map((op) => `${op.name}=${op.timingMs}ms(${op.rows}rows)`)
                .join(' ');
            const latencyMs = Math.round((profile.latency ?? 0) * 1000);
            const cpuMs = Math.round((profile.cpu_time ?? 0) * 1000);
            const waitMs = Math.max(latencyMs - cpuMs, 0);
            const readParquetOperators = operators.filter(
                (op) => op.name === 'READ_PARQUET',
            );
            const readParquetMs =
                readParquetOperators.length > 0
                    ? readParquetOperators.reduce(
                          (sum, op) => sum + op.timingMs,
                          0,
                      )
                    : null;
            const rowsScanned =
                readParquetOperators.length > 0
                    ? readParquetOperators.reduce((sum, op) => sum + op.rows, 0)
                    : null;
            const rowsReturned =
                typeof profile.rows_returned === 'number'
                    ? profile.rows_returned
                    : null;
            const bytesRead =
                typeof profile.total_bytes_read === 'number'
                    ? profile.total_bytes_read
                    : null;
            const scanAmplification =
                rowsScanned !== null && rowsReturned !== null
                    ? rowsScanned / Math.max(rowsReturned, 1)
                    : null;
            logger.info(
                `DuckDB query profile: latency=${latencyMs}ms cpu=${cpuMs}ms rows=${profile.rows_returned} bytes_read=${profile.total_bytes_read} operators=[${operatorStr}]`,
                {
                    ...tags,
                    latencyMs,
                    cpuMs,
                    waitMs,
                    readParquetMs,
                    bytesRead,
                    rowsScanned,
                    rowsReturned,
                    scanAmplification,
                },
            );

            this.onQueryProfile?.({
                latencyMs,
                cpuMs,
                waitMs,
                readParquetMs,
                bytesRead,
                rowsReturned,
                rowsScanned,
                scanAmplification,
            });
        } catch {
            // profiling output not available, skip
        } finally {
            await fs.rm(profilePath, { force: true }).catch(() => {});
        }
    }

    private static getFieldsFromStreamResult(
        result: DuckdbStreamResult,
    ): WarehouseResults['fields'] {
        const columnNames = result.columnNames();
        const fields: WarehouseResults['fields'] = {};
        for (let i = 0; i < result.columnCount; i += 1) {
            fields[columnNames[i]] = {
                type: mapFieldTypeFromTypeId(result.columnTypeId(i)),
            };
        }
        return fields;
    }

    private static stripSqlComments(sql: string): string {
        return sql
            .replace(/--[^\n]*/g, '') // line comments
            .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
    }

    private static validateSqlFunctions(sql: string): void {
        const stripped = DuckdbWarehouseClient.stripSqlComments(sql);
        const match = stripped.match(BLOCKED_FUNCTION_PATTERN);
        if (match) {
            throw new Error(
                `SQL validation error: function '${match[1]}' is not allowed`,
            );
        }
    }

    private async validateUserSql(
        db: DuckdbConnection,
        sql: string,
    ): Promise<void> {
        const extracted = await db.extractStatements(sql);

        if (extracted.count === 0) {
            throw new Error('SQL validation error: empty SQL statement');
        }

        if (extracted.count > 1) {
            throw new Error(
                'SQL validation error: multiple SQL statements are not allowed',
            );
        }

        const stmt = await extracted.prepare(0);
        try {
            if (!ALLOWED_STATEMENT_TYPES_USER_SQL.has(stmt.statementType)) {
                throw new Error(
                    `SQL validation error: only SELECT statements are allowed (got statement type ${stmt.statementType})`,
                );
            }
        } finally {
            stmt.destroySync();
        }

        DuckdbWarehouseClient.validateSqlFunctions(sql);
    }

    private async validateInternalSql(
        db: DuckdbConnection,
        sql: string,
    ): Promise<void> {
        const extracted = await db.extractStatements(sql);

        if (extracted.count === 0) {
            throw new Error('SQL validation error: empty SQL statement');
        }

        for (let i = 0; i < extracted.count; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const stmt = await extracted.prepare(i);
            try {
                if (
                    BLOCKED_STATEMENT_TYPES_INTERNAL_SQL.has(stmt.statementType)
                ) {
                    throw new Error(
                        `SQL validation error: statement type ${stmt.statementType} is not allowed in internal SQL`,
                    );
                }
            } finally {
                stmt.destroySync();
            }
        }

        DuckdbWarehouseClient.validateSqlFunctions(sql);
    }

    async streamQuery(
        sql: string,
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options?: {
            values?: AnyType[];
            queryParams?: Record<string, AnyType>;
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void> {
        await this.withSession(async (db) => {
            if (options?.timezone) {
                await db.run(
                    `SET TimeZone = '${this.escapeString(options.timezone)}';`,
                );
            }

            const profilePath = this.logger
                ? path.join(
                      os.tmpdir(),
                      `duckdb-profile-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
                  )
                : undefined;

            if (profilePath) {
                await db.run("PRAGMA enable_profiling='json';");
                await db.run(`PRAGMA profiling_output='${profilePath}';`);
            }

            await this.validateUserSql(db, sql);

            const result = await db.stream(
                this.getSQLWithMetadata(sql, options?.tags),
                this.getBindValues(options),
            );
            const fields =
                DuckdbWarehouseClient.getFieldsFromStreamResult(result);

            // eslint-disable-next-line no-restricted-syntax
            for await (const rows of result.yieldRowObjectJson()) {
                await streamCallback({ fields, rows });
            }

            if (profilePath) {
                await this.logQueryProfile(
                    profilePath,
                    this.logger!,
                    options?.tags,
                );
            }
        });
    }

    async executeAsyncQuery(
        ...args: Parameters<
            WarehouseBaseClient<CreatePostgresCredentials>['executeAsyncQuery']
        >
    ) {
        const [queryArgs, resultsStreamCallback] = args;
        const startTime = performance.now();
        let callbackTimeMs = 0;

        const result = await super.executeAsyncQuery(
            queryArgs,
            resultsStreamCallback
                ? async (rows, fields) => {
                      const callbackStartTime = performance.now();
                      try {
                          await resultsStreamCallback(rows, fields);
                      } finally {
                          callbackTimeMs +=
                              performance.now() - callbackStartTime;
                      }
                  }
                : undefined,
        );

        return {
            ...result,
            durationMs: Math.max(
                0,
                performance.now() - startTime - callbackTimeMs,
            ),
        };
    }

    async runSql(sql: string): Promise<void> {
        await this.withSession(async (db) => {
            await this.validateInternalSql(db, sql);
            await db.run(sql);
        });
    }

    async runSqlWithMetrics(sql: string): Promise<{
        bootstrapMs: number;
        queryMs: number;
        totalMs: number;
    }> {
        const totalStart = performance.now();
        let bootstrapMs = 0;
        let queryMs = 0;

        await this.withSession(async (db) => {
            await this.validateInternalSql(db, sql);
            bootstrapMs = performance.now() - totalStart;
            const queryStart = performance.now();
            await db.run(sql);
            queryMs = performance.now() - queryStart;
        });

        return {
            bootstrapMs: Math.round(bootstrapMs),
            queryMs: Math.round(queryMs),
            totalMs: Math.round(performance.now() - totalStart),
        };
    }

    async runQuery(
        ...args: Parameters<
            WarehouseBaseClient<CreatePostgresCredentials>['runQuery']
        >
    ) {
        return super.runQuery(...args);
    }

    async test(): Promise<void> {
        await super.test();
    }

    async getCatalog(
        _config: { database: string; schema: string; table: string }[],
    ): Promise<WarehouseCatalog> {
        throw new NotImplementedError(
            'DuckDB catalog discovery is not implemented yet',
        );
    }

    async getAllTables(
        _schema?: string,
        _tags?: Record<string, string>,
    ): Promise<
        {
            database: string;
            schema: string;
            table: string;
        }[]
    > {
        throw new NotImplementedError(
            'DuckDB table discovery is not implemented yet',
        );
    }

    async getFields(
        _tableName: string,
        _schema?: string,
        _database?: string,
        _tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        throw new NotImplementedError(
            'DuckDB field discovery is not implemented yet',
        );
    }
}
