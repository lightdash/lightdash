import { friendlyName } from '../types/field';
import { type ResultsTransformerBase } from './ResultsTransformerBase';
import { type BarChartDisplay } from './SqlRunnerResultsTransformer';

export class BarChartDataTransformer<TBarChartLayout, TPieChartConfig> {
    private readonly transformer: ResultsTransformerBase<
        TBarChartLayout,
        TPieChartConfig
    >;

    constructor(args: {
        transformer: ResultsTransformerBase<TBarChartLayout, TPieChartConfig>;
    }) {
        this.transformer = args.transformer;
    }

    async getEchartsSpec(
        fieldConfig: TBarChartLayout | undefined,
        // TODO: display should always be defined and defaults should be applied in the transformer
        display: BarChartDisplay | undefined,
    ) {
        const transformedData = fieldConfig
            ? await this.transformer.transformBarChartData(fieldConfig)
            : undefined;

        const DEFAULT_X_AXIS_TYPE = 'category';

        return {
            tooltip: {},
            legend: {
                show: true,
                type: 'scroll',
            },
            xAxis: {
                // TODO: display should always be defined and defaults should be applied in the transformer
                type: display?.xAxis?.type ?? DEFAULT_X_AXIS_TYPE,
                name:
                    // TODO: display should always be defined and defaults should be applied in the transformer
                    display?.xAxis?.label ||
                    friendlyName(transformedData?.xAxisColumn || 'xAxisColumn'),
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: [
                {
                    // TODO: display should always be defined and defaults should be applied in the transformer
                    type: 'value',
                    name:
                        // TODO: display should always be defined and defaults should be applied in the transformer
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
