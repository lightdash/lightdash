import {
    ChartType,
    type TableChartConfig,
} from '../../../../../types/savedCharts';

export const getTableChartConfig = (): TableChartConfig => ({
    type: ChartType.TABLE,
    config: {
        // Hide explore name prefixes on column headers by default in AI artifacts
        showTableNames: false,
    },
});
