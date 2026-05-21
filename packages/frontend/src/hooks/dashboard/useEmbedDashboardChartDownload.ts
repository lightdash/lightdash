import {
    FeatureFlags,
    QueryHistoryStatus,
    type ApiExecuteAsyncDashboardChartQueryResults,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../api';
import { Limit } from '../../components/ExportResults/types';
import { pollForResults } from '../../features/queryRunner/executeQuery';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

export const useEmbedDashboardChartDownload = (
    tileUuid: string,
    projectUuid: string | undefined,
    originalQueryUuid: string,
    canExportPivotedData: boolean,
) => {
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
    const { data: useSqlPivotResults } = useServerFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const getDownloadQueryUuid = useCallback(
        async (
            limit: number | null,
            limitType: Limit,
            exportPivotedData: boolean = true,
        ): Promise<string> => {
            if (!projectUuid) {
                throw new Error('Missing required parameters');
            }

            const originalQueryIsPivoted =
                canExportPivotedData && !!useSqlPivotResults?.enabled;
            const shouldPivotResults =
                exportPivotedData && originalQueryIsPivoted;

            // When limiting to the table, use the original query uuid
            if (
                limitType === Limit.TABLE &&
                originalQueryIsPivoted === shouldPivotResults
            ) {
                return originalQueryUuid;
            }

            // Execute a new query with the specified limit via embed endpoint
            const executeQueryResponse =
                await lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
                    url: `/embed/${projectUuid}/query/dashboard-tile`,
                    method: 'POST',
                    body: JSON.stringify({
                        tileUuid,
                        dashboardFilters: dashboardFilters || {},
                        dashboardSorts: dashboardSorts || [],
                        dateZoom: dateZoomGranularity
                            ? { granularity: dateZoomGranularity }
                            : undefined,
                        limit,
                        invalidateCache: false,
                        parameters,
                        pivotResults: shouldPivotResults,
                    }),
                });

            const results = await pollForResults(
                projectUuid,
                executeQueryResponse.queryUuid,
            );

            if (
                results.status === QueryHistoryStatus.ERROR ||
                results.status === QueryHistoryStatus.EXPIRED
            ) {
                throw new Error(results.error || 'Error executing query');
            }

            if (results.status !== QueryHistoryStatus.READY) {
                throw new Error('Unexpected query status');
            }

            return executeQueryResponse.queryUuid;
        },
        [
            projectUuid,
            tileUuid,
            dashboardFilters,
            dashboardSorts,
            dateZoomGranularity,
            parameters,
            canExportPivotedData,
            useSqlPivotResults?.enabled,
            originalQueryUuid,
        ],
    );

    return { getDownloadQueryUuid };
};
