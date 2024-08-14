import { friendlyName } from '../types/field';
import { ChartKind, ECHARTS_DEFAULT_COLORS } from '../types/savedCharts';
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

    private colorMap: Map<string, string>;

    constructor(args: {
        transformer: ResultsRunnerBase<TCartesianChartLayout, TPieChartConfig>;
    }) {
        this.transformer = args.transformer;

        this.colorMap = new Map();
    }

    private getSeriesColor(
        seriesIdentifier: string,
        possibleXAxisValues: string[] | undefined,
    ): string | undefined {
        // Go through the possibleXAxisValues and check if the seriesIdentifier is in the value - "completed_sum(order_id)" is the identifier and "completed" is one of the possible values
        const foundValue = possibleXAxisValues?.find((value) =>
            seriesIdentifier.startsWith(value),
        );
        if (!foundValue) {
            return undefined;
        }

        // Remove foundValue from the seriesIdentifier - "completed_sum(order_id)" becomes "sum(order_id)"
        const genericIdentifier = seriesIdentifier.replace(
            `${foundValue}_`,
            '',
        );

        if (genericIdentifier && !this.colorMap.has(genericIdentifier)) {
            // This code assigns a color to a series in the chart
            const color =
                // TODO: Update this to support the organization color palette
                ECHARTS_DEFAULT_COLORS[
                    this.colorMap.size % ECHARTS_DEFAULT_COLORS.length // This ensures we cycle through the colors if we have more series than colors
                ];
            this.colorMap.set(genericIdentifier, color);
        }
        return this.colorMap.get(genericIdentifier)!;
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

        const possibleXAxisValues = transformedData?.results.map(
            (row) => `${row[transformedData?.indexColumn.reference]}`,
        );

        return {
            tooltip: {},
            legend: {
                show: true,
                type: 'scroll',
            },
            xAxis: {
                type:
                    display?.xAxis?.type ||
                    transformedData?.indexColumn.type ||
                    DEFAULT_X_AXIS_TYPE,
                name:
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
                color: this.getSeriesColor(seriesColumn, possibleXAxisValues),
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
