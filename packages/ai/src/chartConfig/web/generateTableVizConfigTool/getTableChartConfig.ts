import { ChartType, type TableChartConfig } from '@lightdash/common';

export const getTableChartConfig = (): TableChartConfig => ({
    type: ChartType.TABLE,
});
