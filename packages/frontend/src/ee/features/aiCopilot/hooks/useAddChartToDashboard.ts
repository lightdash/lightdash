import {
    ChartType,
    DashboardTileTypes,
    getDefaultChartTileSize,
    type CreateSavedChartVersion,
    type DashboardChartTile,
    type SavedChart,
} from '@lightdash/common';
import { useCallback } from 'react';
import { v4 as uuid4 } from 'uuid';
import {
    appendNewTilesToBottom,
    getDashboard,
    updateDashboardApi,
} from '../../../../hooks/dashboard/useDashboard';
import { createSavedQuery } from '../../../../hooks/useSavedQuery';

type AddChartArgs = {
    savedData: CreateSavedChartVersion;
    name: string;
    description: string | null;
    dashboardUuid: string;
    activeTabUuid: string | null;
};

/**
 * Creates a chart that belongs to an existing dashboard and appends it as a new
 * tile to the bottom of that dashboard. Mirrors the `SaveDestination.Dashboard`
 * branch of `SaveToSpaceOrDashboard`, but skips navigation and toasts so the AI
 * agent launcher can save in a single click while the user keeps viewing the
 * dashboard. Errors propagate to the caller, which owns the toast.
 */
export const useAddChartToDashboard = (projectUuid: string) => {
    return useCallback(
        async ({
            savedData,
            name,
            description,
            dashboardUuid,
            activeTabUuid,
        }: AddChartArgs): Promise<SavedChart> => {
            const dashboard = await getDashboard(dashboardUuid, projectUuid);

            const savedChart = await createSavedQuery(projectUuid, {
                ...savedData,
                name,
                description: description ?? undefined,
                dashboardUuid,
            });

            const tabUuid = activeTabUuid ?? dashboard.tabs?.[0]?.uuid;
            const newTile: DashboardChartTile = {
                uuid: uuid4(),
                type: DashboardTileTypes.SAVED_CHART,
                tabUuid,
                properties: {
                    belongsToDashboard: true,
                    savedChartUuid: savedChart.uuid,
                    chartName: name,
                    hideTitle:
                        savedData.chartConfig?.type === ChartType.BIG_NUMBER
                            ? true
                            : undefined,
                },
                ...getDefaultChartTileSize(savedData.chartConfig?.type),
            };

            await updateDashboardApi(
                dashboardUuid,
                {
                    filters: dashboard.filters,
                    tiles: appendNewTilesToBottom(dashboard.tiles, [newTile]),
                    tabs: dashboard.tabs,
                },
                projectUuid,
            );

            return savedChart;
        },
        [projectUuid],
    );
};
