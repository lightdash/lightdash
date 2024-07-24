import {
    SqlRunnerResultsTransformer,
    type BarChartConfig,
    type ResultRow,
} from '@lightdash/common';

// TODO: Should this just be ChartDataTransformer?
export class BarChartDataTransformer {
    private transformer: SqlRunnerResultsTransformer;

    constructor(args: { data: ResultRow[] }) {
        this.transformer = new SqlRunnerResultsTransformer(args);
    }

    public getEchartsSpec(config?: BarChartConfig) {
        const data = this.transformer.getRows();
        const columns = this.transformer.getColumns();
        const { axes, series } = config || { axes: undefined };

        const xField = axes?.x?.reference ?? columns[0];

        return {
            tooltip: {},
            legend: {
                show: true,
                type: 'scroll',
                selected: {},
            },
            xAxis: {
                type: 'category',
                name: axes?.x?.label ?? axes?.x.reference,
                nameLocation: 'center',
                nameGap: 30,

                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: {
                type: 'value',
                name: axes?.y[0]?.label ?? axes?.y[0].reference,
                nameLocation: 'center',
                nameGap: 50,
                nameRotate: 90,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            dataset: {
                id: 'dataset',
                source: data.map((row) => {
                    const newRow: {
                        [key: string]: string;
                    } = {};
                    columns.forEach((column) => {
                        newRow[column] = row[column].value.formatted;
                    });
                    return newRow;
                }),
            },
            series: series?.map((s) => ({
                dimensions: [xField, s.reference],
                type: 'bar',
                name: s.name,
                encode: {
                    seriesName: s.reference,
                    x: xField,
                    xRef: { field: xField },
                    y: s.reference,
                    yRef: { field: s.reference },
                },
            })),
        };
    }
}
