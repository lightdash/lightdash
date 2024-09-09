import {
    CartesianChartDataModel,
    ChartKind,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
    PieChartDataModel,
    TableDataModel,
    type IResultsRunner,
    type VizChartConfig,
    type VizChartLayout,
} from '@lightdash/common';

const getChartConfigAndOptions = (
    resultsRunner: IResultsRunner<VizChartLayout>,
    chartType: ChartKind,
    currentVizConfig?: VizChartConfig,
) => {
    switch (chartType) {
        case ChartKind.PIE:
            if (currentVizConfig && !isVizPieChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for pie chart');
            }

            const pieChartDataModel = new PieChartDataModel({
                resultsRunner,
                fieldConfig: currentVizConfig?.fieldConfig,
            });

            return {
                type: chartType,
                options: pieChartDataModel.getResultOptions(),
                config: pieChartDataModel.mergeConfig(
                    chartType,
                    currentVizConfig?.display,
                ),
            } as const;
        case ChartKind.TABLE:
            if (currentVizConfig && !isVizTableConfig(currentVizConfig)) {
                throw new Error('Invalid config for table');
            }

            const tableChartDataModel = new TableDataModel({
                resultsRunner,
                config: currentVizConfig,
            });
            return {
                type: chartType,
                options: tableChartDataModel.getResultOptions(),
                config: tableChartDataModel.mergeConfig(chartType),
            } as const;
        case ChartKind.VERTICAL_BAR:
            if (currentVizConfig && !isVizBarChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for bar chart');
            }

            const barChartModel = new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: currentVizConfig?.fieldConfig,
            });

            return {
                type: chartType,
                options: barChartModel.getResultOptions(),
                config: barChartModel.mergeConfig(
                    chartType,
                    currentVizConfig?.display,
                ),
            } as const;

        case ChartKind.LINE:
            if (currentVizConfig && !isVizLineChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for line chart');
            }

            const lineChartModel = new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: currentVizConfig?.fieldConfig,
            });

            return {
                type: chartType,
                options: lineChartModel.getResultOptions(),
                config: lineChartModel.mergeConfig(
                    chartType,
                    currentVizConfig?.display,
                ),
            } as const;
        default:
            throw new Error(`Not implemented for chart type: ${chartType}`);
    }
};

export default getChartConfigAndOptions;
