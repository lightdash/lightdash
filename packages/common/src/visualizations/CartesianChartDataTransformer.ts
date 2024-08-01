import { friendlyName } from '../types/field';
import { ChartKind } from '../types/savedCharts';
import {
    isCartesianChartSQLConfig,
    type SqlRunnerChartConfig,
} from '../types/sqlRunner';
import { type ResultsTransformerBase } from './ResultsTransformerBase';

export class CartesianChartDataTransformer<
    TCartesianChartLayout,
    TPieChartConfig,
> {
    private readonly transformer: ResultsTransformerBase<
        TCartesianChartLayout,
        TPieChartConfig
    >;

    constructor(args: {
        transformer: ResultsTransformerBase<
            TCartesianChartLayout,
            TPieChartConfig
        >;
    }) {
        this.transformer = args.transformer;
    }

    async getEchartsSpec(config: SqlRunnerChartConfig) {
        if (!isCartesianChartSQLConfig(config)) {
            return {};
        }

        const { fieldConfig, display, type } = config;

        const transformedData = fieldConfig
            ? await this.transformer.transformCartesianChartData(
                  fieldConfig as TCartesianChartLayout,
              )
            : undefined;

        const DEFAULT_X_AXIS_TYPE = 'category';

        const defaultSeriesType =
            type === ChartKind.VERTICAL_BAR ? 'bar' : 'line';

        return {
            tooltip: {},
            legend: {
                show: true,
                type: 'scroll',
            },
            xAxis: {
                // TODO: display should always be defined and defaults should be applied in the transformer
                type:
                    display?.xAxis?.type ||
                    transformedData?.xAxisColumn.type ||
                    DEFAULT_X_AXIS_TYPE,
                name:
                    // TODO: display should always be defined and defaults should be applied in the transformer
                    display?.xAxis?.label ||
                    friendlyName(
                        transformedData?.xAxisColumn.reference || 'xAxisColumn',
                    ),
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: [
                {
                    type: 'value',
                    position: display?.yAxis?.[0]?.position || 'left',
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
                dimensions: [
                    transformedData.xAxisColumn.reference,
                    seriesColumn,
                ],
                type: defaultSeriesType,
                name:
                    (display?.series && display.series[seriesColumn]?.label) ||
                    friendlyName(seriesColumn),
                encode: {
                    x: transformedData.xAxisColumn.reference,
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
