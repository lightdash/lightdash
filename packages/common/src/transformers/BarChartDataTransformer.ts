import { type BarChartConfig } from '../types/visualizations';
import { type SqlRunnerResultsTransformer } from './ResultTransformers';

// TODO: Should this just be ChartDataTransformer?
export class BarChartDataTransformer {
    private transformer: SqlRunnerResultsTransformer;

    constructor(args: { transformer: SqlRunnerResultsTransformer }) {
        this.transformer = args.transformer;
    }

    public getEchartsSpec(config: BarChartConfig) {
        const data = this.transformer.getRows();
        const columns = this.transformer.getColumns();
        const { axis, series } = config;

        console.log({
            data,
            columns,
            axis,
            series,
        });

        return {
            title: {
                text: 'Moo',
            },
            tooltip: {},
            xAxis: {
                type: 'category',
                name: axis.x.label,
            },
            yAxis: {
                type: 'value',
                name: axis.y[0].label,
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
            series: series.map((s) => ({
                dimensions: [axis.x.reference, s.reference],
                type: 'bar',
                encode: {
                    seriesName: s.reference,
                    x: axis.x.reference,
                    xRef: { field: axis.x.reference },
                    y: s.reference,
                    yRef: { field: s.reference },
                },
            })),
        };
    }
}
