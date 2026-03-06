import type { QueueTraceProperties } from '@lightdash/common';

export const NATS_HEADERS = {
    JOB_ID: 'x-lightdash-job-id',
    BAGGAGE: 'baggage',
    SENTRY_TRACE: 'sentry-trace',
    SENTRY_MESSAGE_ID: 'x-lightdash-sentry-message-id',
} as const;

export type AsyncQueryNatsEnvelope<TPayload> = QueueTraceProperties & {
    jobId: string;
    payload: TPayload;
};

/**
 * Account type discriminator passed through NATS so the worker can derive
 * `isRegisteredUser` and `isServiceAccount` without storing them in the DB.
 */
export type AsyncQueryAccountType =
    | 'session'
    | 'jwt'
    | 'api-key'
    | 'service-account'
    | 'oauth';

/**
 * Lightweight NATS payload — the worker looks up everything else from query_history.
 */
export type AsyncQueryJobPayload = {
    queryUuid: string;
    accountType: AsyncQueryAccountType;
    userUuid: string;
};

export type AsyncQueryJobMessage = AsyncQueryNatsEnvelope<AsyncQueryJobPayload>;

export const WAREHOUSE_STREAM_NAME = 'WAREHOUSE_QUERY_JOBS';

export const PRE_AGGREGATE_STREAM_NAME = 'PRE_AGGREGATE_QUERY_JOBS';

export const WAREHOUSE_QUERY_SUBJECT = 'warehouse.query.jobs';

export const PRE_AGGREGATE_QUERY_SUBJECT = 'pre_aggregate.query.jobs';

export const WAREHOUSE_WORKER_DURABLE_NAME = 'worker-warehouse';

export const PRE_AGGREGATE_WORKER_DURABLE_NAME = 'worker-pre-aggregate';
