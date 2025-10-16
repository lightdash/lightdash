import {
    ChartType,
    type TableChartConfig,
} from '../../../../../types/savedCharts';

export const getTableChartConfig = (): TableChartConfig => ({
    type: ChartType.TABLE,
});
