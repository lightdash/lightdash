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

export const natsWorkerStreamSchema = z.enum(['warehouse', 'pre-aggregate']);
export type NatsWorkerStream = z.infer<typeof natsWorkerStreamSchema>;

export const NATS_STREAMS = {
    warehouse: {
        streamName: 'WAREHOUSE_QUERY_JOBS',
        subjects: {
            query: 'warehouse.query.jobs',
        },
        durableName: 'worker-warehouse',
    },
    'pre-aggregate': {
        streamName: 'PRE_AGGREGATE_QUERY_JOBS',
        subjects: {
            query: 'pre_aggregate.query.jobs',
            materialization: 'pre_aggregate.materialization.jobs',
        },
        durableName: 'worker-pre-aggregate',
    },
} as const satisfies Record<NatsWorkerStream, StreamConfig>;

type NatsStreamDefs = typeof NATS_STREAMS;
export type NatsSubject = {
    [S in keyof NatsStreamDefs]: NatsStreamDefs[S]['subjects'][keyof NatsStreamDefs[S]['subjects']];
}[keyof NatsStreamDefs];

const KNOWN_SUBJECTS: ReadonlySet<string> = new Set(
    Object.values(NATS_STREAMS).flatMap((config) =>
        Object.values(config.subjects),
    ),
);

export const isKnownNatsSubject = (subject: string): subject is NatsSubject =>
    KNOWN_SUBJECTS.has(subject);

// Extensible stream configs — EE registers additional streams
export const STREAM_CONFIGS: Record<string, StreamConfig> = {
    warehouse: NATS_STREAMS.warehouse,
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
    registerStreamConfig('pre-aggregate', NATS_STREAMS['pre-aggregate']);
};
