import type { RunQueryTags } from '@lightdash/common';
import { z } from 'zod';

export type NatsTraceProperties = {
    traceHeader?: string;
    baggageHeader?: string;
    otelTraceparent?: string;
    otelBaggage?: string;
    sentryMessageId?: string;
};

export type AsyncQueryNatsEnvelope<TPayload> = NatsTraceProperties & {
    jobId: string;
    payload: TPayload;
};

export type AsyncQueryJobPayload = {
    queryUuid: string;
    queryTags?: RunQueryTags;
};

export type AsyncQueryJobMessage = AsyncQueryNatsEnvelope<AsyncQueryJobPayload>;

export type StreamConfig = {
    streamName: string;
    subjects: Record<string, string>;
    durableName: string;
};

// All known stream types. A worker consumes every stream registered at
// startup; there is no way to pin a worker to a subset.
export const natsWorkerStreamSchema = z.enum([
    'warehouse',
    'pre-aggregate',
    'duckdb',
]);
export type NatsWorkerStream = z.infer<typeof natsWorkerStreamSchema>;

// OSS streams — always available
const OSS_STREAM_CONFIGS: Record<'warehouse' | 'duckdb', StreamConfig> = {
    warehouse: {
        streamName: 'WAREHOUSE_QUERY_JOBS',
        subjects: {
            query: 'warehouse.query.jobs',
        },
        durableName: 'worker-warehouse',
    },
    /**
     * DuckDB source queries over other results: merges and compose SQL. Its
     * own stream and durable, so a join waiting on its legs does not hold a
     * warehouse slot and its concurrency is capped on its own.
     */
    duckdb: {
        streamName: 'DUCKDB_QUERY_JOBS',
        subjects: {
            query: 'duckdb.query.jobs',
        },
        durableName: 'worker-duckdb',
    },
};

// Pre-aggregate stream config — registered by EE
const PRE_AGGREGATE_STREAM_CONFIG: StreamConfig = {
    streamName: 'PRE_AGGREGATE_QUERY_JOBS',
    subjects: {
        query: 'pre_aggregate.query.jobs',
        materialization: 'pre_aggregate.materialization.jobs',
        // Legacy: DuckDB jobs used to ride this stream. Kept so a message an
        // older API pod published during a rolling upgrade is still consumed.
        duckdb: 'pre_aggregate.duckdb.jobs',
    },
    durableName: 'worker-pre-aggregate',
};

// Extensible stream configs — EE registers additional streams
export const STREAM_CONFIGS: Record<string, StreamConfig> = {
    ...OSS_STREAM_CONFIGS,
};

export const NATS_WORKER_STREAMS = natsWorkerStreamSchema.options;

/**
 * The streams registered in STREAM_CONFIGS, which is what every worker
 * consumes. OSS registers 'warehouse' and 'duckdb'; a valid enterprise
 * licence adds 'pre-aggregate'.
 */
export const getRegisteredStreams = (): NatsWorkerStream[] =>
    NATS_WORKER_STREAMS.filter((s) => STREAM_CONFIGS[s] !== undefined);

/** The subject a DuckDB source query is published on. */
export const getDuckdbQuerySubject = (): string =>
    STREAM_CONFIGS.duckdb.subjects.query;

/**
 * Values passed to the retired `--stream` flag. Workers consume every
 * registered stream, so the flag is ignored; the entrypoint warns with
 * these so a deployment still passing it gets told.
 */
export const getLegacyStreamArgs = (argv: string[]): string[] =>
    argv.flatMap((arg, i) =>
        arg === '--stream' && argv[i + 1] !== undefined ? [argv[i + 1]] : [],
    );

/**
 * Register an additional NATS stream configuration (used by EE).
 */
export const registerStreamConfig = (
    name: NatsWorkerStream,
    config: StreamConfig,
): void => {
    STREAM_CONFIGS[name] = config;
};

/**
 * Register the pre-aggregate stream. Called from EE initialization.
 */
export const registerPreAggregateStream = (): void => {
    registerStreamConfig('pre-aggregate', PRE_AGGREGATE_STREAM_CONFIG);
};
