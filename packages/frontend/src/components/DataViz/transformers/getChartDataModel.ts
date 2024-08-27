import {
    CartesianChartDataModel,
    ChartKind,
    PieChartDataModel,
} from '@lightdash/common';
import { type ResultsRunner } from './ResultsRunner';

const getChartDataModel = (
    resultsRunner: ResultsRunner,
    chartType: ChartKind,
) => {
    switch (chartType) {
        case ChartKind.PIE:
            return new PieChartDataModel({ resultsRunner });
        case ChartKind.TABLE:
            throw new Error('Table chart type not implemented!!!!!!!!!!!!');
        case ChartKind.VERTICAL_BAR:
        case ChartKind.LINE:
            return new CartesianChartDataModel({ resultsRunner });
        default:
            throw new Error(`Not implemented for chart type: ${chartType}`);
    }
};

export default getChartDataModel;
