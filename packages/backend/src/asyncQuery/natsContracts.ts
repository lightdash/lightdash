import type {
    ItemsMap,
    PivotConfiguration,
    QueueTraceProperties,
    ResultColumns,
    RunQueryTags,
} from '@lightdash/common';

export const ASYNC_QUERY_NATS_HEADERS = {
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

export const getWarehouseQuerySubject = (customerId: string): string =>
    `tenant.${customerId}.warehouse.query.jobs`;

export const getPreAggregateQuerySubject = (customerId: string): string =>
    `tenant.${customerId}.pre_aggregate.query.jobs`;

export const getWarehouseWorkerDurableName = (customerId: string): string =>
    `worker-${customerId}-warehouse`;

export const getPreAggregateWorkerDurableName = (customerId: string): string =>
    `worker-${customerId}-pre-aggregate`;
