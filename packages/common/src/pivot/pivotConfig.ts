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
): PivotConfig | undefined => {
    if (!pivotConfig || pivotConfig.columns.length === 0) {
        return undefined;
    }

    return {
        pivotDimensions: pivotConfig.columns,
        metricsAsRows: false,
    };
};

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

export const getDownloadPivotConfig = (
    savedChart: Pick<
        CreateSavedChartVersion,
        'chartConfig' | 'pivotConfig' | 'tableConfig'
    >,
    exportPivotedData: boolean = true,
): PivotConfig | undefined => {
    switch (savedChart.chartConfig.type) {
        case ChartType.TABLE:
            return getPivotConfig(savedChart);
        case ChartType.CARTESIAN:
            return exportPivotedData ? getPivotConfig(savedChart) : undefined;
        default:
            return undefined;
    }
};

export const getDownloadPivotOptions = (
    savedChart: Pick<
        CreateSavedChartVersion,
        'chartConfig' | 'pivotConfig' | 'tableConfig'
    >,
    exportPivotedData: boolean = true,
): { pivotConfig: PivotConfig | undefined; exportPivotedData: boolean } => ({
    pivotConfig: getDownloadPivotConfig(savedChart, exportPivotedData),
    exportPivotedData:
        savedChart.chartConfig.type === ChartType.CARTESIAN
            ? exportPivotedData
            : true,
});
