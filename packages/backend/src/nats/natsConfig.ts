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

// All known stream types
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
     * warehouse slot. Only a worker started with `--stream duckdb` creates
     * it; where the pre-aggregate stream is registered the jobs ride that
     * stream instead, since its worker already runs DuckDB.
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
 * Returns only the streams that have been registered in STREAM_CONFIGS.
 * In OSS, this returns only 'warehouse'. In EE, it includes 'pre-aggregate' too.
 */
export const getRegisteredStreams = (): NatsWorkerStream[] =>
    NATS_WORKER_STREAMS.filter((s) => STREAM_CONFIGS[s] !== undefined);

/**
 * The subject a DuckDB source query is published on. The pre-aggregate
 * worker is the one deployed with DuckDB sized in, so when its stream is
 * registered the jobs go there; the dedicated stream is for a worker
 * started with `--stream duckdb`.
 */
export const getDuckdbQuerySubject = (): string =>
    STREAM_CONFIGS['pre-aggregate']?.subjects.duckdb ??
    STREAM_CONFIGS.duckdb.subjects.query;

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
