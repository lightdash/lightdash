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

type DuckdbConnection = {
    run: (
        sql: string,
        values?: AnyType[] | Record<string, AnyType>,
    ) => Promise<unknown>;
    stream: (
        sql: string,
        values?: AnyType[] | Record<string, AnyType>,
    ) => Promise<DuckdbStreamResult>;
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

export type DuckdbWarehouseClientArgs = {
    databasePath?: string;
    s3Config?: DuckdbS3SessionConfig;
    resourceLimits?: DuckdbResourceLimits;
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

export class DuckdbWarehouseClient extends WarehouseBaseClient<CreatePostgresCredentials> {
    private readonly databasePath: string;

    private readonly s3Config?: DuckdbS3SessionConfig;

    private readonly resourceLimits?: DuckdbResourceLimits;

    private readonly logger?: DuckdbLogger;

    constructor(args: DuckdbWarehouseClientArgs = {}) {
        super(DUCKDB_INTERNAL_CREDENTIALS, new DuckdbSqlBuilder());
        this.databasePath = args.databasePath ?? ':memory:';
        this.s3Config = args.s3Config;
        this.resourceLimits = args.resourceLimits;
        this.logger = args.logger;
    }

    private getSQLWithMetadata(sql: string, tags?: Record<string, string>) {
        if (!tags) {
            return sql;
        }

        return `${sql}\n-- ${JSON.stringify(tags)}`;
    }

    private async withSession<T>(
        callback: (db: DuckdbConnection) => Promise<T>,
    ): Promise<T> {
        const sessionStart = performance.now();

        const instance = (await DuckDBInstance.create(
            this.databasePath,
        )) as DuckdbInstance;
        const connection = await instance.connect();
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
            instance.closeSync?.();
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
        const t0 = performance.now();
        await db.run('INSTALL httpfs;');
        const installMs = performance.now() - t0;

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

        const t2 = performance.now();
        await db.run(
            `SET s3_endpoint = '${this.escapeString(this.s3Config.endpoint)}';`,
        );

        if (this.s3Config.region) {
            await db.run(
                `SET s3_region = '${this.escapeString(this.s3Config.region)}';`,
            );
        }

        if (this.s3Config.accessKey) {
            await db.run(
                `SET s3_access_key_id = '${this.escapeString(
                    this.s3Config.accessKey,
                )}';`,
            );
        }

        if (this.s3Config.secretKey) {
            await db.run(
                `SET s3_secret_access_key = '${this.escapeString(
                    this.s3Config.secretKey,
                )}';`,
            );
        }

        await db.run(`SET s3_use_ssl = ${this.s3Config.useSsl};`);
        await db.run(
            `SET s3_url_style = '${
                this.s3Config.forcePathStyle ? 'path' : 'vhost'
            }';`,
        );
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

    private static async logQueryProfile(
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
                await DuckdbWarehouseClient.logQueryProfile(
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
