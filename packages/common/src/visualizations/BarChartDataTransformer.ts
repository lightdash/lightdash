import { friendlyName } from '../types/field';
import { type ResultsTransformerBase } from './ResultsTransformerBase';
import { type BarChartDisplay } from './SqlRunnerResultsTransformer';

export class BarChartDataTransformer<TBarChartLayout> {
    private readonly transformer: ResultsTransformerBase<TBarChartLayout>;

    constructor(args: {
        transformer: ResultsTransformerBase<TBarChartLayout>;
    }) {
        this.transformer = args.transformer;
    }

    async getEchartsSpec(
        fieldConfig: TBarChartLayout | undefined,
        display: BarChartDisplay | undefined,
    ) {
        const transformedData = fieldConfig
            ? await this.transformer.transformBarChartData(fieldConfig)
            : undefined;

        return {
            tooltip: {},
            legend: {
                show: true,
                type: 'scroll',
            },
            xAxis: {
                name: display?.xAxis?.label || '',
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: [
                {
                    type: 'value',
                    // TODO: Add this to transformer
                    name:
                        (display?.yAxis && display.yAxis[0].label) ||
                        friendlyName(
                            transformedData?.seriesColumns.length === 1
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
                source: transformedData?.results,
            },
            series: transformedData?.seriesColumns.map((seriesColumn) => ({
                dimensions: [transformedData.xAxisColumn, seriesColumn],
                type: 'bar',
                name:
                    (display?.series && display.series[seriesColumn]?.label) ||
                    friendlyName(seriesColumn),
                encode: {
                    x: transformedData.xAxisColumn,
                    y: seriesColumn,
                },
                yAxisIndex:
                    (display?.series &&
                        display.series[seriesColumn]?.yAxisIndex) ||
                    0,
            })),
        };
    }
}
