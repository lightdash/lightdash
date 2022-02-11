import { DBChartTypes } from './savedCharts';

export enum DashboardTileTypes {
    SAVED_CHART = 'saved_chart',
    MARKDOWN = 'markdown',
    LOOM = 'loom',
}

export const getDefaultChartTileSize = (
    chartType: DBChartTypes | undefined,
) => {
    switch (chartType) {
        case DBChartTypes.BIG_NUMBER:
            return {
                h: 2,
                w: 3,
                x: 0,
                y: 0,
            };
        default:
            return {
                h: 3,
                w: 5,
                x: 0,
                y: 0,
            };
    }
};
