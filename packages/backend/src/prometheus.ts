import { AnyType } from '@lightdash/common';
import express from 'express';
import http from 'http';
import { Knex } from 'knex';
import { performance } from 'perf_hooks';
import prometheus from 'prom-client';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';
import { SchedulerClient } from './scheduler/SchedulerClient';

export default class PrometheusMetrics {
    private readonly config: LightdashConfig['prometheus'];

    private server: http.Server | null = null;

    constructor(config: LightdashConfig['prometheus']) {
        this.config = config;
    }

    public start() {
        const { enabled, port, path, ...rest } = this.config;
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
                const app = express();
                this.server = http.createServer(app);
                app.get(path, async (req, res) => {
                    res.set('Content-Type', prometheus.register.contentType);
                    res.end(await prometheus.register.metrics());
                });
                this.server.listen(port, () => {
                    Logger.info(
                        `Prometheus metrics available at localhost:${port}${path}`,
                    );
                });
            } catch (e) {
                Logger.error('Error starting prometheus metrics', e);
            }
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
                    const queueSize = await schedulerClient.getQueueSize();
                    this.set(queueSize);
                },
            });
        }
    }

    public stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
