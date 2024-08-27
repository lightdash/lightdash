import {
    CartesianChartDataTransformer,
    ChartKind,
    PieChartDataTransformer,
} from '@lightdash/common';
import { type ResultsTransformer } from './ResultsTransformer';

const getChartTransformer = (
    transformer: ResultsTransformer,
    chartType: ChartKind,
) => {
    switch (chartType) {
        case ChartKind.PIE:
            return new PieChartDataTransformer({ transformer });
        case ChartKind.TABLE:
            throw new Error('Table chart type not implemented!!!!!!!!!!!!');
        case ChartKind.VERTICAL_BAR:
        case ChartKind.LINE:
            return new CartesianChartDataTransformer({ transformer });
        default:
            throw new Error(`Not implemented for chart type: ${chartType}`);
    }
};

export default getChartTransformer;
