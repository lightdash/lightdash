import { friendlyName } from '../types/field';
import { type ResultsTransformerBase } from './base';

export type BarChartStyling = {
    xAxis?: {
        label?: string;
        type: 'category' | 'time';
    };
    yAxis?: {
        label?: string;
    }[];
    series?: Record<string, { label?: string; yAxisIndex?: number }>;
};

export class BarChartDataTransformer2<BarChartConfig> {
    private readonly transformer: ResultsTransformerBase<BarChartConfig>;

    constructor(args: { transformer: ResultsTransformerBase<BarChartConfig> }) {
        this.transformer = args.transformer;
    }

    async getEchartsSpec(styling: BarChartStyling, config: BarChartConfig) {
        const transformedData = await this.transformer.transformBarChartData(
            config,
        );

        // Now draw the bar chart with styling, labels, etc.
        return {
            title: {
                text: 'Bar chart',
            },
            tooltip: {},
            legend: {
                show: true,
                type: 'scroll',
                selected: {},
            },
            xAxis: {
                type: styling.xAxis?.type || 'category',
                name: styling.xAxis?.label || '',
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: [
                {
                    type: 'value',
                    name:
                        (styling.yAxis && styling.yAxis[0].label) ||
                        friendlyName(
                            transformedData.seriesColumns.length === 1
                                ? transformedData.seriesColumns[0]
                                : '',
                        ),
                    nameLocation: 'center',
                    nameGap: 50,
                    nameRotate: 90,
                    nameTextStyle: {
                        fontWeight: 'bold',
                    },
                },
            ],
            dataset: {
                id: 'dataset',
                source: transformedData.results,
            },
            series: transformedData.seriesColumns.map((seriesColumn) => ({
                dimensions: [transformedData.xAxisColumn, seriesColumn],
                type: 'bar',
                name:
                    (styling.series && styling.series[seriesColumn]?.label) ||
                    friendlyName(seriesColumn),
                encode: {
                    x: transformedData.xAxisColumn,
                    y: seriesColumn,
                },
                yAxisIndex:
                    (styling.series &&
                        styling.series[seriesColumn]?.yAxisIndex) ||
                    0,
            })),
        };
    }
}
