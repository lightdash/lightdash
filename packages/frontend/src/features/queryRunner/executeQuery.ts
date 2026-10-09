import {
    QueryHistoryStatus,
    type ApiExecuteAsyncSqlQueryResults,
    type ApiGetAsyncQueryResults,
    type ExecuteAsyncDashboardSqlChartRequestParams,
    type ExecuteAsyncSqlChartRequestParams,
    type ExecuteAsyncSqlQueryRequestParams,
    type ParametersValuesMap,
    type RawResultRow,
} from '@lightdash/common';
import { lightdashApi } from '../../api';
import { getResultsFromStream } from '../../utils/request';
import type { ResultsAndColumns } from '../sqlRunner/hooks/useSqlQueryRun';

const throwIfAborted = (signal: AbortSignal | undefined) => {
    if (signal?.aborted) {
        throw new DOMException('Query cancelled', 'AbortError');
    }
};

export const cancelAsyncQuery = async (
    projectUuid: string,
    queryUuid: string,
): Promise<void> => {
    await lightdashApi<undefined>({
        url: `/projects/${projectUuid}/query/${queryUuid}/cancel`,
        version: 'v2',
        method: 'POST',
        body: undefined,
    });
};

export const pollForResults = async (
    projectUuid: string,
    queryUuid: string,
    backoffMs: number = 250,
    signal?: AbortSignal,
): Promise<ApiGetAsyncQueryResults> => {
    throwIfAborted(signal);
    const results = await lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    if (
        results.status === QueryHistoryStatus.PENDING ||
        results.status === QueryHistoryStatus.QUEUED ||
        results.status === QueryHistoryStatus.EXECUTING
    ) {
        // Implement backoff: 250ms -> 500ms -> 1000ms (then stay at 1000ms)
        const nextBackoff = Math.min(backoffMs * 2, 1000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        throwIfAborted(signal);
        return pollForResults(projectUuid, queryUuid, nextBackoff, signal);
    }

    return results;
};

export type ExecuteSqlQueryOptions = {
    signal?: AbortSignal;
    // Fires once the warehouse has accepted the query, so it can be cancelled
    onQueryStarted?: (queryUuid: string) => void;
};

export const executeSqlQuery = async (
    projectUuid: string,
    sql: string,
    limit?: number,
    parameterValues?: ParametersValuesMap,
    invalidateCache?: boolean,
    warehouseConnectionUuid?: string | null,
    options: ExecuteSqlQueryOptions = {},
): Promise<ResultsAndColumns> => {
    throwIfAborted(options.signal);
    const response = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            sql,
            limit,
            parameters: parameterValues,
            invalidateCache,
            ...(warehouseConnectionUuid === undefined
                ? {}
                : { warehouseConnectionUuid }),
        }),
    });

    options.onQueryStarted?.(response.queryUuid);
    const query = await pollForResults(
        projectUuid,
        response.queryUuid,
        250,
        options.signal,
    );

    if (
        query.status === QueryHistoryStatus.ERROR ||
        query.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(query.error || 'Error executing SQL query');
    }

    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status');
    }

    const fileUrl = `/api/v2/projects/${projectUuid}/query/${response.queryUuid}/results`;

    const results = await getResultsFromStream<RawResultRow>(fileUrl);

    return {
        queryUuid: query.queryUuid,
        fileUrl,
        results,
        columns: Object.values(query.columns),
        durationMs: query.metadata.performance.initialQueryExecutionMs,
    };
};

export const getPivotQueryResults = async (
    projectUuid: string,
    queryUuid: string,
) =>
    readPivotQueryResults(
        projectUuid,
        await pollForResults(projectUuid, queryUuid),
    );

/** Reads a polled pivot query's results; throws when it did not finish ready. */
export const readPivotQueryResults = async (
    projectUuid: string,
    query: ApiGetAsyncQueryResults,
) => {
    const { queryUuid } = query;
    if (
        query.status === QueryHistoryStatus.ERROR ||
        query.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(query.error || 'Error executing SQL query');
    }

    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status');
    }

    const fileUrl = `/api/v2/projects/${projectUuid}/query/${queryUuid}/results`;

    const results = await getResultsFromStream<RawResultRow>(fileUrl);

    return {
        results,
        indexColumn: query.pivotDetails?.indexColumn,
        valuesColumns: query.pivotDetails?.valuesColumns ?? [],
        columnCount: query.pivotDetails?.totalColumnCount ?? undefined,
        fileUrl,
        columns: query.columns,
        originalColumns: query.pivotDetails
            ? query.pivotDetails.originalColumns
            : query.columns,
        queryUuid: query.queryUuid,
    };
};

export const executeSqlPivotQuery = async (
    projectUuid: string,
    payload: ExecuteAsyncSqlQueryRequestParams,
) => {
    if (!payload.pivotConfiguration) {
        throw new Error('Pivot configuration is required');
    }

    const response = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql`,
        method: 'POST',
        body: JSON.stringify({ ...payload }),
        version: 'v2',
    });

    return getPivotQueryResults(projectUuid, response.queryUuid);
};

export const executeSqlChartPivotQuery = async (
    projectUuid: string,
    payload: ExecuteAsyncSqlChartRequestParams,
) => {
    const response = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql-chart`,
        method: 'POST',
        body: JSON.stringify(payload),
        version: 'v2',
    });

    return getPivotQueryResults(projectUuid, response.queryUuid);
};

export const executeDashboardSqlChartPivotQuery = async (
    projectUuid: string,
    payload: ExecuteAsyncDashboardSqlChartRequestParams,
) => {
    const executeQueryResponse =
        await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
            url: `/projects/${projectUuid}/query/dashboard-sql-chart`,
            method: 'POST',
            body: JSON.stringify(payload),
            version: 'v2',
        });

    return getPivotQueryResults(projectUuid, executeQueryResponse.queryUuid);
};

// Embed-only path: hits the /embed/* endpoint, which authorizes via the
// dashboard JWT instead of the registered chart access used by the v2
// dashboard-sql-chart endpoint.
export const executeEmbedDashboardSqlChartPivotQuery = async (
    projectUuid: string,
    payload: {
        tileUuid: string;
    } & Pick<
        ExecuteAsyncDashboardSqlChartRequestParams,
        | 'dashboardFilters'
        | 'dashboardSorts'
        | 'invalidateCache'
        | 'parameters'
        | 'limit'
    >,
) => {
    const executeQueryResponse =
        await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
            url: `/embed/${projectUuid}/query/dashboard-sql-chart`,
            method: 'POST',
            body: JSON.stringify(payload),
        });

    return getPivotQueryResults(projectUuid, executeQueryResponse.queryUuid);
};
