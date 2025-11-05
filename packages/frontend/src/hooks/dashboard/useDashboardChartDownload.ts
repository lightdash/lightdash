import {
    FeatureFlags,
    MAX_SAFE_INTEGER,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncDashboardChartQueryResults,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../api';
import { Limit } from '../../components/ExportResults/types';
import { pollForResults } from '../../features/queryRunner/executeQuery';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useFeatureFlag } from '../useFeatureFlagEnabled';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

export const useDashboardChartDownload = (
    tileUuid: string,
    chartUuid: string,
    projectUuid: string | undefined,
    dashboardUuid: string | undefined,
    originalQueryUuid: string,
) => {
    // Get dashboard filters and sorts for this tile
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const parameters = useDashboardContext((c) => c.parameterValues);
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const getDownloadQueryUuid = useCallback(
        async (limit: number | null, limitType: Limit): Promise<string> => {
            if (!projectUuid || !dashboardUuid) {
                throw new Error('Missing required parameters');
            }

            // When limiting to the table, use the original query uuid so we don't execute a new query
            if (limitType === Limit.TABLE) {
                return originalQueryUuid;
            }

            // Execute a new query with the specified limit for download
            const executeQueryResponse =
                await lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
                    url: `/projects/${projectUuid}/query/dashboard-chart`,
                    version: 'v2',
                    method: 'POST',
                    body: JSON.stringify({
                        context: QueryExecutionContext.DASHBOARD,
                        tileUuid,
                        chartUuid,
                        dashboardUuid,
                        dashboardFilters: dashboardFilters || {},
                        dashboardSorts: dashboardSorts || [],
                        dateZoom: dateZoomGranularity
                            ? { granularity: dateZoomGranularity }
                            : undefined,
                        limit: limit ?? MAX_SAFE_INTEGER,
                        invalidateCache: false,
                        parameters,
                        pivotResults: useSqlPivotResults?.enabled,
                    }),
                });

            // Poll for results similar to executeQueryAndWaitForResults
            const results = await pollForResults(
                projectUuid,
                executeQueryResponse.queryUuid,
            );

            if (results.status === QueryHistoryStatus.ERROR) {
                throw new Error(results.error || 'Error executing SQL query');
            }

            if (results.status !== QueryHistoryStatus.READY) {
                throw new Error('Unexpected query status');
            }

            return executeQueryResponse.queryUuid;
        },
        [
            projectUuid,
            dashboardUuid,
            tileUuid,
            chartUuid,
            dashboardFilters,
            dashboardSorts,
            dateZoomGranularity,
            parameters,
            useSqlPivotResults?.enabled,
            originalQueryUuid,
        ],
    );

    return { getDownloadQueryUuid };
};
