import {
    BarChartDataTransformer2,
    SqlRunnerResultsTransformer2,
    type BarChartStyling,
    type ResultRow,
    type RowData,
    type SqlColumn,
    type SqlTransformBarChartConfig,
} from '@lightdash/common';
import { duckDBFE } from './duckDBQuery';

const convertToRowData = (data: ResultRow[]): RowData[] => {
    return data.map((row) => {
        return Object.fromEntries(
            Object.entries(row).map(([key, value]) => {
                return [key, value.value.raw];
            }),
        );
    });
};

// DEMO
const useBarChart = async (
    rows: RowData[],
    columns: SqlColumn[],
    config: SqlTransformBarChartConfig,
    styling: BarChartStyling,
) => {
    const transformer = new SqlRunnerResultsTransformer2({
        rows,
        columns,
        duckDBSqlFunction: duckDBFE,
    });
    const barChart = new BarChartDataTransformer2({
        transformer,
    });
    return {
        chartData: await barChart.getEchartsSpec(styling, config),
    };
};
