import {
    CartesianChartDataModel,
    ChartKind,
    isVizBarChartConfig,
    isVizLineChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
    PieChartDataModel,
    TableDataModel,
    type VizChartConfig,
} from '@lightdash/common';
import { type ResultsRunner } from './ResultsRunner';

const getChartConfigAndOptions = (
    resultsRunner: ResultsRunner,
    chartType: ChartKind,
    currentVizConfig?: VizChartConfig,
) => {
    switch (chartType) {
        case ChartKind.PIE:
            const pieChartDataModel = new PieChartDataModel({ resultsRunner });

            if (!isVizPieChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for pie chart');
            }

            return {
                type: chartType,
                options: pieChartDataModel.getResultOptions(),
                config: pieChartDataModel.mergeConfig(
                    chartType,
                    currentVizConfig,
                ),
            } as const;
        case ChartKind.TABLE:
            if (!isVizTableConfig(currentVizConfig)) {
                throw new Error('Invalid config for table');
            }

            const tableChartDataModel = new TableDataModel({ resultsRunner });
            return {
                type: chartType,
                options: tableChartDataModel.getResultOptions(),
                config: tableChartDataModel.mergeConfig(
                    chartType,
                    currentVizConfig,
                ),
            } as const;
        case ChartKind.VERTICAL_BAR:
            if (!isVizBarChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for bar chart');
            }

            const barChartModel = new CartesianChartDataModel({
                resultsRunner,
            });

            return {
                type: chartType,
                options: barChartModel.getResultOptions(),
                config: barChartModel.mergeConfig(chartType, currentVizConfig),
            } as const;

        case ChartKind.LINE:
            if (!isVizLineChartConfig(currentVizConfig)) {
                throw new Error('Invalid config for line chart');
            }

            const lineChartModel = new CartesianChartDataModel({
                resultsRunner,
            });

            return {
                type: chartType,
                options: lineChartModel.getResultOptions(),
                config: lineChartModel.mergeConfig(chartType, currentVizConfig),
            } as const;
        default:
            throw new Error(`Not implemented for chart type: ${chartType}`);
    }
};

export default getChartConfigAndOptions;
