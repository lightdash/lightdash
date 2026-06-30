import { DuckDBInstance, DuckDBTypeId } from '@duckdb/node-api';
import {
    AnyType,
    CreateDuckdbCredentials,
    CreateDuckdbDucklakeCredentials,
    CreateDuckdbMotherduckCredentials,
    DimensionType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    formatMilliseconds,
    getErrorMessage,
    Metric,
    MetricType,
    NotImplementedError,
    ParameterError,
    SupportedDbtAdapter,
    WarehouseCatalog,
    WarehouseResults,
    WarehouseTypes,
} from '@lightdash/common';
import { createHash } from 'crypto';
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

type DuckdbRunResult = {
    getRowObjects: () => Promise<Record<string, AnyType>[]>;
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
    ) => Promise<DuckdbRunResult>;
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

type DuckdbBootstrapTiming = {
    bootstrapMs: number;
    httpfsMs: number;
};

type SharedInstanceAcquisition = {
    instance: DuckdbInstance;
    cacheHit: boolean;
    semaphoreWaitMs: number;
    instanceCreateMs: number;
    bootstrapMs: number;
};

type SharedConnectionAcquisition = SharedInstanceAcquisition & {
    connection: DuckdbConnection;
    connectMs: number;
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
    memoryLimit?: string; // e.g. '256MB'
    threads?: number; // e.g. 1
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

export type DuckdbS3Credentials = {
    type: 'duckdb_s3';
    s3Config: DuckdbS3SessionConfig;
};

export type DuckdbConnectionCredentials = DuckdbS3Credentials;

// Backwards-compatible alias while this API settles.
export type DuckdbS3ConnectionConfig = DuckdbS3Credentials;

export type DuckdbWarehouseClientOptions = {
    /** Resource-constrained isolated sessions, used for materialization/parquet conversion. */
    resourceLimits?: DuckdbResourceLimits;
    /** Resource limits for query sessions. When combined with instanceCacheKey, they apply to the shared warm instance. */
    sharedResourceLimits?: DuckdbResourceLimits;
    /**
     * Optional process-wide cache key for a shared DuckDB instance.
     * The cache key is the instance identity: callers must use a different key for
     * different connection settings / resource limits. Leave undefined for non-shared
     * usage such as materialization and future MotherDuck querying.
     */
    instanceCacheKey?: string;
    logger?: DuckdbLogger;
    onQueryProfile?: (profile: DuckdbQueryProfileMetrics) => void;
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

const mapFieldTypeFromString = (typeName: string): DimensionType => {
    const upper = typeName.toUpperCase();
    if (upper === 'DATE') return DimensionType.DATE;
    if (
        upper.includes('TIMESTAMP') ||
        upper === 'TIME' ||
        upper === 'TIMETZ' ||
        upper === 'TIME WITH TIME ZONE'
    )
        return DimensionType.TIMESTAMP;
    if (upper === 'BOOLEAN') return DimensionType.BOOLEAN;
    if (upper === 'INTERVAL') return DimensionType.STRING;
    if (
        upper.includes('INT') ||
        upper === 'FLOAT' ||
        upper === 'DOUBLE' ||
        upper === 'REAL' ||
        upper.startsWith('DECIMAL') ||
        upper.startsWith('NUMERIC') ||
        upper === 'HUGEINT' ||
        upper === 'UHUGEINT'
    )
        return DimensionType.NUMBER;
    return DimensionType.STRING;
};

const DUCKDB_INTERNAL_CREDENTIALS: CreateDuckdbMotherduckCredentials = {
    type: WarehouseTypes.DUCKDB,
    connectionType: DuckdbConnectionType.MOTHERDUCK,
    database: ':memory:',
    schema: 'main',
    token: '',
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

const BLOCKED_USER_SQL_FILE_FUNCTION_PATTERN =
    /\b(read_(?:blob|csv(?:_auto)?|json(?:_auto|_objects(?:_auto)?)?|ndjson(?:_auto|_objects(?:_auto)?)?|parquet|text|xlsx))\s*\(/i;

const BLOCKED_USER_SQL_FILE_TABLE_PATTERN = /\b(?:from|join)\s+'[^']*'/i;

export type DuckdbWarehouseClientArgs = {
    databasePath?: string;
    s3Config?: DuckdbS3SessionConfig;
};

export class DuckdbWarehouseClient extends WarehouseBaseClient<CreateDuckdbMotherduckCredentials> {
    private static readonly sharedInstances = new Map<string, DuckdbInstance>();

    private static readonly sharedInstanceSemaphores = new Map<
        string,
        AsyncSemaphore
    >();

    private static readonly sqlBuilder = new DuckdbSqlBuilder();

    private readonly databasePath: string;

    private readonly s3Config?: DuckdbS3SessionConfig;

    private readonly ducklakeConfig?: CreateDuckdbDucklakeCredentials;

    private readonly resourceLimits?: DuckdbResourceLimits;

    private readonly sharedResourceLimits?: DuckdbResourceLimits;

    private readonly instanceCacheKey?: string;

    private readonly logger?: DuckdbLogger;

    private readonly onQueryProfile?: (
        profile: DuckdbQueryProfileMetrics,
    ) => void;

    constructor(
        credentials?: CreateDuckdbCredentials | DuckdbConnectionCredentials,
        options?: DuckdbWarehouseClientOptions,
    ) {
        const isS3Only =
            credentials &&
            'type' in credentials &&
            credentials.type === 'duckdb_s3';
        const isDucklake =
            !isS3Only &&
            credentials &&
            'type' in credentials &&
            credentials.type === WarehouseTypes.DUCKDB &&
            credentials.connectionType === DuckdbConnectionType.DUCKLAKE;

        let effectiveCredentials: CreateDuckdbMotherduckCredentials;
        if (isS3Only) {
            effectiveCredentials = DUCKDB_INTERNAL_CREDENTIALS;
        } else if (isDucklake) {
            const ducklake = credentials as CreateDuckdbDucklakeCredentials;
            // DuckLake is attached on top of an in-memory base instance.
            // Surface the catalog alias as the DuckDB database name so the
            // existing information_schema queries line up.
            effectiveCredentials = {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                database: ducklake.catalogAlias ?? 'ducklake',
                schema: ducklake.schema,
                token: '',
                threads: ducklake.threads,
                requireUserCredentials: ducklake.requireUserCredentials,
                startOfWeek: ducklake.startOfWeek,
                dataTimezone: ducklake.dataTimezone,
            };
        } else {
            effectiveCredentials =
                (credentials as CreateDuckdbMotherduckCredentials) ??
                DUCKDB_INTERNAL_CREDENTIALS;
        }

        super(
            effectiveCredentials,
            new DuckdbSqlBuilder(effectiveCredentials.startOfWeek),
        );

        if (isS3Only) {
            this.s3Config = (credentials as DuckdbS3Credentials).s3Config;
        }

        if (isDucklake) {
            this.ducklakeConfig =
                credentials as CreateDuckdbDucklakeCredentials;
        }

        // Project DuckDB credentials map to MotherDuck only. The in-memory
        // internal credentials remain available for pre-aggregate helper flows.
        if (
            this.ducklakeConfig ||
            effectiveCredentials.database === ':memory:'
        ) {
            this.databasePath = ':memory:';
        } else {
            const token = effectiveCredentials.token.trim();
            if (!token) {
                throw new ParameterError(
                    'MotherDuck token is required for DuckDB warehouse connections',
                );
            }
            this.databasePath = `md:${effectiveCredentials.database}?motherduck_token=${token}`;
        }

        this.resourceLimits = options?.resourceLimits;
        this.sharedResourceLimits = options?.sharedResourceLimits;
        // DuckLake attaches a postgres catalog secret on every fresh DuckDB
        // instance, and the postgres extension only pools 8 connections per
        // instance — so parallel getFields() calls during project compile
        // exhaust the pool. Default DuckLake clients to a shared warm instance
        // keyed on the credentials so the attach runs once.
        const ducklakeAutoCacheKey = this.ducklakeConfig
            ? `ducklake:${DuckdbWarehouseClient.hashDucklakeConfig(this.ducklakeConfig)}`
            : undefined;
        this.instanceCacheKey =
            options?.instanceCacheKey ?? ducklakeAutoCacheKey;
        this.logger = options?.logger;
        this.onQueryProfile = options?.onQueryProfile;
    }

    private static hashDucklakeConfig(
        ducklake: CreateDuckdbDucklakeCredentials,
    ): string {
        return createHash('sha256')
            .update(JSON.stringify(ducklake))
            .digest('hex')
            .slice(0, 16);
    }

    static createForPreAggregate(
        credentials?: DuckdbConnectionCredentials,
        options?: DuckdbWarehouseClientOptions,
    ): DuckdbWarehouseClient {
        return new DuckdbWarehouseClient(credentials, options);
    }

    private static getSharedInstanceSemaphore(
        instanceCacheKey: string,
    ): AsyncSemaphore {
        const existingSemaphore =
            DuckdbWarehouseClient.sharedInstanceSemaphores.get(
                instanceCacheKey,
            );

        if (existingSemaphore) {
            return existingSemaphore;
        }

        const semaphore = new AsyncSemaphore();
        DuckdbWarehouseClient.sharedInstanceSemaphores.set(
            instanceCacheKey,
            semaphore,
        );
        return semaphore;
    }

    private getRequiredInstanceCacheKey(): string {
        if (!this.instanceCacheKey) {
            throw new Error(
                'DuckDB instanceCacheKey is required for shared instances',
            );
        }

        return this.instanceCacheKey;
    }

    private getSQLWithMetadata(sql: string, tags?: Record<string, string>) {
        if (!tags) {
            return sql;
        }

        return `${sql}\n-- ${JSON.stringify(tags)}`;
    }

    private static async hardenInstance(
        db: DuckdbConnection,
        options?: { allowKnownExtensionAutoload?: boolean },
    ): Promise<void> {
        await db.run('SET allow_community_extensions = false;');
        const autoload = options?.allowKnownExtensionAutoload ?? false;
        await db.run(`SET autoinstall_known_extensions = ${autoload};`);
        await db.run(`SET autoload_known_extensions = ${autoload};`);
        await db.run('SET allow_unredacted_secrets = false;');
    }

    private static usesS3CredentialChain(
        s3Config: DuckdbS3SessionConfig,
    ): boolean {
        return !(s3Config.accessKey && s3Config.secretKey);
    }

    private static async loadAwsExtensionForCredentialChain(
        db: DuckdbConnection,
        s3Config?: DuckdbS3SessionConfig,
    ): Promise<void> {
        if (s3Config && DuckdbWarehouseClient.usesS3CredentialChain(s3Config)) {
            await db.run('INSTALL aws;');
            await db.run('LOAD aws;');
        }
    }

    private static async bootstrapQuerySession(
        db: DuckdbConnection,
        client: DuckdbWarehouseClient,
    ): Promise<DuckdbBootstrapTiming> {
        const bootstrapStart = performance.now();
        const httpfsStart = performance.now();
        if (!client.ducklakeConfig) {
            // For DuckLake mode, httpfs and the ducklake/postgres/mysql/azure
            // extensions are autoloaded by ATTACH — no explicit INSTALL/LOAD.
            await db.run('INSTALL httpfs;');
            await db.run('LOAD httpfs;');
            await DuckdbWarehouseClient.loadAwsExtensionForCredentialChain(
                db,
                client.s3Config,
            );
        }
        const httpfsMs = performance.now() - httpfsStart;

        await db.run('SET enable_http_metadata_cache = true;');
        await db.run('SET enable_external_file_cache = true;');
        await db.run('SET parquet_metadata_cache = true;');

        if (client.ducklakeConfig) {
            // Parallel getFields() calls during compile all funnel through the
            // attached postgres catalog. The duckdb-postgres extension caps
            // the per-attach pool at 8 by default, which the compile easily
            // exhausts on projects with >8 models.
            await db.run('SET pg_connection_limit = 64;');
        }

        await DuckdbWarehouseClient.hardenInstance(db, {
            allowKnownExtensionAutoload: !!client.ducklakeConfig,
        });

        if (client.sharedResourceLimits?.memoryLimit) {
            await db.run(
                `SET memory_limit = '${client.sharedResourceLimits.memoryLimit}';`,
            );
        }

        if (client.sharedResourceLimits?.threads) {
            await db.run(
                `SET threads = ${client.sharedResourceLimits.threads};`,
            );
        }

        if (client.s3Config) {
            await db.run(
                DuckdbWarehouseClient.buildS3SecretSql(client.s3Config),
            );
        }

        if (client.ducklakeConfig) {
            const stmts = DuckdbWarehouseClient.buildDucklakeAttachSql(
                client.ducklakeConfig,
            );
            // eslint-disable-next-line no-restricted-syntax
            for (const stmt of stmts) {
                // eslint-disable-next-line no-await-in-loop
                await db.run(stmt);
            }
        }

        const bootstrapMs = performance.now() - bootstrapStart;
        client.logger?.info(
            `DuckDB query bootstrap complete: cacheKey=${client.instanceCacheKey ?? 'none'} bootstrap=${formatMilliseconds(bootstrapMs)}ms httpfs=${formatMilliseconds(httpfsMs)}ms memory_limit=${client.sharedResourceLimits?.memoryLimit ?? 'default'} threads=${client.sharedResourceLimits?.threads ?? 'default'} s3=${client.s3Config ? 'configured' : 'none'} ducklake=${client.ducklakeConfig ? 'configured' : 'none'} shared=${client.instanceCacheKey ? 'true' : 'false'}`,
            {
                shared: !!client.instanceCacheKey,
                instanceCacheKey: client.instanceCacheKey,
                bootstrapMs,
                httpfsMs,
                memoryLimit:
                    client.sharedResourceLimits?.memoryLimit ?? 'default',
                threads: client.sharedResourceLimits?.threads ?? 'default',
                s3Configured: !!client.s3Config,
                ducklakeConfigured: !!client.ducklakeConfig,
            },
        );

        return {
            bootstrapMs,
            httpfsMs,
        };
    }

    private static async bootstrapSharedInstance(
        instance: DuckdbInstance,
        client: DuckdbWarehouseClient,
    ): Promise<DuckdbBootstrapTiming> {
        const db = await instance.connect();
        try {
            return await DuckdbWarehouseClient.bootstrapQuerySession(
                db,
                client,
            );
        } finally {
            db.closeSync?.();
            db.disconnectSync?.();
        }
    }

    private static async getOrCreateSharedInstance(
        client: DuckdbWarehouseClient,
    ): Promise<SharedInstanceAcquisition> {
        const instanceCacheKey = client.getRequiredInstanceCacheKey();

        const existingInstance =
            DuckdbWarehouseClient.sharedInstances.get(instanceCacheKey);
        if (existingInstance) {
            return {
                instance: existingInstance,
                cacheHit: true,
                semaphoreWaitMs: 0,
                instanceCreateMs: 0,
                bootstrapMs: 0,
            };
        }

        const semaphore =
            DuckdbWarehouseClient.getSharedInstanceSemaphore(instanceCacheKey);
        const semaphoreWaitStart = performance.now();
        await semaphore.acquire();
        const semaphoreWaitMs = performance.now() - semaphoreWaitStart;
        try {
            const cachedInstance =
                DuckdbWarehouseClient.sharedInstances.get(instanceCacheKey);
            if (cachedInstance) {
                return {
                    instance: cachedInstance,
                    cacheHit: true,
                    semaphoreWaitMs,
                    instanceCreateMs: 0,
                    bootstrapMs: 0,
                };
            }

            const createStart = performance.now();
            const instance = await DuckDBInstance.create(':memory:');
            const instanceCreateMs = performance.now() - createStart;

            let bootstrapMs = 0;
            try {
                const bootstrapTiming =
                    await DuckdbWarehouseClient.bootstrapSharedInstance(
                        instance,
                        client,
                    );
                bootstrapMs = bootstrapTiming.bootstrapMs;
            } catch (error) {
                instance.closeSync?.();
                throw error;
            }

            DuckdbWarehouseClient.sharedInstances.set(
                instanceCacheKey,
                instance,
            );
            client.logger?.info(
                `DuckDB shared instance initialized: cacheKey=${instanceCacheKey} semaphore_wait=${formatMilliseconds(semaphoreWaitMs)}ms instance_create=${formatMilliseconds(instanceCreateMs)}ms bootstrap=${formatMilliseconds(bootstrapMs)}ms`,
                {
                    instanceCacheKey,
                    semaphoreWaitMs,
                    instanceCreateMs,
                    bootstrapMs,
                },
            );
            return {
                instance,
                cacheHit: false,
                semaphoreWaitMs,
                instanceCreateMs,
                bootstrapMs,
            };
        } finally {
            semaphore.release();
        }
    }

    private static clearSharedInstance(
        instanceCacheKey: string,
        logger?: DuckdbLogger,
    ): void {
        const sharedInstance =
            DuckdbWarehouseClient.sharedInstances.get(instanceCacheKey);
        if (sharedInstance) {
            try {
                sharedInstance.closeSync?.();
            } catch {
                // best-effort cleanup
            }
            DuckdbWarehouseClient.sharedInstances.delete(instanceCacheKey);
            DuckdbWarehouseClient.sharedInstanceSemaphores.delete(
                instanceCacheKey,
            );
            logger?.info(`DuckDB shared instance cleared: ${instanceCacheKey}`);
        }
    }

    /** Reset shared state without closing — for use in tests with mocked instances. */
    static resetSharedDuckdbStateForTesting(): void {
        DuckdbWarehouseClient.sharedInstances.clear();
        DuckdbWarehouseClient.sharedInstanceSemaphores.clear();
    }

    async close(): Promise<void> {
        if (this.instanceCacheKey) {
            DuckdbWarehouseClient.clearSharedInstance(
                this.instanceCacheKey,
                this.logger,
            );
        }
    }

    private static readonly DUCKLAKE_CATALOG_SECRET =
        '__lightdash_ducklake_catalog';

    private static readonly DUCKLAKE_DATA_SECRET = '__lightdash_ducklake_data';

    private static readonly DUCKLAKE_SECRET = '__lightdash_ducklake';

    private static escapeDuckdbString(v: string): string {
        return DuckdbWarehouseClient.sqlBuilder.escapeString(v);
    }

    private static quoteIdent(name: string): string {
        return `"${name.replace(/"/g, '""')}"`;
    }

    private static buildDucklakeCatalogSecretSql(
        ducklake: CreateDuckdbDucklakeCredentials,
    ): string | null {
        const e = DuckdbWarehouseClient.escapeDuckdbString;
        const { catalog } = ducklake;
        switch (catalog.type) {
            case DucklakeCatalogType.POSTGRES:
                return `CREATE OR REPLACE SECRET ${DuckdbWarehouseClient.DUCKLAKE_CATALOG_SECRET} (
                    TYPE postgres,
                    HOST '${e(catalog.host)}',
                    PORT ${catalog.port},
                    DATABASE '${e(catalog.database)}',
                    USER '${e(catalog.user)}',
                    PASSWORD '${e(catalog.password)}'
                );`;
            case DucklakeCatalogType.SQLITE:
            case DucklakeCatalogType.DUCKDB:
                return null;
            default:
                return null;
        }
    }

    private static buildDucklakeDataSecretSql(
        ducklake: CreateDuckdbDucklakeCredentials,
    ): string | null {
        const e = DuckdbWarehouseClient.escapeDuckdbString;
        const { dataPath } = ducklake;
        switch (dataPath.type) {
            case DucklakeDataPathType.S3: {
                const hasStaticCreds = !!(
                    dataPath.accessKeyId && dataPath.secretAccessKey
                );
                const providerClause = hasStaticCreds
                    ? ''
                    : `PROVIDER credential_chain, REFRESH auto, VALIDATION 'none',`;
                const keyIdClause = dataPath.accessKeyId
                    ? `KEY_ID '${e(dataPath.accessKeyId)}',`
                    : '';
                const secretClause = dataPath.secretAccessKey
                    ? `SECRET '${e(dataPath.secretAccessKey)}',`
                    : '';
                const endpointClause = dataPath.endpoint
                    ? `ENDPOINT '${e(dataPath.endpoint)}',`
                    : '';
                const regionClause = dataPath.region
                    ? `REGION '${e(dataPath.region)}',`
                    : '';
                const urlStyleClause =
                    dataPath.forcePathStyle === undefined
                        ? ''
                        : `URL_STYLE '${
                              dataPath.forcePathStyle ? 'path' : 'vhost'
                          }',`;
                const useSslClause =
                    dataPath.useSsl === undefined
                        ? ''
                        : `USE_SSL ${dataPath.useSsl},`;
                return `CREATE OR REPLACE SECRET ${DuckdbWarehouseClient.DUCKLAKE_DATA_SECRET} (
                    TYPE s3,
                    ${providerClause}
                    ${keyIdClause}
                    ${secretClause}
                    ${endpointClause}
                    ${regionClause}
                    ${urlStyleClause}
                    ${useSslClause}
                    SCOPE '${e(dataPath.url)}'
                );`;
            }
            case DucklakeDataPathType.GCS: {
                const hasStaticCreds = !!(
                    dataPath.hmacKeyId && dataPath.hmacSecret
                );
                const providerClause = hasStaticCreds
                    ? ''
                    : `PROVIDER credential_chain,`;
                const keyIdClause = dataPath.hmacKeyId
                    ? `KEY_ID '${e(dataPath.hmacKeyId)}',`
                    : '';
                const secretClause = dataPath.hmacSecret
                    ? `SECRET '${e(dataPath.hmacSecret)}',`
                    : '';
                return `CREATE OR REPLACE SECRET ${DuckdbWarehouseClient.DUCKLAKE_DATA_SECRET} (
                    TYPE gcs,
                    ${providerClause}
                    ${keyIdClause}
                    ${secretClause}
                    SCOPE '${e(dataPath.url)}'
                );`;
            }
            case DucklakeDataPathType.AZURE: {
                if (dataPath.connectionString) {
                    return `CREATE OR REPLACE SECRET ${DuckdbWarehouseClient.DUCKLAKE_DATA_SECRET} (
                        TYPE azure,
                        CONNECTION_STRING '${e(dataPath.connectionString)}',
                        SCOPE '${e(dataPath.url)}'
                    );`;
                }
                if (dataPath.accountName && dataPath.accountKey) {
                    return `CREATE OR REPLACE SECRET ${DuckdbWarehouseClient.DUCKLAKE_DATA_SECRET} (
                        TYPE azure,
                        ACCOUNT_NAME '${e(dataPath.accountName)}',
                        ACCOUNT_KEY '${e(dataPath.accountKey)}',
                        SCOPE '${e(dataPath.url)}'
                    );`;
                }
                if (dataPath.accountName) {
                    return `CREATE OR REPLACE SECRET ${DuckdbWarehouseClient.DUCKLAKE_DATA_SECRET} (
                        TYPE azure,
                        PROVIDER credential_chain,
                        ACCOUNT_NAME '${e(dataPath.accountName)}',
                        SCOPE '${e(dataPath.url)}'
                    );`;
                }
                return null;
            }
            case DucklakeDataPathType.LOCAL:
                return null;
            default:
                return null;
        }
    }

    private static catalogUsesSecret(
        ducklake: CreateDuckdbDucklakeCredentials,
    ): boolean {
        return ducklake.catalog.type === DucklakeCatalogType.POSTGRES;
    }

    private static buildDucklakeSecretSql(
        ducklake: CreateDuckdbDucklakeCredentials,
    ): string | null {
        if (!DuckdbWarehouseClient.catalogUsesSecret(ducklake)) return null;
        const e = DuckdbWarehouseClient.escapeDuckdbString;
        const dataPathUrl =
            ducklake.dataPath.type === DucklakeDataPathType.LOCAL
                ? ducklake.dataPath.path
                : ducklake.dataPath.url;
        return `CREATE OR REPLACE SECRET ${DuckdbWarehouseClient.DUCKLAKE_SECRET} (
            TYPE ducklake,
            METADATA_PATH '',
            DATA_PATH '${e(dataPathUrl)}',
            METADATA_PARAMETERS MAP {'TYPE': 'postgres', 'SECRET': '${
                DuckdbWarehouseClient.DUCKLAKE_CATALOG_SECRET
            }'}
        );`;
    }

    private static buildDucklakeAttachSql(
        ducklake: CreateDuckdbDucklakeCredentials,
    ): string[] {
        const e = DuckdbWarehouseClient.escapeDuckdbString;
        const alias = ducklake.catalogAlias ?? 'ducklake';
        const quotedAlias = DuckdbWarehouseClient.quoteIdent(alias);
        const stmts: string[] = [];

        const catalogSecret =
            DuckdbWarehouseClient.buildDucklakeCatalogSecretSql(ducklake);
        if (catalogSecret) stmts.push(catalogSecret);

        const dataSecret =
            DuckdbWarehouseClient.buildDucklakeDataSecretSql(ducklake);
        if (dataSecret) stmts.push(dataSecret);

        if (DuckdbWarehouseClient.catalogUsesSecret(ducklake)) {
            const ducklakeSecret =
                DuckdbWarehouseClient.buildDucklakeSecretSql(ducklake);
            if (ducklakeSecret) stmts.push(ducklakeSecret);
            stmts.push(
                `ATTACH 'ducklake:${DuckdbWarehouseClient.DUCKLAKE_SECRET}' AS ${quotedAlias} (READ_ONLY);`,
            );
        } else {
            const { catalog } = ducklake;
            const catalogTarget =
                catalog.type === DucklakeCatalogType.SQLITE
                    ? `ducklake:sqlite:${e(catalog.path)}`
                    : `ducklake:${e((catalog as { path: string }).path)}`;
            const dataPathUrl =
                ducklake.dataPath.type === DucklakeDataPathType.LOCAL
                    ? ducklake.dataPath.path
                    : ducklake.dataPath.url;
            stmts.push(
                `ATTACH '${catalogTarget}' AS ${quotedAlias} (DATA_PATH '${e(
                    dataPathUrl,
                )}', READ_ONLY);`,
            );
        }

        return stmts;
    }

    private static buildS3SecretSql(s3Config: DuckdbS3SessionConfig): string {
        const escape = (v: string) =>
            DuckdbWarehouseClient.sqlBuilder.escapeString(v);
        const usesStaticCredentials =
            !DuckdbWarehouseClient.usesS3CredentialChain(s3Config);
        // Static keys may come from dedicated pre-aggregate env vars or fall back
        // to the base S3 config. Without them, let DuckDB resolve AWS credentials
        // through the SDK chain, including IRSA/web identity tokens.
        const providerClause = usesStaticCredentials
            ? ''
            : `PROVIDER credential_chain,
            REFRESH auto,
            -- Defer credential validation to S3 operations so local bootstrap
            -- does not require AWS credentials when using runtime-provided roles.
            VALIDATION 'none',`;
        const regionClause = s3Config.region
            ? `REGION '${escape(s3Config.region)}',`
            : '';
        const keyIdClause = s3Config.accessKey
            ? `KEY_ID '${escape(s3Config.accessKey)}',`
            : '';
        const secretClause = s3Config.secretKey
            ? `SECRET '${escape(s3Config.secretKey)}',`
            : '';

        return `CREATE OR REPLACE SECRET __lightdash_s3 (
            TYPE s3,
            ${providerClause}
            ${keyIdClause}
            ${secretClause}
            ENDPOINT '${escape(s3Config.endpoint)}',
            ${regionClause}
            URL_STYLE '${s3Config.forcePathStyle ? 'path' : 'vhost'}',
            USE_SSL ${s3Config.useSsl}
        );`;
    }

    private static readonly CONNECT_RETRIES_BEFORE_RECREATE = 2;

    private async connectWithRetry(): Promise<SharedConnectionAcquisition> {
        const instanceCacheKey = this.getRequiredInstanceCacheKey();
        let semaphoreWaitMs = 0;
        let instanceCreateMs = 0;
        let bootstrapMs = 0;

        let sharedInstanceAcquisition =
            await DuckdbWarehouseClient.getOrCreateSharedInstance(this);

        semaphoreWaitMs += sharedInstanceAcquisition.semaphoreWaitMs;
        instanceCreateMs += sharedInstanceAcquisition.instanceCreateMs;
        bootstrapMs += sharedInstanceAcquisition.bootstrapMs;

        for (
            let attempt = 1;
            attempt <= DuckdbWarehouseClient.CONNECT_RETRIES_BEFORE_RECREATE;
            attempt += 1
        ) {
            try {
                const connectStart = performance.now();
                const connection =
                    // eslint-disable-next-line no-await-in-loop
                    await sharedInstanceAcquisition.instance.connect();

                const connectMs = performance.now() - connectStart;

                return {
                    connection,
                    cacheHit: sharedInstanceAcquisition.cacheHit,
                    semaphoreWaitMs,
                    instanceCreateMs,
                    bootstrapMs,
                    connectMs,
                    instance: sharedInstanceAcquisition.instance,
                };
            } catch (error) {
                this.logger?.info(
                    `DuckDB shared connection attempt failed: cacheKey=${instanceCacheKey} attempt=${attempt} error=${getErrorMessage(error)}`,
                    {
                        instanceCacheKey,
                        attempt,
                        error: getErrorMessage(error),
                    },
                );
            }
        }

        this.logger?.info(
            'DuckDB connect retries exhausted, recreating shared instance',
            {
                instanceCacheKey,
            },
        );
        DuckdbWarehouseClient.clearSharedInstance(
            instanceCacheKey,
            this.logger,
        );
        sharedInstanceAcquisition =
            await DuckdbWarehouseClient.getOrCreateSharedInstance(this);

        semaphoreWaitMs += sharedInstanceAcquisition.semaphoreWaitMs;
        instanceCreateMs += sharedInstanceAcquisition.instanceCreateMs;
        bootstrapMs += sharedInstanceAcquisition.bootstrapMs;

        const connectStart = performance.now();
        const connection = await sharedInstanceAcquisition.instance.connect();
        const connectMs = performance.now() - connectStart;

        return {
            connection,
            cacheHit: false,
            semaphoreWaitMs,
            instanceCreateMs,
            bootstrapMs,
            connectMs,
            instance: sharedInstanceAcquisition.instance,
        };
    }

    /** Bootstrap for isolated instances — no shared locks needed. */
    private async bootstrapIsolatedSession(
        db: DuckdbConnection,
        tempDir: string,
    ): Promise<void> {
        if (!this.ducklakeConfig) {
            await db.run('INSTALL httpfs;');
            await db.run('LOAD httpfs;');
            await DuckdbWarehouseClient.loadAwsExtensionForCredentialChain(
                db,
                this.s3Config,
            );
        }

        await DuckdbWarehouseClient.hardenInstance(db, {
            allowKnownExtensionAutoload: !!this.ducklakeConfig,
        });

        await db.run(`SET temp_directory = '${tempDir}';`);

        if (this.ducklakeConfig) {
            await db.run('SET pg_connection_limit = 64;');
        }

        if (this.resourceLimits?.memoryLimit) {
            await db.run(
                `SET memory_limit = '${this.resourceLimits.memoryLimit}';`,
            );
        }

        if (this.resourceLimits?.threads) {
            await db.run(`SET threads = ${this.resourceLimits.threads};`);
        }

        if (this.s3Config) {
            await db.run(DuckdbWarehouseClient.buildS3SecretSql(this.s3Config));
        }

        if (this.ducklakeConfig) {
            const stmts = DuckdbWarehouseClient.buildDucklakeAttachSql(
                this.ducklakeConfig,
            );
            // eslint-disable-next-line no-restricted-syntax
            for (const stmt of stmts) {
                // eslint-disable-next-line no-await-in-loop
                await db.run(stmt);
            }
        }

        this.logger?.info(
            `DuckDB isolated bootstrap: memory_limit=${this.resourceLimits?.memoryLimit ?? 'default'} threads=${this.resourceLimits?.threads ?? 'default'} s3=${this.s3Config ? 'configured' : 'none'} ducklake=${this.ducklakeConfig ? 'configured' : 'none'}`,
        );
    }

    /** Ephemeral DuckDB instance with resource limits (e.g. parquet conversion). */
    private async withIsolatedSession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const sessionStart = performance.now();

        const instanceCreateStart = performance.now();
        const instance = await DuckDBInstance.create(':memory:');
        const instanceCreateMs = performance.now() - instanceCreateStart;

        const connectStart = performance.now();
        const connection = await instance.connect();
        const connectMs = performance.now() - connectStart;

        const tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'duckdb-temp-'),
        );

        try {
            const bootstrapStart = performance.now();
            await this.bootstrapIsolatedSession(connection, tempDir);
            const bootstrapMs = performance.now() - bootstrapStart;

            const queryStart = performance.now();
            const result = await callback(connection);
            const queryMs = performance.now() - queryStart;

            const totalMs = performance.now() - sessionStart;
            this.logger?.info(
                `DuckDB isolated session complete: instance_create=${formatMilliseconds(instanceCreateMs)}ms connect=${formatMilliseconds(connectMs)}ms bootstrap=${formatMilliseconds(bootstrapMs)}ms query=${formatMilliseconds(queryMs)}ms total=${formatMilliseconds(totalMs)}ms`,
                {
                    instanceCreateMs,
                    connectMs,
                    bootstrapMs,
                    queryMs,
                    totalMs,
                    tempDir,
                },
            );

            return result;
        } finally {
            connection.closeSync?.();
            connection.disconnectSync?.();
            instance.closeSync?.();
            await fs.rm(tempDir, { recursive: true, force: true }).catch(
                () => {}, // best-effort cleanup
            );
        }
    }

    private async withEphemeralQuerySession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const sessionStart = performance.now();

        const instanceCreateStart = performance.now();
        const instance = await DuckDBInstance.create(':memory:');
        const instanceCreateMs = performance.now() - instanceCreateStart;

        const connectStart = performance.now();
        const connection = await instance.connect();
        const connectMs = performance.now() - connectStart;

        try {
            const bootstrapTiming =
                await DuckdbWarehouseClient.bootstrapQuerySession(
                    connection,
                    this,
                );

            const queryStart = performance.now();
            const result = await callback(connection);
            const queryMs = performance.now() - queryStart;

            const totalMs = performance.now() - sessionStart;
            this.logger?.info(
                `DuckDB ephemeral query session complete: instance_create=${formatMilliseconds(instanceCreateMs)}ms connect=${formatMilliseconds(connectMs)}ms bootstrap=${formatMilliseconds(bootstrapTiming.bootstrapMs)}ms query=${formatMilliseconds(queryMs)}ms total=${formatMilliseconds(totalMs)}ms`,
                {
                    instanceCreateMs,
                    connectMs,
                    bootstrapMs: bootstrapTiming.bootstrapMs,
                    queryMs,
                    totalMs,
                },
            );

            return result;
        } finally {
            connection.closeSync?.();
            connection.disconnectSync?.();
            instance.closeSync?.();
        }
    }

    private async withSharedSession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const sessionStart = performance.now();

        const sharedConnection = await this.connectWithRetry();

        try {
            const queryStart = performance.now();
            const result = await callback(sharedConnection.connection);
            const queryMs = performance.now() - queryStart;

            const totalMs = performance.now() - sessionStart;
            this.logger?.info(
                `DuckDB shared session complete: cacheKey=${this.instanceCacheKey ?? 'none'} cache_hit=${sharedConnection.cacheHit ? 'true' : 'false'} semaphore_wait=${formatMilliseconds(sharedConnection.semaphoreWaitMs)}ms instance_create=${formatMilliseconds(sharedConnection.instanceCreateMs)}ms bootstrap=${formatMilliseconds(sharedConnection.bootstrapMs)}ms connect=${formatMilliseconds(sharedConnection.connectMs)}ms query=${formatMilliseconds(queryMs)}ms total=${formatMilliseconds(totalMs)}ms`,
                {
                    instanceCacheKey: this.instanceCacheKey,
                    cacheHit: sharedConnection.cacheHit,
                    semaphoreWaitMs: sharedConnection.semaphoreWaitMs,
                    instanceCreateMs: sharedConnection.instanceCreateMs,
                    bootstrapMs: sharedConnection.bootstrapMs,
                    connectMs: sharedConnection.connectMs,
                    queryMs,
                    totalMs,
                },
            );

            return result;
        } finally {
            sharedConnection.connection.closeSync?.();
            sharedConnection.connection.disconnectSync?.();
        }
    }

    private hasResourceLimits(): boolean {
        return (
            !!this.resourceLimits && Object.keys(this.resourceLimits).length > 0
        );
    }

    /**
     * Dispatches to the appropriate session strategy:
     * - Direct database (non-:memory: databasePath): connects to the MotherDuck path
     * - Resource-limited: isolated ephemeral instance (e.g. parquet conversion)
     * - Shared instance (has instanceCacheKey): warm cached instance for queries
     * - Default: ephemeral query session
     */
    private async withSession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        if (this.databasePath !== ':memory:') {
            return this.withDirectSession(callback);
        }

        if (this.hasResourceLimits()) {
            return this.withIsolatedSession(callback);
        }

        if (this.instanceCacheKey) {
            return this.withSharedSession(callback);
        }

        return this.withEphemeralQuerySession(callback);
    }

    /** Direct connection to the configured MotherDuck database. */
    private async withDirectSession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const sessionStart = performance.now();

        const instanceCreateStart = performance.now();
        const instance = await DuckDBInstance.create(this.databasePath);
        const instanceCreateMs = performance.now() - instanceCreateStart;

        const connectStart = performance.now();
        const connection = await instance.connect();
        const connectMs = performance.now() - connectStart;

        try {
            await DuckdbWarehouseClient.hardenInstance(connection);
            const queryStart = performance.now();
            const result = await callback(connection);
            const queryMs = performance.now() - queryStart;

            const totalMs = performance.now() - sessionStart;
            const sanitizedPath = this.databasePath.replace(
                /motherduck_token=[^&]*/,
                'motherduck_token=***',
            );
            this.logger?.info(
                `DuckDB direct session complete: path=${sanitizedPath} instance_create=${formatMilliseconds(instanceCreateMs)}ms connect=${formatMilliseconds(connectMs)}ms query=${formatMilliseconds(queryMs)}ms total=${formatMilliseconds(totalMs)}ms`,
                {
                    instanceCreateMs,
                    connectMs,
                    queryMs,
                    totalMs,
                },
            );

            return result;
        } finally {
            connection.closeSync?.();
            connection.disconnectSync?.();
            instance.closeSync?.();
        }
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
                        timingMs: (node.operator_timing ?? 0) * 1000,
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
                .map(
                    (op) =>
                        `${op.name}=${formatMilliseconds(op.timingMs)}ms(${op.rows}rows)`,
                )
                .join(' ');
            const latencyMs = (profile.latency ?? 0) * 1000;
            const cpuMs = (profile.cpu_time ?? 0) * 1000;
            const waitMs = latencyMs - cpuMs;
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
                `DuckDB query profile: latency=${formatMilliseconds(latencyMs)}ms cpu=${formatMilliseconds(cpuMs)}ms wait=${formatMilliseconds(waitMs)}ms rows=${rowsReturned ?? 'unknown'} bytes_read=${bytesRead ?? 'unknown'} operators=[${operatorStr}]`,
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

    private static validateUserSqlFileAccess(sql: string): void {
        const stripped = DuckdbWarehouseClient.stripSqlComments(sql);
        const functionMatch = stripped.match(
            BLOCKED_USER_SQL_FILE_FUNCTION_PATTERN,
        );
        if (functionMatch) {
            throw new Error(
                `SQL validation error: function '${functionMatch[1]}' is not allowed`,
            );
        }

        if (BLOCKED_USER_SQL_FILE_TABLE_PATTERN.test(stripped)) {
            throw new Error(
                'SQL validation error: file table paths are not allowed',
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
        DuckdbWarehouseClient.validateUserSqlFileAccess(sql);
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
            WarehouseBaseClient<CreateDuckdbMotherduckCredentials>['executeAsyncQuery']
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
            bootstrapMs,
            queryMs,
            totalMs: performance.now() - totalStart,
        };
    }

    async runQuery(
        ...args: Parameters<
            WarehouseBaseClient<CreateDuckdbMotherduckCredentials>['runQuery']
        >
    ) {
        return super.runQuery(...args);
    }

    async test(): Promise<void> {
        await super.test();
    }

    async getCatalog(
        config: { database: string; schema: string; table: string }[],
    ): Promise<WarehouseCatalog> {
        return this.withSession(async (db) => {
            const catalog: WarehouseCatalog = {};

            /* eslint-disable no-await-in-loop */
            // eslint-disable-next-line no-restricted-syntax
            for (const ref of config) {
                const result = await db.run(
                    `SELECT column_name, data_type
                     FROM information_schema.columns
                     WHERE table_catalog = '${this.escapeString(ref.database)}'
                       AND table_schema = '${this.escapeString(ref.schema)}'
                       AND table_name = '${this.escapeString(ref.table)}'`,
                );
                const rows = await result.getRowObjects();

                if (rows.length > 0) {
                    if (!catalog[ref.database]) {
                        catalog[ref.database] = {};
                    }
                    if (!catalog[ref.database][ref.schema]) {
                        catalog[ref.database][ref.schema] = {};
                    }
                    catalog[ref.database][ref.schema][ref.table] = rows.reduce<
                        Record<string, DimensionType>
                    >((acc, row) => {
                        const colName = row.column_name as string;
                        const colType = row.data_type as string;
                        acc[colName] = mapFieldTypeFromString(colType);
                        return acc;
                    }, {});
                }
            }
            /* eslint-enable no-await-in-loop */

            return catalog;
        });
    }

    async getAllTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<
        {
            database: string;
            schema: string;
            table: string;
        }[]
    > {
        return this.withSession(async (db) => {
            let sql = `SELECT table_catalog AS database, table_schema AS schema, table_name AS table
                        FROM information_schema.tables
                        WHERE table_type IN ('BASE TABLE', 'VIEW')`;

            if (schema) {
                sql += ` AND table_schema = '${this.escapeString(schema)}'`;
            }

            const result = await db.run(
                tags ? this.getSQLWithMetadata(sql, tags) : sql,
            );
            const rows = await result.getRowObjects();

            return rows.map((row) => ({
                database: row.database as string,
                schema: row.schema as string,
                table: row.table as string,
            }));
        });
    }

    async getFields(
        tableName: string,
        schema?: string,
        database?: string,
        _tags?: Record<string, string>,
    ): Promise<WarehouseCatalog> {
        const refs = [
            {
                database: database ?? this.credentials.database,
                schema: schema ?? this.credentials.schema,
                table: tableName,
            },
        ];
        return this.getCatalog(refs);
    }
}
