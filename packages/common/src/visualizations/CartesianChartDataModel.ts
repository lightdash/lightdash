import {
    capitalize,
    CustomFormatType,
    Format,
    friendlyName,
} from '../types/field';
import { ChartKind, ECHARTS_DEFAULT_COLORS } from '../types/savedCharts';
import { applyCustomFormat } from '../utils/formatting';
import {
    type PivotChartData,
    type VizCartesianChartConfig,
    type VizIndexType,
} from './types';
import {
    type IResultsRunner,
    type PivotChartLayout,
} from './types/IResultsRunner';

type CartesianChartKind = Extract<
    ChartKind,
    ChartKind.LINE | ChartKind.VERTICAL_BAR
>;

export class CartesianChartDataModel<TLayout> {
    private readonly resultsRunner: IResultsRunner;

    constructor(args: { resultsRunner: IResultsRunner }) {
        this.resultsRunner = args.resultsRunner;
    }

    static getTooltipFormatter(format: Format | undefined) {
        if (format === Format.PERCENT) {
            return (value: number) =>
                applyCustomFormat(value, {
                    type: CustomFormatType.PERCENT,
                });
        }
        return undefined;
    }

    mergeConfig(
        chartKind: CartesianChartKind,
        config: PivotChartLayout,
        display: CartesianChartDisplay | undefined,
    ): VizCartesianChartConfig {
        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: this.resultsRunner.mergePivotChartLayout(config),
            display,
        };
    }

    getResultOptions() {
        return this.resultsRunner.pivotChartOptions();
    }

    async getTransformedData(
        layout: TLayout | undefined,
        sql?: string,
        projectUuid?: string,
        limit?: number,
        slug?: string,
        uuid?: string,
    ) {
        if (!layout) {
            return undefined;
        }

        return this.resultsRunner.getPivotedVisualizationData(
            layout,
            sql,
            projectUuid,
            limit,
            slug,
            uuid,
        );
    }

    static getDefaultColor(index: number, orgColors?: string[]) {
        const colorPalette = orgColors || ECHARTS_DEFAULT_COLORS;
        // This code assigns a color to a series in the chart
        const color =
            colorPalette[
                index % colorPalette.length // This ensures we cycle through the colors if we have more series than colors
            ];
        return color;
    }

    getEchartsSpec(
        transformedData: PivotChartData | undefined,
        display: CartesianChartDisplay | undefined,
        type: ChartKind,
        orgColors?: string[],
    ) {
        if (!transformedData) {
            return {};
        }

        const DEFAULT_X_AXIS_TYPE = 'category';

        const defaultSeriesType =
            type === ChartKind.VERTICAL_BAR ? 'bar' : 'line';

        const shouldStack = display?.stack === true;
        /*
        // For old colors method
        const possibleXAxisValues = transformedData.results.map((row) =>
            transformedData.indexColumn?.reference
                ? `${row[transformedData.indexColumn.reference]}`
                : '-',
        ); */

        const series = transformedData.valuesColumns.map(
            (seriesColumn, index) => {
                const seriesFormat = Object.values(display?.series || {}).find(
                    (s) => s.yAxisIndex === index,
                )?.format;

                const singleYAxisLabel =
                    // NOTE: When there's only one y-axis left, set the label on the series as well
                    transformedData.valuesColumns.length === 1 && // PR NOTE: slight change to behaviour, only set label if there's a single value column (post-pivot) we want this to be fields pre-pivot
                    display?.yAxis?.[0]?.label
                        ? display.yAxis[0].label
                        : undefined;
                const seriesLabel =
                    singleYAxisLabel ??
                    Object.values(display?.series || {}).find(
                        (s) => s.yAxisIndex === index,
                    )?.label;

                const seriesColor = Object.values(display?.series || {}).find(
                    (s) => s.yAxisIndex === index,
                )?.color;

                return {
                    dimensions: [
                        transformedData.indexColumn?.reference,
                        seriesColumn,
                    ],
                    type: defaultSeriesType,
                    stack: shouldStack ? 'stack-all-series' : undefined, // TODO: we should implement more sophisticated stacking logic once we have multi-pivoted charts
                    name:
                        seriesLabel ||
                        capitalize(seriesColumn.toLowerCase()).replaceAll(
                            '_',
                            ' ',
                        ), // similar to friendlyName, but this will preserve special characters
                    encode: {
                        x: transformedData.indexColumn?.reference,
                        y: seriesColumn,
                    },
                    yAxisIndex:
                        (display?.series &&
                            display.series[seriesColumn]?.yAxisIndex) ||
                        0,
                    tooltip: {
                        valueFormatter: seriesFormat
                            ? CartesianChartDataModel.getTooltipFormatter(
                                  seriesFormat,
                              )
                            : undefined,
                    },
                    color:
                        seriesColor ||
                        CartesianChartDataModel.getDefaultColor(
                            index,
                            orgColors,
                        ),
                    // this.getSeriesColor( seriesColumn, possibleXAxisValues, orgColors),
                };
            },
        );

        return {
            tooltip: {
                trigger: 'axis',
                appendToBody: true, // Similar to rendering a tooltip in a Portal
            },
            legend: {
                show: !!(transformedData.valuesColumns.length > 1),
                type: 'scroll',
            },
            xAxis: {
                type:
                    display?.xAxis?.type ||
                    transformedData.indexColumn?.type ||
                    DEFAULT_X_AXIS_TYPE,
                name:
                    display?.xAxis?.label ||
                    friendlyName(
                        transformedData.indexColumn?.reference || 'xAxisColumn',
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
                            transformedData.valuesColumns.length === 1
                                ? transformedData.valuesColumns[0]
                                : '',
                        ),
                    nameLocation: 'center',
                    nameGap: 50,
                    nameRotate: 90,
                    nameTextStyle: {
                        fontWeight: 'bold',
                    },
                    ...(display?.yAxis?.[0]?.format
                        ? {
                              axisLabel: {
                                  formatter:
                                      CartesianChartDataModel.getTooltipFormatter(
                                          display?.yAxis?.[0].format,
                                      ),
                              },
                          }
                        : {}),
                },
            ],
            dataset: {
                id: 'dataset',
                source: transformedData.results,
            },
            series,
        };
    }
}

export type CartesianChartDisplay = {
    xAxis?: {
        label?: string;
        type?: VizIndexType;
    };
    yAxis?: {
        label?: string;
        position?: string;
        format?: Format;
    }[];
    series?: {
        [key: string]: {
            label?: string;
            format?: Format;
            yAxisIndex?: number;
            color?: string;
        };
    };
    legend?: {
        position: 'top' | 'bottom' | 'left' | 'right';
        align: 'start' | 'center' | 'end';
    };
    stack?: boolean;
};
