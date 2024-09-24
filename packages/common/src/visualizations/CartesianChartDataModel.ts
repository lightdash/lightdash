import {
    capitalize,
    CustomFormatType,
    Format,
    friendlyName,
} from '../types/field';
import {
    ChartKind,
    ECHARTS_DEFAULT_COLORS,
    getEChartsChartTypeFromChartKind,
} from '../types/savedCharts';
import { applyCustomFormat } from '../utils/formatting';
import {
    type VizCartesianChartConfig,
    type VizCartesianChartOptions,
    type VizChartLayout,
    type VizIndexType,
} from './types';
import { type IChartDataModel } from './types/IChartDataModel';
import { type IResultsRunner } from './types/IResultsRunner';

type CartesianChartKind = Extract<
    ChartKind,
    ChartKind.LINE | ChartKind.VERTICAL_BAR
>;

export class CartesianChartDataModel
    implements
        IChartDataModel<
            VizCartesianChartOptions,
            VizCartesianChartConfig,
            CartesianChartDisplay,
            CartesianChartKind
        >
{
    private readonly resultsRunner: IResultsRunner<VizChartLayout>;

    private readonly fieldConfig: VizCartesianChartConfig['fieldConfig'];

    private colorMap: Map<string, string>;

    constructor(args: {
        resultsRunner: IResultsRunner<VizChartLayout>;
        fieldConfig: VizCartesianChartConfig['fieldConfig'];
    }) {
        this.resultsRunner = args.resultsRunner;
        this.fieldConfig = args.fieldConfig;

        this.colorMap = new Map();
    }

    private getSeriesColor(
        seriesIdentifier: string,
        possibleXAxisValues: string[] | undefined,
        orgColors?: string[],
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
            const colorPalette = orgColors || ECHARTS_DEFAULT_COLORS;
            // This code assigns a color to a series in the chart
            const color =
                colorPalette[
                    this.colorMap.size % ECHARTS_DEFAULT_COLORS.length // This ensures we cycle through the colors if we have more series than colors
                ];
            this.colorMap.set(genericIdentifier, color);
        }
        return this.colorMap.get(genericIdentifier)!;
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
        display: CartesianChartDisplay | undefined,
    ): VizCartesianChartConfig {
        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: this.resultsRunner.mergePivotChartLayout(
                this.fieldConfig,
            ),
            display,
        };
    }

    getResultOptions() {
        return this.resultsRunner.pivotChartOptions();
    }

    getConfigErrors() {
        return this.resultsRunner.getPivotChartLayoutErrors(this.fieldConfig);
    }

    async getTransformedData(
        layout: VizChartLayout | undefined,
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
        transformedData: Awaited<ReturnType<typeof this.getTransformedData>>,
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
                const isSingleAxis = this.fieldConfig?.y.length === 1;
                const foundSeries = Object.values(display?.series || {}).find(
                    (s) => s.yAxisIndex === index,
                );
                const {
                    format,
                    color,
                    label,
                    type: seriesChartType,
                } = foundSeries || {};

                const singleYAxisLabel =
                    // NOTE: When there's only one y-axis left, set the label on the series as well
                    isSingleAxis && display?.yAxis?.[0]?.label
                        ? display.yAxis[0].label
                        : undefined;
                const singleYAxisFormat =
                    // NOTE: When there's only one y-axis left, set the format on the series as well
                    isSingleAxis && display?.yAxis?.[0]?.format
                        ? display.yAxis[0].format
                        : undefined;

                return {
                    dimensions: [
                        transformedData.indexColumn?.reference,
                        seriesColumn,
                    ],
                    type:
                        seriesChartType && !isSingleAxis
                            ? getEChartsChartTypeFromChartKind(seriesChartType)
                            : defaultSeriesType,
                    stack: shouldStack ? 'stack-all-series' : undefined, // TODO: we should implement more sophisticated stacking logic once we have multi-pivoted charts
                    name:
                        singleYAxisLabel ||
                        label ||
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
                        valueFormatter:
                            singleYAxisFormat || format
                                ? CartesianChartDataModel.getTooltipFormatter(
                                      singleYAxisFormat ?? format,
                                  )
                                : undefined,
                    },
                    color:
                        color ||
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
            type?: ChartKind.LINE | ChartKind.VERTICAL_BAR;
        };
    };
    legend?: {
        position: 'top' | 'bottom' | 'left' | 'right';
        align: 'start' | 'center' | 'end';
    };
    stack?: boolean;
};
