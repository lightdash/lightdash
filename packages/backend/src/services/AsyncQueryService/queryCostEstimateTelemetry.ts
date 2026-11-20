import {
    LightdashError,
    QueryExecutionContext,
    type WarehouseTypes,
} from '@lightdash/common';
import type {
    QueryCostEstimateAgentRefusedEvent,
    QueryCostEstimateCompletedEvent,
} from '../../analytics/LightdashAnalytics';
import type {
    QueryCostEstimateCacheResult,
    QueryCostEstimateOutcome,
    QueryCostEstimateSource,
} from './queryCostEstimateTypes';

export type QueryCostEstimateTelemetryContext = {
    source: QueryCostEstimateSource;
    projectUuid: string;
    organizationUuid: string;
};

export type QueryCostEstimateRecord = QueryCostEstimateTelemetryContext & {
    outcome: QueryCostEstimateOutcome;
    cache: QueryCostEstimateCacheResult;
    warehouseType: WarehouseTypes;
    dryRunDurationMs: number | null;
    estimatedBytes: number | null;
    thresholdBytes: number | null;
    requiresConfirmation: boolean | null;
    error: unknown;
};

export type InteractiveQueryCostEstimateRecord = QueryCostEstimateRecord & {
    source: Exclude<QueryCostEstimateSource, 'agent_limit'>;
    outcome: Exclude<QueryCostEstimateOutcome, 'exceeded'>;
};

export const getInteractiveQueryCostEstimateSource = (
    context: QueryExecutionContext,
): InteractiveQueryCostEstimateRecord['source'] =>
    context === QueryExecutionContext.SQL_RUNNER ? 'sql_runner' : 'explorer';

export const unavailableInteractiveEstimateRecord = (
    base: Pick<
        InteractiveQueryCostEstimateRecord,
        | 'source'
        | 'projectUuid'
        | 'organizationUuid'
        | 'warehouseType'
        | 'thresholdBytes'
    >,
): InteractiveQueryCostEstimateRecord => ({
    ...base,
    outcome: 'unavailable',
    cache: 'none',
    dryRunDurationMs: null,
    estimatedBytes: null,
    requiresConfirmation: null,
    error: null,
});

export const getQueryCostEstimateLogMeta = (
    record: QueryCostEstimateRecord,
) => ({
    source: record.source,
    outcome: record.outcome,
    cache: record.cache,
    dryRunDurationMs: record.dryRunDurationMs,
    estimatedBytes: record.estimatedBytes,
    ...(record.source === 'agent_limit'
        ? { limitBytes: record.thresholdBytes }
        : {
              confirmEstimatedBytesAbove: record.thresholdBytes,
              requiresConfirmation: record.requiresConfirmation,
          }),
    projectUuid: record.projectUuid,
    organizationUuid: record.organizationUuid,
    warehouseType: record.warehouseType,
    ...(record.outcome === 'error'
        ? {
              errorName:
                  record.error instanceof Error
                      ? record.error.name
                      : typeof record.error,
              errorStatusCode:
                  record.error instanceof LightdashError
                      ? record.error.statusCode
                      : null,
          }
        : {}),
});

export const buildQueryCostEstimateAgentRefusedEvent = ({
    organizationUuid,
    projectUuid,
    queryContext,
    queryUuid,
    estimatedBytes,
    limitBytes,
    cacheHit,
    warehouseType,
}: {
    organizationUuid: string;
    projectUuid: string;
    queryContext: QueryExecutionContext | null;
    queryUuid: string;
    estimatedBytes: number;
    limitBytes: number;
    cacheHit: boolean;
    warehouseType: WarehouseTypes;
}): QueryCostEstimateAgentRefusedEvent => ({
    event: 'query_cost_estimate.agent_refused',
    properties: {
        organizationId: organizationUuid,
        projectId: projectUuid,
        queryContext,
        queryUuid,
        estimatedBytes,
        limitBytes,
        cacheHit,
        warehouseType,
    },
});

export const buildQueryCostEstimateCompletedEvent = (
    record: InteractiveQueryCostEstimateRecord,
): QueryCostEstimateCompletedEvent => ({
    event: 'query_cost_estimate.completed',
    properties: {
        organizationId: record.organizationUuid,
        projectId: record.projectUuid,
        source: record.source,
        outcome: record.outcome,
        estimatedBytes: record.estimatedBytes,
        confirmEstimatedBytesAbove: record.thresholdBytes,
        requiresConfirmation: record.requiresConfirmation,
        cacheHit: record.cache === 'none' ? null : record.cache === 'hit',
        dryRunDurationMs: record.dryRunDurationMs,
        warehouseType: record.warehouseType,
    },
});
