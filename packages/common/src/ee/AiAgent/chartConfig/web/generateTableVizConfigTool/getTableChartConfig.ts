import {
    ChartType,
    type TableChartConfig,
} from '../../../../../types/savedCharts';

export const getTableChartConfig = (): TableChartConfig => ({
    type: ChartType.TABLE,
    // Hide explore name prefixes in column headers by default
    config: {
        showTableNames: false,
    },
});
