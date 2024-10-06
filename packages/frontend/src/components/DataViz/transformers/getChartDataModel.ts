import {
    CartesianChartDataModel,
    ChartKind,
    isPivotChartLayout,
    PieChartDataModel,
    TableDataModel,
    type IResultsRunner,
    type PivotChartLayout,
    type VizColumnsConfig,
} from '@lightdash/common';

const getChartDataModel = (
    resultsRunner: IResultsRunner,
    fieldConfig: PivotChartLayout | VizColumnsConfig | undefined,
    type: ChartKind,
) => {
    if (!isPivotChartLayout(fieldConfig)) {
        return new TableDataModel({
            resultsRunner,
            columnsConfig: fieldConfig,
        });
    }

    switch (type) {
        case ChartKind.PIE:
            return new PieChartDataModel({
                resultsRunner,
                fieldConfig: fieldConfig,
            });

        case ChartKind.VERTICAL_BAR:
            return new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: fieldConfig,
                type: ChartKind.VERTICAL_BAR,
            });

        case ChartKind.LINE:
            return new CartesianChartDataModel({
                resultsRunner,
                fieldConfig: fieldConfig,
                type: ChartKind.LINE,
            });
        default:
            throw new Error(`Not implemented for chart: ${type}`);
    }
};

export default getChartDataModel;
