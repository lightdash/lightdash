import {
    type ApiError,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ApiExecuteAsyncDashboardSqlChartQueryResults,
    type ApiExecuteAsyncFieldValueSearchResults,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiExecuteAsyncSqlQueryResults,
    type ExecuteAsyncQueryRequestParams,
    type QueryHistoryListItem,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

/**
 * Maps a persisted request-parameters union back to the execute endpoint that
 * produced it, discriminating on the keys each request shape carries.
 */
const getExecuteEndpoint = (
    params: ExecuteAsyncQueryRequestParams,
): string | null => {
    if ('underlyingDataSourceQueryUuid' in params) return 'underlying-data';
    if ('fieldId' in params) return 'field-values';
    if ('sql' in params) return 'sql';
    if ('dashboardUuid' in params) {
        return 'chartUuid' in params
            ? 'dashboard-chart'
            : 'dashboard-sql-chart';
    }
    if ('savedSqlUuid' in params || 'slug' in params) return 'sql-chart';
    if ('chartUuid' in params) return 'chart';
    if ('query' in params) return 'metric-query';
    return null;
};

export const canRerunQuery = (item: QueryHistoryListItem): boolean =>
    getExecuteEndpoint(item.requestParameters) !== null;

type RerunResults =
    | ApiExecuteAsyncMetricQueryResults
    | ApiExecuteAsyncSqlQueryResults
    | ApiExecuteAsyncDashboardChartQueryResults
    | ApiExecuteAsyncDashboardSqlChartQueryResults
    | ApiExecuteAsyncFieldValueSearchResults;

/** Replays the run's original request with the cache invalidated. */
export const useRerunQuery = (projectUuid: string | undefined) => {
    const queryClient = useQueryClient();
    return useMutation<RerunResults, ApiError, QueryHistoryListItem>({
        mutationFn: async (item) => {
            const endpoint = getExecuteEndpoint(item.requestParameters);
            if (!projectUuid || !endpoint) {
                throw new Error('This query cannot be re-run');
            }
            return lightdashApi<RerunResults>({
                version: 'v2',
                url: `/projects/${projectUuid}/query/${endpoint}`,
                method: 'POST',
                body: JSON.stringify({
                    ...item.requestParameters,
                    invalidateCache: true,
                }),
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries(['query-history']);
        },
    });
};
