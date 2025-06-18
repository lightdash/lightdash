import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncDashboardChartQueryResults,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../api';
import { pollForResults } from '../../features/queryRunner/executeQuery';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

export const useDashboardChartDownload = (
    tileUuid: string,
    chartUuid: string,
    projectUuid: string | undefined,
    dashboardUuid: string | undefined,
) => {
    // Get dashboard filters and sorts for this tile
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );

    const getDownloadQueryUuid = useCallback(
        async (limit: number | null): Promise<string> => {
            if (!projectUuid || !dashboardUuid) {
                throw new Error('Missing required parameters');
            }

            // Execute a new query with the specified limit for download
            const executeQueryResponse =
                await lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
                    url: `/projects/${projectUuid}/query/dashboard-chart`,
                    version: 'v2',
                    method: 'POST',
                    body: JSON.stringify({
                        context: QueryExecutionContext.DASHBOARD,
                        chartUuid,
                        dashboardUuid,
                        dashboardFilters: dashboardFilters || {},
                        dashboardSorts: dashboardSorts || [],
                        dateZoom: dateZoomGranularity
                            ? { granularity: dateZoomGranularity }
                            : undefined,
                        limit: limit ?? Number.MAX_SAFE_INTEGER,
                        invalidateCache: false,
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
            chartUuid,
            dashboardFilters,
            dashboardSorts,
            dateZoomGranularity,
        ],
    );

    return { getDownloadQueryUuid };
};
