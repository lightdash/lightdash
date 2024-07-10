import { type ResultRow } from '../types/results';
import { type BarChartConfig } from '../types/visualizations';
import { SqlRunnerResultsTransformer } from './ResultTransformers';

// TODO: Should this just be ChartDataTransformer?
export class BarChartDataTransformer {
    private transformer: SqlRunnerResultsTransformer;

    constructor(args: { data: ResultRow[] }) {
        this.transformer = new SqlRunnerResultsTransformer(args);
    }

    public getEchartsSpec(config: BarChartConfig) {
        const data = this.transformer.getRows();
        const columns = this.transformer.getColumns();
        const { axes } = config || { axes: undefined };

        const xField = columns[0];
        const yField = columns[1];

        return {
            title: {
                text: 'Bar chart',
            },
            tooltip: {},
            xAxis: {
                type: 'category',
                name: axes?.x?.label ?? xField,
            },
            yAxis: {
                type: 'value',
                name: axes?.y[0]?.label ?? yField,
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
            series: columns.slice(1).map((s) => ({
                dimensions: [xField, s],
                type: 'bar',
                encode: {
                    seriesName: axes?.y[0]?.reference ?? s,
                    x: xField,
                    xRef: { field: xField },
                    y: s,
                    yRef: { field: s },
                },
            })),
        };
    }
}
