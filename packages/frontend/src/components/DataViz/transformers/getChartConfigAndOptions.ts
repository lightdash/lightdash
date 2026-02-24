import {
    CartesianChartDataModel,
    ChartKind,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
    PieChartDataModel,
    TableDataModel,
    type AllVizChartConfig,
    type IResultsRunner,
} from '@lightdash/common';

export const getChartConfigAndOptions = (
    resultsRunner: IResultsRunner,
    chartType: ChartKind,
    currentVizConfig?: AllVizChartConfig,
) => {
    switch (chartType) {
        case ChartKind.PIE:
            if (currentVizConfig && !isVizPieChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for pie chart');
            }

            const pieChartDataModel = new PieChartDataModel({
                resultsRunner,
            });

            const pieConfig = pieChartDataModel.mergeConfig(
                chartType,
                currentVizConfig,
            );

            return {
                type: chartType,
                options: pieChartDataModel.getResultOptions(),
                config: pieConfig,
                errors: pieChartDataModel.getConfigErrors(
                    currentVizConfig?.fieldConfig,
                ),
            } as const;
        case ChartKind.TABLE:
            if (currentVizConfig && !isVizTableConfig(currentVizConfig)) {
                throw new Error('Invalid config for table');
            }

            const tableChartDataModel = new TableDataModel({
                resultsRunner,
                columnsConfig: currentVizConfig?.columns,
            });
            return {
                type: chartType,
                options: tableChartDataModel.getResultOptions(),
                config: tableChartDataModel.mergeConfig(chartType),
                errors: undefined, // TODO: Implement error tracking for table viz
            } as const;
        case ChartKind.VERTICAL_BAR:
            if (currentVizConfig && !isVizBarChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for bar chart');
            }

            const barChartModel = new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: currentVizConfig?.fieldConfig,
                type: chartType,
            });

            const barConfig = barChartModel.mergeConfig(
                chartType,
                currentVizConfig,
            );

            return {
                type: chartType,
                options: barChartModel.getChartOptions(),
                config: barConfig,
                errors: barChartModel.getConfigErrors(
                    currentVizConfig?.fieldConfig,
                ),
            } as const;

        case ChartKind.LINE:
            if (currentVizConfig && !isVizLineChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for line chart');
            }

            const lineChartModel = new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: currentVizConfig?.fieldConfig,
                type: chartType,
            });

            const lineConfig = lineChartModel.mergeConfig(
                chartType,
                currentVizConfig,
            );

            return {
                type: chartType,
                options: lineChartModel.getChartOptions(),
                config: lineConfig,
                errors: lineChartModel.getConfigErrors(
                    currentVizConfig?.fieldConfig,
                ),
            } as const;
        default:
            throw new Error(`Not implemented for chart type: ${chartType}`);
    }
};
