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
        const { axesConfig, seriesConfig } = config;

        if (config.type !== 'barChart') return {};

        console.log({
            data,
            columns,
            axesConfig,
            seriesConfig,
        });

        const xField = columns[0];
        const yField = columns[1];

        return {
            title: {
                text: 'Moo',
            },
            tooltip: {},
            xAxis: {
                type: 'category',
                name: axesConfig?.x?.label ?? xField,
            },
            yAxis: {
                type: 'value',
                name: axesConfig.y[0].label ?? yField,
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
            series: seriesConfig.map(() => ({
                dimensions: [xField, yField],
                type: 'bar',
                encode: {
                    seriesName: axesConfig.y[0].reference ?? yField,
                    x: xField,
                    xRef: { field: xField },
                    y: yField,
                    yRef: { field: yField },
                },
            })),
        };
    }
}
