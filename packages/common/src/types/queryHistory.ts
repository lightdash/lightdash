import type { PivotConfiguration, ResultColumns } from '..';
import type { PivotValuesColumn } from '../visualizations/types';
import { type AgentIdentityClaim } from './agentIdentity';
import type { QueryExecutionContext, QuerySurface } from './analytics';
import type { ExecuteAsyncQueryRequestParams } from './api/paginatedQuery';
import type { AuthType } from './auth';
import type { ItemsMap } from './field';
import type { MetricQuery } from './metricQuery';
import type { ParametersValuesMap } from './parameters';
import type { WarehouseTypes } from './projects';

export interface IWarehouseQueryMetadata {
    type: WarehouseTypes;
}

export interface BigQueryWarehouseQueryMetadata extends IWarehouseQueryMetadata {
    type: WarehouseTypes.BIGQUERY;
    jobLocation: string;
}

export type WarehouseQueryMetadata = BigQueryWarehouseQueryMetadata;

export enum QueryHistoryStatus {
    PENDING = 'pending',
    QUEUED = 'queued',
    EXECUTING = 'executing',
    EXPIRED = 'expired',
    READY = 'ready',
    ERROR = 'error',
    CANCELLED = 'cancelled',
}

// duckdb = managed materialization via the DuckDB client override;
// project_warehouse = external pre-aggregate on the normal project client
export type PreAggregateExecutionEngine = 'duckdb' | 'project_warehouse';

// Why a matched pre-aggregate query was served from the source warehouse instead
export type PreAggregateFallbackReason =
    | 'duckdb_execution_error'
    | 'external_execution_error';

/** A direct semantic field reference captured at query execution time. */
export type SemanticFieldReference = {
    fieldId: string;
    fieldName: string;
    tableName: string;
    fieldLabel: string;
    fieldKind: 'metric' | 'dimension';
    fieldOrigin: 'model' | 'custom';
    definitionHash: string;
    role: 'selected' | 'filter' | 'group' | 'sort';
};

/** Direct runtime references only, not the dependencies inside field SQL. */
export type SemanticQueryUsage = {
    status: 'captured' | 'partial' | 'unavailable';
    references: SemanticFieldReference[];
};

/** Server-owned attribution persisted with a query for background workers. */
export type QueryUsageMetadata = {
    startedAtMs: number;
    timingBasis: 'request' | 'query_submission';
    requestId: string | null;
    parentOperationId: string | null;
    actorType: string;
    appId: string | null;
    appVersion?: number | null;
    dashboardTileId: string | null;
    schedulerId: string | null;
    semanticUsage?: SemanticQueryUsage;
    querySurface?: QuerySurface;
};

export type QueryHistory = {
    agentIdentity: AgentIdentityClaim | null;
    warehouseConnectionUuid?: string | null;
    queryUuid: string;
    createdAt: Date;
    createdBy: string | null;
    createdByUserUuid: string | null;
    createdByAccount: string | null;
    createdByActorType: AuthType | null;
    organizationUuid: string;
    projectUuid: string | null;
    warehouseQueryId: string | null;
    warehouseQueryMetadata: WarehouseQueryMetadata | null;
    context: QueryExecutionContext;
    defaultPageSize: number | null;
    compiledSql: string;
    metricQuery: MetricQuery;
    fields: ItemsMap;
    requestParameters: ExecuteAsyncQueryRequestParams & {
        /** Internal metadata, never trusted from request bodies or used in cache keys. */
        queryUsage?: QueryUsageMetadata;
        aiSignInCredentialUuid?: string;
    };
    /** Resolved parameter values in effect for this execution (request values
     *  merged with defaults). Null on rows written before the column existed. */
    usedParameters: ParametersValuesMap | null;
    status: QueryHistoryStatus;
    totalRowCount: number | null;
    warehouseExecutionTimeMs: number | null;
    error: string | null;
    erroredAt: Date | null;
    cacheKey: string;
    pivotConfiguration: PivotConfiguration | null;
    pivotValuesColumns: Record<string, PivotValuesColumn> | null;
    pivotTotalColumnCount: number | null;
    resultsFileName: string | null; // S3 file name
    resultsCreatedAt: Date | null;
    resultsUpdatedAt: Date | null;
    resultsExpiresAt: Date | null;
    columns: ResultColumns | null; // result columns with or without pivoting
    originalColumns: ResultColumns | null; // columns from original SQL, before pivoting
    preAggregateCompiledSql: string | null; // DuckDB SQL for pre-aggregate execution path
    preAggregateExecution: PreAggregateExecutionEngine | null; // engine for preAggregateCompiledSql
    preAggregateFallbackReason: PreAggregateFallbackReason | null; // non-null ⇒ matched but served from source warehouse
    processingStartedAt: Date | null; // when the NATS worker picked up the job
};

/**
 * How a DuckDB source query over other results executes, persisted on its
 * history row so a worker can rebuild the run from the row alone: which
 * results it reads, which engine session runs it, whether its columns are
 * probed or were supplied at submit, and the guard that may refuse it once
 * its references complete. `refusal` is written by the run when that guard
 * trips, so whoever reports the outcome can tell a refusal from a failure.
 */
export type DuckdbExecutionSpec = {
    /** Table name -> queryUuid of the result it reads, already resolved. */
    references: Record<string, string>;
    /** Always the scoped session: row data must never grant the shared one. */
    engine: 'scopedToReferencedResults';
    columns:
        | {
              mode: 'discover';
              limit: number | null;
              parameters: ParametersValuesMap;
          }
        | { mode: 'supplied' };
    /** Refuses the run when a referenced leg reached the row cap; labels name the source. */
    guard: {
        legLabelByReferenceTable: Record<string, string>;
        sourceRowCap: number;
    } | null;
    /** Persisted instead of the executed SQL when that carries private URIs. */
    storedCompiledSql: string | null;
    /** What the user calls each referenced table, for messages that name one. */
    referenceLabels: Record<string, string>;
    /** The submitter asked for fresh results: no lookup by the result files. */
    invalidateCache: boolean;
    /** Set when the run was served from another run over the same result files. */
    cacheHit: boolean;
    refusal: { kind: 'row_cap' } | null;
};
