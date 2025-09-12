import {
    DashboardTileTypes,
    getChartKind,
    getDefaultChartTileSize,
    type DashboardChartTile,
    type SavedChart,
} from '@lightdash/common';
import { v4 as uuid4 } from 'uuid';

export function createTwoColumnTiles(
    savedCharts: SavedChart[],
    firstTabUuid?: string,
): DashboardChartTile[] {
    return savedCharts.map((chart, index) => {
        const defaultSize = getDefaultChartTileSize(chart.chartConfig?.type);

        return {
            uuid: uuid4(),
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: firstTabUuid,
            properties: {
                belongsToDashboard: true,
                savedChartUuid: chart.uuid,
                chartName: chart.name,
                chartSlug: chart.slug,
                lastVersionChartKind:
                    getChartKind(
                        chart.chartConfig?.type,
                        chart.chartConfig?.config,
                    ) || null,
            },
            // Alternate between left (x:0) and right (x:18) columns
            x: (index % 2) * 18,
            w: 18,
            // Stack rows, each row is the height of the default tile
            y: Math.floor(index / 2) * defaultSize.h,
            h: defaultSize.h,
        };
    });
}
