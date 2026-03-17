import {
    AnyType,
    PreAggregateMissReason,
    QueryHistoryStatus,
} from '@lightdash/common';
import { EventEmitter } from 'events';
import express from 'express';
import * as fs from 'fs';
import http from 'http';
import { Knex } from 'knex';
import path from 'path';
import { performance } from 'perf_hooks';
import prometheus from 'prom-client';
import { z } from 'zod';
import { LightdashConfig } from '../config/parseConfig';
import { PreAggregateMaterializationsTableName } from '../database/entities/preAggregates';
import Logger from '../logging/logger';
import { SchedulerClient } from '../scheduler/SchedulerClient';
import {
    PrometheusEventMetricManager,
    PrometheusEventMetricManagerConfig,
} from './PrometheusEventMetricManager';

const prometheusEventMetricsConfigSchema = z.object({
    metrics: z.array(
        z
            .object({
                eventName: z.string().min(1),
                metricName: z.string().min(1),
                help: z.string().min(1),
                labelNames: z.array(
                    z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
                ),
            })
            .strict(),
    ),
});

export default class PrometheusMetrics {
    private readonly config: LightdashConfig['prometheus'];

    private server: http.Server | null = null;

    private eventMetricManager: PrometheusEventMetricManager | null = null;

    // Add query status metrics
    public queryStatusCounter: prometheus.Counter<string> | null = null;

    // AI Agent response time metrics
    public aiAgentGenerateResponseDurationHistogram: prometheus.Histogram | null =
        null;

    public aiAgentStreamResponseDurationHistogram: prometheus.Histogram | null =
        null;

    public aiAgentStreamFirstChunkHistogram: prometheus.Histogram | null = null;

    public aiAgentTTFTHistogram: prometheus.Histogram | null = null;

    // Pre-aggregate metrics
    public preAggregateMatchCounter: prometheus.Counter<string> | null = null;

    public preAggregateMaterializationCounter: prometheus.Counter<string> | null =
        null;

    public preAggregateMaterializationDurationHistogram: prometheus.Histogram<string> | null =
        null;

    public preAggregateActiveMaterializationsGauge: prometheus.Gauge | null =
        null;

    // Pre-aggregate query execution metrics
    public queryExecutionDurationHistogram: prometheus.Histogram<string> | null =
        null;

    public duckdbResolutionCounter: prometheus.Counter<string> | null = null;

    public duckdbResolutionDurationHistogram: prometheus.Histogram<string> | null =
        null;

    public preAggregateFallbackCounter: prometheus.Counter<string> | null =
        null;

    public s3ResultsUploadDurationHistogram: prometheus.Histogram<string> | null =
        null;

    public queryCacheHitCounter: prometheus.Counter<string> | null = null;

    public preAggregateMaterializationFileSizeGauge: prometheus.Gauge<string> | null =
        null;

    public preAggregateParquetConversionDurationHistogram: prometheus.Histogram<string> | null =
        null;

    // Query history pipeline metrics
    private queryStateTransitionCounter: prometheus.Counter<
        'from' | 'to'
    > | null = null;

    private queueWaitHistogram: prometheus.Histogram | null = null;

    private totalDurationHistogram: prometheus.Histogram | null = null;

    private warehouseDurationHistogram: prometheus.Histogram | null = null;

    public gzipDecompressionBytesHistogram: prometheus.Histogram<string> | null =
        null;

    constructor(config: LightdashConfig['prometheus']) {
        this.config = config;
    }

    public start() {
        const { enabled, port, path: metricsPath, ...rest } = this.config;
        if (enabled) {
            try {
                prometheus.collectDefaultMetrics({
                    ...rest,
                });
                const eventLoopUtilization = new prometheus.Gauge({
                    name: 'nodejs_eventloop_utilization',
                    help: 'The utilization value(%) is the calculated Event Loop Utilization (ELU).',
                    ...rest,
                    collect() {
                        // Invoked when the registry collects its metrics' values.
                        this.set(
                            performance.eventLoopUtilization().utilization,
                        );
                    },
                });

                // Initialize query status metrics
                this.queryStatusCounter = new prometheus.Counter({
                    name: 'lightdash_query_status_total',
                    help: 'Total number of queries by terminal status',
                    labelNames: ['status'],
                    ...rest,
                });

                // Query history pipeline metrics
                this.queryStateTransitionCounter = new prometheus.Counter({
                    name: 'lightdash_query_state_transitions_total',
                    help: 'Query state transitions (monotonic, safe across processes)',
                    labelNames: ['from', 'to'],
                    ...rest,
                });

                this.queueWaitHistogram = new prometheus.Histogram({
                    name: 'lightdash_query_queue_wait_duration_seconds',
                    help: 'Time spent waiting in queue before execution',
                    buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
                    ...rest,
                });

                this.totalDurationHistogram = new prometheus.Histogram({
                    name: 'lightdash_query_total_duration_seconds',
                    help: 'Total query duration from creation to results ready',
                    buckets: [0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600],
                    ...rest,
                });

                this.warehouseDurationHistogram = new prometheus.Histogram({
                    name: 'lightdash_query_warehouse_duration_seconds',
                    help: 'Warehouse query execution duration',
                    labelNames: ['warehouse_type'],
                    buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
                    ...rest,
                });

                // Initialize AI Agent response time histograms
                this.aiAgentGenerateResponseDurationHistogram =
                    new prometheus.Histogram({
                        name: 'ai_agent_generate_response_duration_ms',
                        help: 'Histogram of AI Agent generate response time in milliseconds',
                        buckets: [
                            100, // 100ms
                            250, // 250ms
                            500, // 500ms
                            1000, // 1 second
                            2500, // 2.5 seconds
                            5000, // 5 seconds
                            10000, // 10 seconds
                            25000, // 25 seconds
                            50000, // 50 seconds
                            60000, // 1 minute
                            120000, // 2 minutes
                            180000, // 3 minutes
                            240000, // 4 minutes
                            300000, // 5 minutes
                            600000, // 10 minutes
                            900000, // 15 minutes
                            1200000, // 20 minutes
                            1500000, // 25 minutes
                            1800000, // 30 minutes
                        ],
                        ...rest,
                    });

                this.aiAgentStreamResponseDurationHistogram =
                    new prometheus.Histogram({
                        name: 'ai_agent_stream_response_duration_ms',
                        help: 'Histogram of AI Agent stream response time in milliseconds',
                        buckets: [
                            100, // 100ms
                            250, // 250ms
                            500, // 500ms
                            1000, // 1 second
                            2500, // 2.5 seconds
                            5000, // 5 seconds
                            10000, // 10 seconds
                            25000, // 25 seconds
                            50000, // 50 seconds
                            60000, // 1 minute
                            120000, // 2 minutes
                            180000, // 3 minutes
                            240000, // 4 minutes
                            300000, // 5 minutes
                            600000, // 10 minutes
                            900000, // 15 minutes
                            1200000, // 20 minutes
                            1500000, // 25 minutes
                            1800000, // 30 minutes
                        ],
                        ...rest,
                    });

                this.aiAgentStreamFirstChunkHistogram =
                    new prometheus.Histogram({
                        name: 'ai_agent_stream_first_chunk_ms',
                        help: 'Histogram of AI Agent time to first chunk (any type)',
                        buckets: [
                            50, // 50ms
                            100, // 100ms
                            250, // 250ms
                            500, // 500ms
                            1000, // 1 second
                            2500, // 2.5 seconds
                            5000, // 5 seconds
                            10000, // 10 seconds
                            15000, // 15 seconds
                            20000, // 20 seconds
                            30000, // 30 seconds
                            45000, // 45 seconds
                            60000, // 1 minute
                            90000, // 1.5 minutes
                            120000, // 2 minutes
                        ],
                        ...rest,
                    });

                this.aiAgentTTFTHistogram = new prometheus.Histogram({
                    name: 'ai_agent_ttft_ms',
                    help: 'Histogram of AI Agent TTFT (time to first token)',
                    labelNames: ['model', 'mode'],
                    buckets: [
                        50, // 50ms
                        100, // 100ms
                        250, // 250ms
                        500, // 500ms
                        1000, // 1 second
                        2500, // 2.5 seconds
                        5000, // 5 seconds
                        10000, // 10 seconds
                        15000, // 15 seconds
                        20000, // 20 seconds
                        30000, // 30 seconds
                        45000, // 45 seconds
                        60000, // 1 minute
                        90000, // 1.5 minutes
                        120000, // 2 minutes
                    ],
                    ...rest,
                });

                // Initialize pre-aggregate metrics
                this.preAggregateMatchCounter = new prometheus.Counter({
                    name: 'lightdash_pre_aggregate_match_total',
                    help: 'Total number of pre-aggregate match attempts',
                    labelNames: ['result', 'miss_reason', 'format'],
                    ...rest,
                });

                this.preAggregateMaterializationCounter =
                    new prometheus.Counter({
                        name: 'lightdash_pre_aggregate_materialization_total',
                        help: 'Total number of pre-aggregate materializations by outcome',
                        labelNames: ['status', 'trigger'],
                        ...rest,
                    });

                this.preAggregateMaterializationDurationHistogram =
                    new prometheus.Histogram({
                        name: 'lightdash_pre_aggregate_materialization_duration_seconds',
                        help: 'Pre-aggregate materialization duration',
                        labelNames: ['status', 'trigger'],
                        buckets: [1, 5, 10, 30, 60, 120, 300, 600, 900, 1800],
                        ...rest,
                    });

                // Pre-aggregate query execution metrics
                this.queryExecutionDurationHistogram = new prometheus.Histogram(
                    {
                        name: 'lightdash_query_execution_duration_seconds',
                        help: 'Query execution duration by source',
                        labelNames: ['source', 'context', 'status'],
                        buckets: [
                            0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600,
                        ],
                        ...rest,
                    },
                );

                this.duckdbResolutionCounter = new prometheus.Counter({
                    name: 'lightdash_pre_aggregate_duckdb_resolution_total',
                    help: 'Total number of DuckDB pre-aggregate resolution attempts',
                    labelNames: ['status', 'reason'],
                    ...rest,
                });

                this.duckdbResolutionDurationHistogram =
                    new prometheus.Histogram({
                        name: 'lightdash_pre_aggregate_duckdb_resolution_duration_seconds',
                        help: 'DuckDB pre-aggregate resolution duration',
                        labelNames: ['status'],
                        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
                        ...rest,
                    });

                this.preAggregateFallbackCounter = new prometheus.Counter({
                    name: 'lightdash_pre_aggregate_fallback_total',
                    help: 'Total number of opportunistic pre-aggregate fallbacks to warehouse',
                    labelNames: ['reason'],
                    ...rest,
                });

                this.s3ResultsUploadDurationHistogram =
                    new prometheus.Histogram({
                        name: 'lightdash_s3_results_upload_duration_seconds',
                        help: 'S3 results upload duration',
                        labelNames: ['source'],
                        buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
                        ...rest,
                    });

                this.preAggregateMaterializationFileSizeGauge =
                    new prometheus.Gauge({
                        name: 'lightdash_pre_aggregate_materialization_file_size_bytes',
                        help: 'File size of pre-aggregate materialization in bytes',
                        labelNames: ['format'],
                        ...rest,
                    });

                this.preAggregateParquetConversionDurationHistogram =
                    new prometheus.Histogram({
                        name: 'lightdash_pre_aggregate_parquet_conversion_duration_seconds',
                        help: 'Duration of JSONL to Parquet conversion',
                        labelNames: ['status'],
                        buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
                        ...rest,
                    });

                this.gzipDecompressionBytesHistogram = new prometheus.Histogram(
                    {
                        name: 'gzip_decompression_bytes',
                        help: 'Approximate decompressed request body size in bytes (re-serialized from parsed JSON)',
                        buckets: [
                            1024, // 1KB
                            10240, // 10KB
                            102400, // 100KB
                            524288, // 512KB
                            1048576, // 1MB
                            5242880, // 5MB
                            10485760, // 10MB
                            52428800, // 50MB
                        ],
                        ...rest,
                    },
                );

                this.queryCacheHitCounter = new prometheus.Counter({
                    name: 'lightdash_query_cache_hit_total',
                    help: 'Total number of query cache hits and misses',
                    labelNames: [
                        'result',
                        'context',
                        'has_pre_aggregate_match',
                    ],
                    ...rest,
                });

                const app = express();
                this.server = http.createServer(app);
                app.get(metricsPath, async (req, res) => {
                    res.set('Content-Type', prometheus.register.contentType);
                    res.end(await prometheus.register.metrics());
                });
                this.server.listen(port, () => {
                    Logger.info(
                        `Prometheus metrics available at localhost:${port}${metricsPath}`,
                    );
                });
            } catch (e) {
                Logger.error('Error starting prometheus metrics', e);
            }
        }
    }

    public incrementQueryStatus(status: QueryHistoryStatus) {
        if (this.queryStatusCounter) {
            this.queryStatusCounter.inc({ status });
        }
    }

    public monitorDatabase(knex: Knex) {
        const { enabled, ...rest } = this.config;
        if (!enabled) {
            return;
        }

        // Initialize database metrics
        const pgPoolMaxSize = new prometheus.Gauge({
            name: 'pg_pool_max_size',
            help: 'Max size of the PG pool',
            ...rest,
        });

        const pgPoolSize = new prometheus.Gauge({
            name: 'pg_pool_size',
            help: 'Current size of the PG pool',
            ...rest,
        });

        const pgActiveConnections = new prometheus.Gauge({
            name: 'pg_active_connections',
            help: 'Number of active connections in the PG pool',
            ...rest,
        });

        const pgIdleConnections = new prometheus.Gauge({
            name: 'pg_idle_connections',
            help: 'Number of idle connections in the PG pool',
            ...rest,
        });

        const pgQueuedQueries = new prometheus.Gauge({
            name: 'pg_queued_queries',
            help: 'Number of queries waiting in the PG pool queue',
            ...rest,
        });

        const pgConnectionAcquireTime = new prometheus.Histogram({
            name: 'pg_connection_acquire_time',
            help: 'Time to acquire a connection from the PG pool (ms)',
            buckets: [
                1,
                5,
                10,
                25,
                50,
                100,
                250,
                500,
                1000, // 1 second
                2500, // 2.5 second
                5000, // 5 second
                10000, // 10 second
                25000, // 25 second
                50000, // 50 second
                60000, // 1 min
                120000, // 2 min
                180000, // 3 min
                240000, // 4 min
                300000, // 5 min
                600000, // 10 min
                900000, // 15 min
                1200000, // 20 min
                1500000, // 25 min
                1800000, // 30 min
            ],
            ...rest,
        });

        const pgQueryDurationHistogram = new prometheus.Histogram({
            name: 'pg_query_duration',
            help: 'Histogram of PG query execution time (ms)',
            buckets: [
                1,
                5,
                10,
                25,
                50,
                100,
                250,
                500,
                1000, // 1 second
                2500, // 2.5 second
                5000, // 5 second
                10000, // 10 second
                25000, // 25 second
                50000, // 50 second
                60000, // 1 min
                120000, // 2 min
                180000, // 3 min
                240000, // 4 min
                300000, // 5 min
                600000, // 10 min
                900000, // 15 min
                1200000, // 20 min
                1500000, // 25 min
                1800000, // 30 min
            ],
            ...rest,
        });

        // Update metrics on pool events
        function updatePoolMetrics(pool: AnyType): void {
            try {
                if (pool) {
                    pgPoolMaxSize.set(pool.max);
                    pgPoolSize.set(pool.numUsed() + pool.numFree());
                    pgIdleConnections.set(pool.numFree());
                    pgActiveConnections.set(pool.numUsed());
                    pgQueuedQueries.set(pool.numPendingAcquires());
                }
            } catch (e) {
                console.warn(`Error updating PG prometheus metrics`, e);
            }
        }

        // Create a Map to store query start times
        const queryTimings = new Map<string, number>();

        knex.on('query', (query) => {
            // Store starting time to query so we can calculate duration in 'query-response' event
            if (query.__knexQueryUid) {
                queryTimings.set(query.__knexQueryUid, Date.now());
            }
        });

        // Calculate query duration and cleanup
        knex.on(
            'query-response',
            (_response, query, queryBuilder: Knex.QueryBuilder) => {
                try {
                    if (query.__knexQueryUid) {
                        const startTime = queryTimings.get(
                            query.__knexQueryUid,
                        );
                        if (startTime) {
                            pgQueryDurationHistogram.observe(
                                Date.now() - startTime,
                            );
                            // Clean up the timing entry
                            queryTimings.delete(query.__knexQueryUid);
                        }
                    }

                    updatePoolMetrics(queryBuilder.client.pool);
                } catch (e) {
                    console.warn(
                        `Error on PG event listener 'query-response'`,
                        e,
                    );
                }
            },
        );

        // Clean up on query-error
        knex.on('query-error', (_error, query) => {
            if (query.__knexQueryUid) {
                queryTimings.delete(query.__knexQueryUid);
            }
        });

        // Create a Map to store acquire start times
        const poolWaitTimes = new Map<number, number>();
        const pool = knex.client.pool as AnyType;
        if (pool) {
            pool.on('connect', () => {
                updatePoolMetrics(pool);
            });
            pool.on('release', () => {
                updatePoolMetrics(pool);
            });
            pool.on('acquireRequest', (eventId: number) => {
                poolWaitTimes.set(eventId, Date.now());
                updatePoolMetrics(pool);
            });
            pool.on('acquireSuccess', (eventId: number) => {
                const startTime = poolWaitTimes.get(eventId);
                if (startTime) {
                    pgConnectionAcquireTime.observe(Date.now() - startTime);
                    poolWaitTimes.delete(eventId); // Clean up
                }
                updatePoolMetrics(pool);
            });
            pool.on('acquireFail', (eventId: number) => {
                poolWaitTimes.delete(eventId);
            });
        }
    }

    public monitorQueues(schedulerClient: SchedulerClient) {
        const { enabled, ...rest } = this.config;
        if (enabled) {
            const queueSizeGauge = new prometheus.Gauge({
                name: 'queue_size',
                help: 'Number of jobs in the queue',
                ...rest,
                async collect() {
                    try {
                        const queueSize = await schedulerClient.getQueueSize();
                        this.set(queueSize);
                    } catch (error) {
                        Logger.error(
                            'Failed to collect queue size metric, setting to 0',
                            {
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : error,
                            },
                        );
                        this.set(0);
                    }
                },
            });
        }
    }

    public incrementPreAggregateMatch(
        hit: boolean,
        missReason?: PreAggregateMissReason,
        format?: 'jsonl' | 'parquet',
    ) {
        if (this.preAggregateMatchCounter) {
            this.preAggregateMatchCounter.inc({
                result: hit ? 'hit' : 'miss',
                miss_reason: hit ? 'none' : missReason || 'unknown',
                format: format || 'unknown',
            });
        }
    }

    public observeQueryExecutionDuration(
        durationMs: number,
        source: 'warehouse' | 'pre_aggregate_duckdb',
        context: string,
        status: 'success' | 'error',
    ) {
        this.queryExecutionDurationHistogram?.observe(
            { source, context, status },
            durationMs / 1000,
        );
    }

    public trackDuckdbResolution(
        resolved: boolean,
        reason: string | undefined,
        durationMs: number,
    ) {
        const status = resolved ? 'success' : 'failed';
        this.duckdbResolutionCounter?.inc({
            status,
            reason: resolved ? 'none' : reason || 'unknown',
        });
        this.duckdbResolutionDurationHistogram?.observe(
            { status },
            durationMs / 1000,
        );
    }

    public incrementPreAggregateFallback(reason: string) {
        this.preAggregateFallbackCounter?.inc({ reason });
    }

    public observeS3ResultsUploadDuration(
        durationMs: number,
        source: 'warehouse' | 'pre_aggregate_duckdb',
    ) {
        this.s3ResultsUploadDurationHistogram?.observe(
            { source },
            durationMs / 1000,
        );
    }

    public incrementQueryCacheHit(
        cacheHit: boolean,
        context: string,
        hasPreAggregateMatch: boolean,
    ) {
        this.queryCacheHitCounter?.inc({
            result: cacheHit ? 'hit' : 'miss',
            context,
            has_pre_aggregate_match: hasPreAggregateMatch ? 'true' : 'false',
        });
    }

    public monitorPreAggregates(knex: Knex) {
        const { enabled, ...rest } = this.config;
        if (!enabled) {
            return;
        }

        this.preAggregateActiveMaterializationsGauge = new prometheus.Gauge({
            name: 'lightdash_pre_aggregate_active_materializations',
            help: 'Current number of active pre-aggregate materializations',
            ...rest,
            async collect() {
                try {
                    const result = await knex(
                        PreAggregateMaterializationsTableName,
                    )
                        .where('status', 'active')
                        .count({ count: '*' })
                        .first<{ count: string | number }>();
                    this.set(Number(result?.count ?? 0));
                } catch (error) {
                    Logger.error(
                        'Failed to collect active pre-aggregate materializations metric, setting to 0',
                        {
                            error:
                                error instanceof Error ? error.message : error,
                        },
                    );
                    this.set(0);
                }
            },
        });
    }

    public trackQueryStateTransition(
        from:
            | 'new'
            | QueryHistoryStatus.PENDING
            | QueryHistoryStatus.QUEUED
            | QueryHistoryStatus.EXECUTING,
        to:
            | QueryHistoryStatus.PENDING
            | QueryHistoryStatus.QUEUED
            | QueryHistoryStatus.EXECUTING
            | QueryHistoryStatus.READY
            | QueryHistoryStatus.ERROR
            | QueryHistoryStatus.EXPIRED
            | QueryHistoryStatus.CANCELLED,
    ) {
        this.queryStateTransitionCounter?.inc({ from, to });
    }

    public observeQueueWaitDuration(durationMs: number) {
        this.queueWaitHistogram?.observe(durationMs / 1000);
    }

    public observeQueryTotalDuration(durationMs: number) {
        this.totalDurationHistogram?.observe(durationMs / 1000);
    }

    public observeWarehouseDuration(durationMs: number, warehouseType: string) {
        this.warehouseDurationHistogram?.observe(
            { warehouse_type: warehouseType },
            durationMs / 1000,
        );
    }

    public monitorEventMetrics(eventEmitter: EventEmitter) {
        if (!this.config.enabled || !this.config.eventMetricsEnabled) {
            return;
        }

        const configPath = this.config.eventMetricsConfigPath;

        if (!configPath) {
            Logger.debug(
                'PrometheusEventMetricManager config path not set, skipping initialization',
            );
            return;
        }

        try {
            // Validate the config path to prevent path traversal attacks
            // Resolve to absolute path first, then validate against base directory
            const resolvedPath = path.resolve(process.cwd(), configPath);
            const basePath = path.resolve(process.cwd());

            // Ensure the resolved path doesn't escape the working directory
            if (
                !resolvedPath.startsWith(basePath + path.sep) &&
                resolvedPath !== basePath
            ) {
                throw new Error(
                    'Invalid configuration path: path traversal detected',
                );
            }

            if (!fs.existsSync(resolvedPath)) {
                Logger.warn(
                    `PrometheusEventMetricManager config file not found: ${resolvedPath}`,
                );
                return;
            }

            const configContent = fs.readFileSync(resolvedPath, 'utf-8');
            let jsonConfig: unknown;
            try {
                jsonConfig = JSON.parse(configContent);
            } catch (parseError) {
                Logger.error(
                    `Failed to parse PrometheusEventMetricManager config JSON from ${resolvedPath}`,
                    parseError,
                );
                return;
            }

            const parsedConfig =
                prometheusEventMetricsConfigSchema.safeParse(jsonConfig);
            if (!parsedConfig.success) {
                Logger.error(
                    `Invalid PrometheusEventMetricManager config from ${resolvedPath}`,
                    {
                        errors: parsedConfig.error.errors.map((issue) => ({
                            message: issue.message,
                            path: issue.path.join('.'),
                        })),
                    },
                );
                return;
            }

            // Merge with prometheus config from lightdashConfig
            const config: PrometheusEventMetricManagerConfig = {
                metrics: parsedConfig.data.metrics,
                prometheusConfig: this.config,
            };

            this.eventMetricManager = new PrometheusEventMetricManager(
                config,
                eventEmitter,
            );

            Logger.info('Initializing PrometheusEventMetricManager');
            this.eventMetricManager.initialize();

            Logger.info(
                `PrometheusEventMetricManager loaded from ${resolvedPath} with ${config.metrics.length} metrics`,
            );
        } catch (error) {
            Logger.error(
                `Error loading PrometheusEventMetricManager config from ${configPath}`,
                error,
            );
        }
    }

    public stop() {
        if (this.server) {
            this.server.close();
        }
        this.eventMetricManager?.cleanup();
    }
}
