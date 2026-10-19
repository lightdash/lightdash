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
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

type AddChartArgs = {
    savedData: CreateSavedChartVersion;
    name: string;
    description: string | null;
    dashboardUuid: string;
    activeTabUuid: string | null;
};

export const useAddChartToDashboard = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useCallback(
        async ({
            savedData,
            name,
            description,
            dashboardUuid,
            activeTabUuid,
        }: AddChartArgs): Promise<SavedChart> => {
            const dashboard = await getDashboard(
                lightdashApi,
                dashboardUuid,
                projectUuid,
            );

            const savedChart = await createSavedQuery(
                lightdashApi,
                projectUuid,
                {
                    ...savedData,
                    name,
                    description: description ?? undefined,
                    dashboardUuid,
                },
            );

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
                lightdashApi,
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
        [projectUuid, lightdashApi],
    );
};
