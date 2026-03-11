import { DuckDBInstance, DuckDBTypeId, StatementType } from '@duckdb/node-api';
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
    statementType: StatementType;
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

type DuckdbSecurityProfile = 'internal' | 'user';

type SharedDuckdbState = {
    cachesConfigured: boolean;
    httpfsInstalled: boolean;
    instance: DuckdbInstance;
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

export type DuckdbWarehouseClientArgs = {
    databasePath?: string;
    s3Config?: DuckdbS3SessionConfig;
    resourceLimits?: DuckdbResourceLimits;
    bufferPoolSize?: string; // e.g. '256MB' — controls DuckDB's buffer_pool_size for parquet/HTTP caching
    logger?: DuckdbLogger;
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
 * Shared DuckDB instances — one per worker/profile pair.
 * User-query sessions and internal materialization sessions use separate
 * instances because their security settings differ.
 */
const sharedInstances = new Map<string, SharedDuckdbState>();

function getSharedInstanceKey(
    databasePath: string,
    profile: DuckdbSecurityProfile,
): string {
    return `${profile}:${databasePath}`;
}

async function getOrCreateSharedInstance(
    databasePath: string,
    profile: DuckdbSecurityProfile,
    logger?: DuckdbLogger,
): Promise<SharedDuckdbState> {
    const key = getSharedInstanceKey(databasePath, profile);
    const existing = sharedInstances.get(key);
    if (existing) {
        return existing;
    }

    const t0 = performance.now();
    const instance = (await DuckDBInstance.create(
        databasePath,
    )) as DuckdbInstance;
    const createMs = performance.now() - t0;
    const state: SharedDuckdbState = {
        cachesConfigured: false,
        httpfsInstalled: false,
        instance,
    };
    sharedInstances.set(key, state);
    logger?.info(
        `DuckDB shared instance created: profile=${profile} path=${databasePath} createMs=${Math.round(createMs)}ms`,
    );
    return state;
}

function updateSharedInstanceState(
    databasePath: string,
    profile: DuckdbSecurityProfile,
    updates: Partial<
        Pick<SharedDuckdbState, 'cachesConfigured' | 'httpfsInstalled'>
    >,
): SharedDuckdbState {
    const key = getSharedInstanceKey(databasePath, profile);
    const state = sharedInstances.get(key);
    if (!state) {
        throw new Error(`Missing shared DuckDB instance for key ${key}`);
    }

    const nextState = {
        ...state,
        ...updates,
    };
    sharedInstances.set(key, nextState);
    return nextState;
}

function clearSharedInstance(
    logger?: DuckdbLogger,
    opts?: {
        databasePath?: string;
        profile?: DuckdbSecurityProfile;
    },
): void {
    let keysToClear: string[];
    if (opts?.databasePath && opts?.profile) {
        keysToClear = [getSharedInstanceKey(opts.databasePath, opts.profile)];
    } else if (opts?.databasePath) {
        keysToClear = (['internal', 'user'] as DuckdbSecurityProfile[]).map(
            (profile) => getSharedInstanceKey(opts.databasePath!, profile),
        );
    } else {
        keysToClear = [...sharedInstances.keys()];
    }

    keysToClear.forEach((key) => {
        const state = sharedInstances.get(key);
        if (!state) {
            return;
        }

        try {
            state.instance.closeSync?.();
        } catch {
            // best-effort cleanup
        }
        sharedInstances.delete(key);
        logger?.info('DuckDB shared instance cleared');
    });
}

/** Reset shared state without closing — for use in tests with mocked instances. */
export function resetSharedDuckdbStateForTesting(): void {
    sharedInstances.clear();
}

const ALLOWED_STATEMENT_TYPES_USER_SQL = new Set<StatementType>([
    StatementType.SELECT,
]);

const ALLOWED_STATEMENT_TYPES_INTERNAL_SQL = new Set<StatementType>([
    StatementType.COPY,
    StatementType.SELECT,
]);

export class DuckdbWarehouseClient extends WarehouseBaseClient<CreatePostgresCredentials> {
    private readonly databasePath: string;

    private readonly s3Config?: DuckdbS3SessionConfig;

    private readonly resourceLimits?: DuckdbResourceLimits;

    private readonly bufferPoolSize?: string;

    private readonly logger?: DuckdbLogger;

    constructor(args: DuckdbWarehouseClientArgs = {}) {
        super(DUCKDB_INTERNAL_CREDENTIALS, new DuckdbSqlBuilder());
        this.databasePath = args.databasePath ?? ':memory:';
        this.s3Config = args.s3Config;
        this.resourceLimits = args.resourceLimits;
        this.bufferPoolSize = args.bufferPoolSize;
        this.logger = args.logger;
    }

    async close(): Promise<void> {
        clearSharedInstance(this.logger, { databasePath: this.databasePath });
    }

    private getSQLWithMetadata(sql: string, tags?: Record<string, string>) {
        if (!tags) {
            return sql;
        }

        return `${sql}\n-- ${JSON.stringify(tags)}`;
    }

    private async connectWithRetry(profile: DuckdbSecurityProfile): Promise<{
        connection: DuckdbConnection;
        state: SharedDuckdbState;
    }> {
        const state = await getOrCreateSharedInstance(
            this.databasePath,
            profile,
            this.logger,
        );
        try {
            return {
                connection: await state.instance.connect(),
                state,
            };
        } catch (firstError) {
            this.logger?.info(
                `DuckDB connect failed, retrying with fresh instance: profile=${profile} error=${firstError}`,
            );
            clearSharedInstance(this.logger, {
                databasePath: this.databasePath,
                profile,
            });
            const freshState = await getOrCreateSharedInstance(
                this.databasePath,
                profile,
                this.logger,
            );
            return {
                connection: await freshState.instance.connect(),
                state: freshState,
            };
        }
    }

    private async withSession<T>(
        profile: DuckdbSecurityProfile,
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const sessionStart = performance.now();

        const { connection, state } = await this.connectWithRetry(profile);
        const connectMs = performance.now() - sessionStart;

        // Only internal sessions can spill to a local temp directory.
        const tempDir =
            profile === 'internal' && this.resourceLimits
                ? await fs.mkdtemp(path.join(os.tmpdir(), 'duckdb-temp-'))
                : undefined;

        try {
            const bootstrapStart = performance.now();
            await this.bootstrapSession(connection, state, profile, tempDir);
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
        sharedState: SharedDuckdbState,
        profile: DuckdbSecurityProfile,
        tempDir: string | undefined,
    ): Promise<void> {
        let installMs = 0;
        let state = sharedState;
        if (!state.httpfsInstalled) {
            const t0 = performance.now();
            await db.run('INSTALL httpfs;');
            installMs = performance.now() - t0;
            state = updateSharedInstanceState(this.databasePath, profile, {
                httpfsInstalled: true,
            });
            this.logger?.info(
                `DuckDB httpfs installed (first use): ${Math.round(installMs)}ms`,
            );
        }

        const t1 = performance.now();
        await db.run('LOAD httpfs;');
        const loadMs = performance.now() - t1;

        // Enable built-in caches — these are GLOBAL settings (instance-level, not
        // connection-level), so they only need to be set once per shared instance.
        if (!state.cachesConfigured) {
            await db.run('SET enable_http_metadata_cache = true;');
            await db.run('SET enable_external_file_cache = true;');
            await db.run('SET parquet_metadata_cache = true;');

            if (profile === 'user') {
                await db.run("SET disabled_filesystems = 'LocalFileSystem';");
            }
            await db.run('SET allow_community_extensions = false;');
            await db.run('SET autoinstall_known_extensions = false;');
            await db.run('SET autoload_known_extensions = false;');
            await db.run('SET allow_unredacted_secrets = false;');

            state = updateSharedInstanceState(this.databasePath, profile, {
                cachesConfigured: true,
            });

            if (this.bufferPoolSize) {
                await db.run(
                    `SET buffer_pool_size = '${this.bufferPoolSize}';`,
                );
            }

            this.logger?.info(
                `DuckDB caches enabled: http_metadata=true external_file=true parquet_metadata=true buffer_pool_size=${this.bufferPoolSize ?? 'default'}`,
            );
        }

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

        const t2 = performance.now();

        const regionClause = this.s3Config.region
            ? `REGION '${this.escapeString(this.s3Config.region)}',`
            : '';
        const keyIdClause = this.s3Config.accessKey
            ? `KEY_ID '${this.escapeString(this.s3Config.accessKey)}',`
            : '';
        const secretClause = this.s3Config.secretKey
            ? `SECRET '${this.escapeString(this.s3Config.secretKey)}',`
            : '';

        await db.run(`CREATE OR REPLACE SECRET __lightdash_s3 (
            TYPE s3,
            ${keyIdClause}
            ${secretClause}
            ENDPOINT '${this.escapeString(this.s3Config.endpoint)}',
            ${regionClause}
            URL_STYLE '${this.s3Config.forcePathStyle ? 'path' : 'vhost'}',
            USE_SSL ${this.s3Config.useSsl}
        );`);

        const s3ConfigMs = performance.now() - t2;

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
                    !ALLOWED_STATEMENT_TYPES_INTERNAL_SQL.has(
                        stmt.statementType,
                    )
                ) {
                    throw new Error(
                        `SQL validation error: statement type ${stmt.statementType} is not allowed in internal SQL`,
                    );
                }
            } finally {
                stmt.destroySync();
            }
        }
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
        await this.withSession('user', async (db) => {
            if (options?.timezone) {
                await db.run(
                    `SET TimeZone = '${this.escapeString(options.timezone)}';`,
                );
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
        await this.withSession('internal', async (db) => {
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

        await this.withSession('internal', async (db) => {
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
