import {
    DashboardTileTypes,
    type DashboardChartTile,
    type DashboardSqlChartTile,
} from '@lightdash/common';

/**
 * A SQL chart tile as the chart tile it is: a SQL chart is a saved chart
 * under the same uuid, and the server reads these tiles as chart tiles.
 * Covers a tile a client still holds in the old shape.
 */
export const asSavedChartTile = (
    tile: DashboardSqlChartTile,
): DashboardChartTile => ({
    ...tile,
    type: DashboardTileTypes.SAVED_CHART,
    properties: {
        title: tile.properties.title,
        hideTitle: tile.properties.hideTitle,
        savedChartUuid: tile.properties.savedSqlUuid,
        chartName: tile.properties.chartName,
        chartSlug: tile.properties.chartSlug,
    },
});
