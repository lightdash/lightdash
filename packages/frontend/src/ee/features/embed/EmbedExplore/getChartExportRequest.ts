import {
    getConditionalFormattingsFromChartConfig,
    getCustomLabelsFromTableConfig,
    getDownloadPivotOptions,
    getHiddenTableFields,
    getShowColumnTotalsFromChartConfig,
    isTableChartConfig,
    type CreateSavedChartVersion,
} from '@lightdash/common';
import { type ChartExportRequest } from '../events/types';

/** Download options as scheduled chart deliveries build them, plus table names */
export const getChartExportRequest = (
    chart: CreateSavedChartVersion,
    queryUuid: string | null,
): ChartExportRequest => {
    const { config } = chart.chartConfig;
    const { pivotConfig, exportPivotedData } = getDownloadPivotOptions(chart);
    const customLabels = getCustomLabelsFromTableConfig(config);
    const conditionalFormattings =
        getConditionalFormattingsFromChartConfig(config);
    const showColumnTotals = getShowColumnTotalsFromChartConfig(config);
    const showTableNames =
        config && isTableChartConfig(config)
            ? config.showTableNames
            : undefined;
    return {
        queryUuid,
        columnOrder: chart.tableConfig.columnOrder,
        hiddenFields: getHiddenTableFields(chart.chartConfig),
        exportPivotedData,
        ...(pivotConfig && { pivotConfig }),
        ...(customLabels && { customLabels }),
        ...(conditionalFormattings && { conditionalFormattings }),
        ...(showColumnTotals !== undefined && { showColumnTotals }),
        ...(showTableNames !== undefined && { showTableNames }),
    };
};
