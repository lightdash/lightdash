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
export const NATS_WORKER_STREAMS = natsWorkerStreamSchema.options;
export type NatsWorkerStream = z.infer<typeof natsWorkerStreamSchema>;

export const STREAM_CONFIGS = {
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
        },
        durableName: 'worker-pre-aggregate',
    },
} as const satisfies Record<NatsWorkerStream, StreamConfig>;
