import {
    drillStackToSteps,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncMetricQueryResults,
    type DrillStep,
    type SavedChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo } from 'react';
import { lightdashApi } from '../api';
import { Limit } from '../components/ExportResults/types';
import {
    selectDrillState,
    useExplorerSelector,
} from '../features/explorer/store';
import { pollForResults } from '../features/queryRunner/executeQuery';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import useDashboardFiltersForTile from './dashboard/useDashboardFiltersForTile';
import {
    useDrillThroughResults,
    type DashboardDrillContext,
} from './useDrillThroughResults';
import { useProjectUuid } from './useProjectUuid';

/**
 * Manages drill query execution for a dashboard tile.
 * Builds drill steps from Redux state, reads dashboard context,
 * executes via the chart-drill endpoint, and provides an export callback.
 */
export const useDrillQuery = (
    chart: SavedChart,
    tileUuid: string,
    onDrillExportReady?: (
        getDownloadQueryUuid: (
            limit: number | null,
            limitType: Limit,
        ) => Promise<string>,
        totalResults: number | undefined,
    ) => void,
) => {
    const drillState = useExplorerSelector(selectDrillState);
    const projectUuid = useProjectUuid();

    const drillSteps: DrillStep[] = useMemo(
        () => (drillState ? drillStackToSteps(drillState.stack) : []),
        [drillState],
    );

    // Report drill steps to dashboard context for dashboard-wide CSV export
    const setTileDrillSteps = useDashboardContext((c) => c.setTileDrillSteps);
    const clearTileDrillSteps = useDashboardContext(
        (c) => c.clearTileDrillSteps,
    );
    useEffect(() => {
        if (drillSteps.length > 0) {
            setTileDrillSteps(tileUuid, chart.uuid, drillSteps);
        }
        return () => {
            clearTileDrillSteps(tileUuid);
        };
    }, [
        tileUuid,
        chart.uuid,
        drillSteps,
        setTileDrillSteps,
        clearTileDrillSteps,
    ]);

    // Read dashboard context for the drill query
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const chartSort = useDashboardContext((c) => c.chartSort);

    const dashboardContext: DashboardDrillContext = useMemo(
        () => ({
            dashboardFilters: dashboardFilters ?? undefined,
            dashboardSorts: chartSort?.[tileUuid],
            dateZoom: dateZoomGranularity
                ? { granularity: dateZoomGranularity }
                : undefined,
        }),
        [dashboardFilters, chartSort, tileUuid, dateZoomGranularity],
    );

    // Execute the drill query
    const { data: drillResults, isLoading } = useDrillThroughResults(
        chart.uuid,
        drillSteps,
        drillSteps.length > 0,
        dashboardContext,
    );

    // Export callback for data downloads
    const getDownloadQueryUuid = useCallback(
        async (limit: number | null, limitType: Limit): Promise<string> => {
            if (!projectUuid) {
                throw new Error('Missing project UUID');
            }
            if (limitType === Limit.TABLE && drillResults?.queryUuid) {
                return drillResults.queryUuid;
            }
            const executeResponse =
                await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
                    url: `/projects/${projectUuid}/query/chart-drill`,
                    version: 'v2',
                    method: 'POST',
                    body: JSON.stringify({
                        context: QueryExecutionContext.DASHBOARD,
                        chartUuid: chart.uuid,
                        drillSteps,
                        ...dashboardContext,
                        limit,
                        invalidateCache: false,
                    }),
                });
            const results = await pollForResults(
                projectUuid,
                executeResponse.queryUuid,
            );
            if (
                results.status === QueryHistoryStatus.ERROR ||
                results.status === QueryHistoryStatus.EXPIRED
            ) {
                throw new Error(results.error || 'Error executing drill query');
            }
            if (results.status !== QueryHistoryStatus.READY) {
                throw new Error('Unexpected query status');
            }
            return executeResponse.queryUuid;
        },
        [
            projectUuid,
            chart.uuid,
            drillSteps,
            dashboardContext,
            drillResults?.queryUuid,
        ],
    );

    // Notify parent of export capabilities
    useEffect(() => {
        if (onDrillExportReady && drillResults) {
            onDrillExportReady(getDownloadQueryUuid, drillResults.rows.length);
        }
    }, [onDrillExportReady, drillResults, getDownloadQueryUuid]);

    return { drillState, drillSteps, drillResults, isLoading };
};
