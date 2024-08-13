import { friendlyName } from '../types/field';
import { ChartKind } from '../types/savedCharts';
import {
    isCartesianChartSQLConfig,
    type SqlRunnerChartConfig,
} from '../types/sqlRunner';
import { type ResultsRunnerBase } from './ResultsRunnerBase';
import { type IndexType } from './SqlResultsRunner';

export class CartesianChartDataTransformer<
    TCartesianChartLayout,
    TPieChartConfig,
> {
    private readonly transformer: ResultsRunnerBase<
        TCartesianChartLayout,
        TPieChartConfig
    >;

    constructor(args: {
        transformer: ResultsRunnerBase<TCartesianChartLayout, TPieChartConfig>;
    }) {
        this.transformer = args.transformer;
    }

    async getEchartsSpec(config: SqlRunnerChartConfig) {
        if (!isCartesianChartSQLConfig(config)) {
            return {};
        }

        const { fieldConfig, display, type } = config;

        const transformedData = fieldConfig
            ? await this.transformer.getPivotChartData(
                  fieldConfig as TCartesianChartLayout,
              )
            : undefined;

        const DEFAULT_X_AXIS_TYPE = 'category';

        const defaultSeriesType =
            type === ChartKind.VERTICAL_BAR ? 'bar' : 'line';

        const shouldStack = display?.stack === true;

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
                    transformedData?.indexColumn.type ||
                    DEFAULT_X_AXIS_TYPE,
                name:
                    // TODO: display should always be defined and defaults should be applied in the transformer
                    display?.xAxis?.label ||
                    friendlyName(
                        transformedData?.indexColumn.reference || 'xAxisColumn',
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
                        (display?.yAxis && display.yAxis[0]?.label) ||
                        friendlyName(
                            transformedData?.valuesColumns.length === 1
                                ? transformedData.valuesColumns[0]
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
            series: transformedData?.valuesColumns.map((seriesColumn) => ({
                dimensions: [
                    transformedData?.indexColumn.reference,
                    seriesColumn,
                ],
                type: defaultSeriesType,
                stack: shouldStack ? 'stack-all-series' : undefined, // TODO: we should implement more sophisticated stacking logic once we have multi-pivoted charts
                name:
                    (display?.series && display.series[seriesColumn]?.label) ||
                    friendlyName(seriesColumn),
                encode: {
                    x: transformedData?.indexColumn.reference,
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

export type CartesianChartDisplay = {
    xAxis?: {
        label?: string;
        type: IndexType;
    };
    yAxis?: {
        label?: string;
        position?: string;
    }[];
    series?: Record<string, { label?: string; yAxisIndex?: number }>;
    legend?: {
        position: 'top' | 'bottom' | 'left' | 'right';
        align: 'start' | 'center' | 'end';
    };
    stack?: boolean;
};
