import {
    CartesianChartDataModel,
    ChartKind,
    PieChartDataModel,
} from '@lightdash/common';
import { type ResultsRunner } from './ResultsRunner';

const getChartResultOptions = (
    resultsRunner: ResultsRunner,
    chartType: ChartKind,
) => {
    switch (chartType) {
        case ChartKind.PIE:
            const pieChartDataModel = new PieChartDataModel({ resultsRunner });

            return {
                type: chartType,
                options: pieChartDataModel.getResultOptions(),
            } as const;
        case ChartKind.TABLE:
            throw new Error('Table chart type not implemented!!!!!!!!!!!!');
        case ChartKind.VERTICAL_BAR:
        case ChartKind.LINE:
            const cartesianChartDataModel = new CartesianChartDataModel({
                resultsRunner,
            });

            return {
                type: chartType,
                options: cartesianChartDataModel.getResultOptions(),
            } as const;
        default:
            throw new Error(`Not implemented for chart type: ${chartType}`);
    }
};

export default getChartResultOptions;
