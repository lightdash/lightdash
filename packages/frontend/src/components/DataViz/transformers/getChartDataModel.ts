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
    type Organization,
    type VizChartConfig,
} from '@lightdash/common';

const getChartDataModel = (
    resultsRunner: IResultsRunner,
    config?: VizChartConfig,
    organization?: Organization,
) => {
    if (!config || !organization) {
        throw new Error('No config provided');
    }

    switch (config.type) {
        case ChartKind.PIE:
            if (config && !isVizPieChartConfig(config)) {
                throw new Error('Invalid config for pie chart');
            }

            return new PieChartDataModel({ resultsRunner, config });
        case ChartKind.TABLE:
            if (config && !isVizTableConfig(config)) {
                throw new Error('Invalid config for table');
            }

            return new TableDataModel({ resultsRunner, config });
        case ChartKind.VERTICAL_BAR:
            if (config && !isVizBarChartConfig(config)) {
                throw new Error('Invalid config for bar chart');
            }

            return new CartesianChartDataModel({
                resultsRunner,
                config,
                organization,
            });

        case ChartKind.LINE:
            if (config && !isVizLineChartConfig(config)) {
                throw new Error('Invalid config for line chart');
            }

            return new CartesianChartDataModel({
                resultsRunner,
                config,
                organization,
            });
        default:
            throw new Error(`Not implemented for chart: ${config}`);
    }
};

export default getChartDataModel;
