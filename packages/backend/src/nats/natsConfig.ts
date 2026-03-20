import { z } from 'zod';

export type NatsTraceProperties = {
    traceHeader?: string;
    baggageHeader?: string;
    sentryMessageId?: string;
};

export type AsyncQueryNatsEnvelope<TPayload> = NatsTraceProperties & {
    jobId: string;
    payload: TPayload;
};

/**
 * Lightweight NATS payload — the worker looks up everything else from query_history.
 */
export type AsyncQueryJobPayload = {
    queryUuid: string;
};

export type AsyncQueryJobMessage = AsyncQueryNatsEnvelope<AsyncQueryJobPayload>;

export type StreamConfig = {
    streamName: string;
    subjects: Record<string, string>;
    durableName: string;
};

// All known stream types
export const natsWorkerStreamSchema = z.enum(['warehouse', 'pre-aggregate']);
export type NatsWorkerStream = z.infer<typeof natsWorkerStreamSchema>;

// OSS streams — always available
const OSS_STREAM_CONFIGS: Record<'warehouse', StreamConfig> = {
    warehouse: {
        streamName: 'WAREHOUSE_QUERY_JOBS',
        subjects: {
            query: 'warehouse.query.jobs',
        },
        durableName: 'worker-warehouse',
    },
};

// Pre-aggregate stream config — registered by EE
const PRE_AGGREGATE_STREAM_CONFIG: StreamConfig = {
    streamName: 'PRE_AGGREGATE_QUERY_JOBS',
    subjects: {
        query: 'pre_aggregate.query.jobs',
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
