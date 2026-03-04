import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import { useMemo } from 'react';
import useApp from '../../providers/App/useApp';

type ChartTileType =
    | typeof DashboardTileTypes.SAVED_CHART
    | typeof DashboardTileTypes.SQL_CHART;

const CHART_TILE_TYPES: ChartTileType[] = [
    DashboardTileTypes.SAVED_CHART,
    DashboardTileTypes.SQL_CHART,
];

const isChartTile = (tile: Dashboard['tiles'][number]): boolean =>
    CHART_TILE_TYPES.includes(tile.type as ChartTileType);

type TabWarning = {
    tabUuid: string | undefined;
    tabName: string;
    chartCount: number;
    limit: number;
};

type PerformanceWarning = {
    hasWarning: boolean;
    tabsExceedingLimit: TabWarning[];
    totalChartCount: number;
    totalTabs: number;
    maxTabsLimit: number;
    exceedsTabs: boolean;
};

/**
 * Analyzes a dashboard for performance issues related to:
 * - Tabs with more than the recommended number of chart tiles (SAVED_CHART or SQL_CHART)
 * - Dashboards with more than the recommended number of tabs
 *
 * These limits are based on DOM node constraints that can cause browser performance issues.
 */
const useDashboardPerformanceWarning = (
    dashboardTiles: Dashboard['tiles'] | undefined,
    dashboardTabs: Dashboard['tabs'] | undefined,
): PerformanceWarning => {
    const { health } = useApp();

    const maxTilesPerTab = health.data?.dashboard?.maxTilesPerTab ?? 50;
    const maxTabsPerDashboard =
        health.data?.dashboard?.maxTabsPerDashboard ?? 20;

    return useMemo(() => {
        if (!dashboardTiles) {
            return {
                hasWarning: false,
                tabsExceedingLimit: [],
                totalChartCount: 0,
                totalTabs: 0,
                maxTabsLimit: maxTabsPerDashboard,
                exceedsTabs: false,
            };
        }

        // Group chart tiles by tab
        const chartTilesByTab = new Map<string | undefined, number>();

        dashboardTiles.forEach((tile) => {
            if (isChartTile(tile)) {
                const tabUuid = tile.tabUuid;
                const currentCount = chartTilesByTab.get(tabUuid) ?? 0;
                chartTilesByTab.set(tabUuid, currentCount + 1);
            }
        });

        // Find tabs that exceed the limit
        const tabsExceedingLimit: TabWarning[] = [];

        chartTilesByTab.forEach((chartCount, tabUuid) => {
            if (chartCount > maxTilesPerTab) {
                const tab = dashboardTabs?.find((t) => t.uuid === tabUuid);
                tabsExceedingLimit.push({
                    tabUuid,
                    tabName: tab?.name ?? 'Default',
                    chartCount,
                    limit: maxTilesPerTab,
                });
            }
        });

        // Check total tabs
        const totalTabs = dashboardTabs?.length ?? 1;
        const exceedsTabs = totalTabs > maxTabsPerDashboard;

        const totalChartCount = Array.from(chartTilesByTab.values()).reduce(
            (sum, count) => sum + count,
            0,
        );

        return {
            hasWarning: tabsExceedingLimit.length > 0 || exceedsTabs,
            tabsExceedingLimit,
            totalChartCount,
            totalTabs,
            maxTabsLimit: maxTabsPerDashboard,
            exceedsTabs,
        };
    }, [dashboardTiles, dashboardTabs, maxTilesPerTab, maxTabsPerDashboard]);
};

export default useDashboardPerformanceWarning;
