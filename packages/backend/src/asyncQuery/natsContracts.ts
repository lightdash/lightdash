import type {
    ItemsMap,
    PivotConfiguration,
    QueueTraceProperties,
    ResultColumns,
    RunQueryTags,
} from '@lightdash/common';

export const NATS_HEADERS = {
    JOB_ID: 'x-lightdash-job-id',
    SENTRY_TRACE: 'sentry-trace',
    BAGGAGE: 'baggage',
    SENTRY_MESSAGE_ID: 'x-lightdash-sentry-message-id',
} as const;

export type AsyncQueryNatsEnvelope<TPayload> = QueueTraceProperties & {
    jobId: string;
    payload: TPayload;
};

type AsyncQueryWarehouseCredentialsOverrides = {
    snowflakeVirtualWarehouse?: string;
    databricksCompute?: string;
};

export type RunAsyncWarehouseQueryJobPayload = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    schedulerUuid?: string;
    queryUuid: string;
    isRegisteredUser: boolean;
    isServiceAccount?: boolean;
    queryTags: RunQueryTags;
    fieldsMap: ItemsMap;
    cacheKey: string;
    warehouseCredentialsOverrides?: AsyncQueryWarehouseCredentialsOverrides;
    pivotConfiguration?: PivotConfiguration;
    originalColumns?: ResultColumns;
    query: string;
};

export type RunAsyncPreAggregateQueryJobPayload = Omit<
    RunAsyncWarehouseQueryJobPayload,
    'query'
> & {
    preAggregateQuery: string;
    warehouseQuery: string;
};

export type AsyncQueryWarehouseJobMessage =
    AsyncQueryNatsEnvelope<RunAsyncWarehouseQueryJobPayload>;

export type AsyncQueryPreAggregateJobMessage =
    AsyncQueryNatsEnvelope<RunAsyncPreAggregateQueryJobPayload>;

export const WAREHOUSE_STREAM_NAME = 'WAREHOUSE_QUERY_JOBS';

export const PRE_AGGREGATE_STREAM_NAME = 'PRE_AGGREGATE_QUERY_JOBS';

export const WAREHOUSE_QUERY_SUBJECT = 'warehouse.query.jobs';

export const PRE_AGGREGATE_QUERY_SUBJECT = 'pre_aggregate.query.jobs';

export const WAREHOUSE_WORKER_DURABLE_NAME = 'worker-warehouse';

export const PRE_AGGREGATE_WORKER_DURABLE_NAME = 'worker-pre-aggregate';
