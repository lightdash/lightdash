/**
 * Functions for working with PivotConfig
 */
import type { PivotConfig } from '../types/pivot';
import {
    ChartType,
    getHiddenTableFields,
    isCartesianChartConfig,
    type CartesianChartConfig,
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
    chartConfig: CartesianChartConfig,
    pivotConfig: CreateSavedChartVersion['pivotConfig'],
): PivotConfig | undefined => {
    if (!pivotConfig || pivotConfig.columns.length === 0) {
        return undefined;
    }

    const result: PivotConfig = {
        pivotDimensions: pivotConfig.columns,
        metricsAsRows: false,
    };

    // When sort-only metrics are injected into valuesColumns (PROD-6906),
    // they would bleed into exports/UI. Set visibleMetricFieldIds to the
    // chart's yField so only displayed metrics appear in pivot output.
    if (isCartesianChartConfig(chartConfig.config)) {
        const { yField } = chartConfig.config.layout;
        if (yField && yField.length > 0) {
            result.visibleMetricFieldIds = yField;
        }
    }

    return result;
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
            return getCartesianPivotConfig(
                savedChart.chartConfig,
                savedChart.pivotConfig,
            );
        default:
            return undefined;
    }
};
