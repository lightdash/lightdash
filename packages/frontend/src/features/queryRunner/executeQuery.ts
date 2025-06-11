import {
    type ApiExecuteAsyncSqlQueryResults,
    type ApiGetAsyncQueryResults,
    type ExecuteAsyncDashboardSqlChartRequestParams,
    type ExecuteAsyncSqlChartRequestParams,
    type ExecuteAsyncSqlQueryRequestParams,
    QueryHistoryStatus,
    type RawResultRow,
} from '@lightdash/common';
import { lightdashApi } from '../../api';
import { getResultsFromStream } from '../../utils/request';
import type { ResultsAndColumns } from '../sqlRunner/hooks/useSqlQueryRun';

export const pollForResults = async (
    projectUuid: string,
    queryUuid: string,
    backoffMs: number = 250,
): Promise<ApiGetAsyncQueryResults> => {
    const results = await lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    if (results.status === QueryHistoryStatus.PENDING) {
        // Implement backoff: 250ms -> 500ms -> 1000ms (then stay at 1000ms)
        const nextBackoff = Math.min(backoffMs * 2, 1000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return pollForResults(projectUuid, queryUuid, nextBackoff);
    }

    return results;
};

export const executeSqlQuery = async (
    projectUuid: string,
    sql: string,
    limit?: number,
): Promise<ResultsAndColumns> => {
    const response = await lightdashApi<ApiExecuteAsyncSqlQueryResults>({
        url: `/projects/${projectUuid}/query/sql`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({ sql, limit }),
    });

    const query = await pollForResults(projectUuid, response.queryUuid);

    if (query.status === QueryHistoryStatus.ERROR) {
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
    };
};

const getPivotQueryResults = async (projectUuid: string, queryUuid: string) => {
    const query = await pollForResults(projectUuid, queryUuid);

    if (query.status === QueryHistoryStatus.ERROR) {
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
