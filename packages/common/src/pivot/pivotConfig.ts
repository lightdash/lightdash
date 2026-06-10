/**
 * Functions for working with PivotConfig
 */
import type { MetricQuery } from '../types/metricQuery';
import type { PivotConfig } from '../types/pivot';
import {
    ChartType,
    getHiddenTableFields,
    type CreateSavedChartVersion,
    type TableChartConfig,
} from '../types/savedCharts';

/**
 * Split all hidden field IDs from a table chart config into dimension and metric
 * buckets. The `dimensionFieldIds` set is derived from the metricQuery so we can
 * classify each hidden field without needing a full ItemsMap.
 *
 * Fields that appear in metricQuery.dimensions are treated as dimensions; all
 * others (metrics, table calculations, pivot dims, etc.) are treated as metrics
 * for the purpose of the hidden-field filter in convertSqlPivotedRowsToPivotData.
 */
function splitHiddenTableFieldsByKind(
    tableChartConfig: TableChartConfig,
    metricQuery: Pick<MetricQuery, 'dimensions'>,
): { hiddenDimensions: string[]; hiddenMetrics: string[] } {
    const allHidden = getHiddenTableFields(tableChartConfig);
    const dimensionSet = new Set(metricQuery.dimensions);
    const hiddenDimensions: string[] = [];
    const hiddenMetrics: string[] = [];
    for (const fieldId of allHidden) {
        if (dimensionSet.has(fieldId)) {
            hiddenDimensions.push(fieldId);
        } else {
            hiddenMetrics.push(fieldId);
        }
    }
    return { hiddenDimensions, hiddenMetrics };
}

const getTablePivotConfig = (
    tableChartConfig: TableChartConfig,
    pivotConfig: CreateSavedChartVersion['pivotConfig'],
    tableConfig: CreateSavedChartVersion['tableConfig'],
    metricQuery?: Pick<MetricQuery, 'dimensions'>,
): PivotConfig | undefined => {
    if (!pivotConfig || pivotConfig.columns.length === 0) {
        return undefined;
    }

    if (metricQuery) {
        const { hiddenDimensions, hiddenMetrics } =
            splitHiddenTableFieldsByKind(tableChartConfig, metricQuery);
        return {
            pivotDimensions: pivotConfig.columns,
            metricsAsRows: tableChartConfig.config?.metricsAsRows ?? false,
            ...(hiddenMetrics.length > 0 && {
                hiddenMetricFieldIds: hiddenMetrics,
            }),
            ...(hiddenDimensions.length > 0 && {
                hiddenDimensionFieldIds: hiddenDimensions,
            }),
            columnOrder: tableConfig.columnOrder,
            rowTotals: tableChartConfig.config?.showRowCalculation ?? false,
            columnTotals:
                tableChartConfig.config?.showColumnCalculation ?? false,
        };
    }

    // Fallback: no metricQuery available — put all hidden fields in hiddenMetricFieldIds
    // for backward compatibility (previous behaviour).
    return {
        pivotDimensions: pivotConfig.columns,
        metricsAsRows: tableChartConfig.config?.metricsAsRows ?? false,
        hiddenMetricFieldIds: getHiddenTableFields(tableChartConfig),
        columnOrder: tableConfig.columnOrder,
        rowTotals: tableChartConfig.config?.showRowCalculation ?? false,
        columnTotals: tableChartConfig.config?.showColumnCalculation ?? false,
    };
};

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
    > & { metricQuery?: Pick<MetricQuery, 'dimensions'> },
): PivotConfig | undefined => {
    switch (savedChart.chartConfig.type) {
        case ChartType.TABLE:
            return getTablePivotConfig(
                savedChart.chartConfig,
                savedChart.pivotConfig,
                savedChart.tableConfig,
                savedChart.metricQuery,
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
    > & { metricQuery?: Pick<MetricQuery, 'dimensions'> },
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
    > & { metricQuery?: Pick<MetricQuery, 'dimensions'> },
    exportPivotedData: boolean = true,
): { pivotConfig: PivotConfig | undefined; exportPivotedData: boolean } => ({
    pivotConfig: getDownloadPivotConfig(savedChart, exportPivotedData),
    exportPivotedData:
        savedChart.chartConfig.type === ChartType.CARTESIAN
            ? exportPivotedData
            : true,
});
