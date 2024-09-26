import { ChartSourceType } from '../types/content';
import { DashboardTileTypes } from '../types/dashboard';
import assertUnreachable from './assertUnreachable';

export const convertChartSourceTypeToDashboardTileType = (
    sourceType: ChartSourceType,
): DashboardTileTypes => {
    switch (sourceType) {
        case ChartSourceType.DBT_EXPLORE:
            return DashboardTileTypes.SAVED_CHART;
        case ChartSourceType.SQL:
            return DashboardTileTypes.SQL_CHART;
        case ChartSourceType.SEMANTIC_LAYER:
            return DashboardTileTypes.SEMANTIC_VIEWER_CHART;
        default:
            return assertUnreachable(
                sourceType,
                `Unknown source type: ${sourceType}`,
            );
    }
};
