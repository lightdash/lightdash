/**
 * Functions for working with PivotConfig
 */
import type { PivotConfig } from '../types/pivot';
import {
    ChartType,
    getHiddenTableFields,
    type CreateSavedChartVersion,
    type TableChartConfig,
} from '../types/savedCharts';

const getTablePivotConfig = (
    tableChartConfig: TableChartConfig,
    pivotConfig: CreateSavedChartVersion['pivotConfig'],
    tableConfig: CreateSavedChartVersion['tableConfig'],
): PivotConfig | undefined =>
    pivotConfig && pivotConfig.columns.length > 0
        ? {
              pivotDimensions: pivotConfig.columns,
              metricsAsRows: tableChartConfig.config?.metricsAsRows ?? false,
              hiddenMetricFieldIds: getHiddenTableFields(tableChartConfig),
              columnOrder: tableConfig.columnOrder,
              rowTotals: tableChartConfig.config?.showRowCalculation ?? false,
              columnTotals:
                  tableChartConfig.config?.showColumnCalculation ?? false,
          }
        : undefined;

const getCartesianPivotConfig = (
    pivotConfig: CreateSavedChartVersion['pivotConfig'],
): PivotConfig | undefined =>
    pivotConfig && pivotConfig.columns.length > 0
        ? {
              pivotDimensions: pivotConfig.columns,
              metricsAsRows: false,
          }
        : undefined;

export const getPivotConfig = (
    savedChart: Pick<
        CreateSavedChartVersion,
        'chartConfig' | 'pivotConfig' | 'tableConfig'
    >,
): PivotConfig | undefined => {
    switch (savedChart.chartConfig.type) {
        case ChartType.TABLE:
            return getTablePivotConfig(
                savedChart.chartConfig,
                savedChart.pivotConfig,
                savedChart.tableConfig,
            );
        case ChartType.CARTESIAN:
            return getCartesianPivotConfig(savedChart.pivotConfig);
        default:
            return undefined;
    }
};
