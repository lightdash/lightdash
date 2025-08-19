import { ChartSourceType } from '../types/content';
import { type DashboardTile, DashboardTileTypes } from '../types/dashboard';
import { ParameterError } from '../types/errors';
import assertUnreachable from './assertUnreachable';

export const convertChartSourceTypeToDashboardTileType = (
    sourceType: ChartSourceType,
): DashboardTileTypes => {
    switch (sourceType) {
        case ChartSourceType.DBT_EXPLORE:
            return DashboardTileTypes.SAVED_CHART;
        case ChartSourceType.SQL:
            return DashboardTileTypes.SQL_CHART;
        default:
            return assertUnreachable(
                sourceType,
                `Unknown source type: ${sourceType}`,
            );
    }
};

/**
 * Validates that selected tabs exist in the dashboard tiles.
 * If selectedTabs is provided and not empty, ensures at least one selected tab exists in dashboard tabs.
 * @param selectedTabs - Array of selected tab UUIDs or null
 * @param dashboardTiles - Array of dashboard tiles
 * @throws ParameterError if none of the selected tabs exist in the dashboard
 */
export const validateSelectedTabs = (
    selectedTabs: string[] | null,
    dashboardTiles: DashboardTile[],
): void => {
    // If selectedTabs is provided and not empty, validate that at least one exists in dashboard tabs
    if (selectedTabs && selectedTabs.length > 0) {
        const availableTabs = dashboardTiles
            .map((tile) => tile.tabUuid)
            .filter((tabUuid): tabUuid is string => !!tabUuid)
            .filter((tabUuid, index, self) => self.indexOf(tabUuid) === index);

        const validSelectedTabs = selectedTabs.filter((tabUuid) =>
            availableTabs.includes(tabUuid),
        );
        if (validSelectedTabs.length === 0) {
            throw new ParameterError(
                `None of the selected tabs exist in the dashboard`,
            );
        }
    }
};
