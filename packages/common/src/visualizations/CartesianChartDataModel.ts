import { intersectionBy } from 'lodash';
import {
    capitalize,
    CustomFormatType,
    DimensionType,
    Format,
    friendlyName,
} from '../types/field';
import { ChartKind, ECHARTS_DEFAULT_COLORS } from '../types/savedCharts';
import { type SemanticLayerQuery } from '../types/semanticLayer';
import { applyCustomFormat } from '../utils/formatting';
import {
    VizAggregationOptions,
    VizIndexType,
    type PivotChartData,
    type VizCartesianChartConfig,
    type VizCartesianChartOptions,
} from './types';
import {
    type IResultsRunner,
    type PivotChartLayout,
} from './types/IResultsRunner';

type CartesianChartKind = Extract<
    ChartKind,
    ChartKind.LINE | ChartKind.VERTICAL_BAR
>;

export class CartesianChartDataModel {
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
        existingLayout: PivotChartLayout | undefined,
        display: CartesianChartDisplay | undefined,
    ): VizCartesianChartConfig {
        const newDefaultLayout = this.getDefaultLayout();

        const someFieldsMatch =
            existingLayout?.x?.reference === newDefaultLayout?.x?.reference ||
            intersectionBy(
                existingLayout?.y || [],
                newDefaultLayout?.y || [],
                'reference',
            ).length > 0;

        let mergedLayout: PivotChartLayout | undefined = existingLayout;

        if (!existingLayout || !someFieldsMatch) {
            mergedLayout = newDefaultLayout;
        }
        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: mergedLayout,
            display,
        };
    }

    getChartOptions(): VizCartesianChartOptions {
        return {
            indexLayoutOptions: this.resultsRunner.getPivotQueryDimensions(),
            valuesLayoutOptions: {
                preAggregated: this.resultsRunner.getPivotQueryMetrics(),
                customAggregations:
                    this.resultsRunner.getPivotQueryCustomMetrics(),
            },
            pivotLayoutOptions: this.resultsRunner.getPivotQueryDimensions(),
        };
    }

    getDefaultLayout(): PivotChartLayout | undefined {
        const dimensions = this.resultsRunner.getPivotQueryDimensions();
        const metrics = this.resultsRunner.getPivotQueryMetrics();

        // TODO: the types could be cleaned up here to have fewer 'in' checks.
        const categoricalColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                column.dimensionType === DimensionType.STRING,
        );
        const booleanColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                column.dimensionType === DimensionType.BOOLEAN,
        );
        const dateColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    column.dimensionType,
                ),
        );
        const numericColumns = [...dimensions, ...metrics].filter(
            (column) =>
                'dimensionType' in column &&
                column.dimensionType === DimensionType.NUMBER,
        );

        const xColumn =
            categoricalColumns[0] ||
            booleanColumns[0] ||
            dateColumns[0] ||
            numericColumns[0] ||
            dimensions[0];

        if (xColumn === undefined) {
            return undefined;
        }
        const x = {
            reference: xColumn.reference,
            axisType:
                'axisType' in xColumn
                    ? xColumn.axisType
                    : VizIndexType.CATEGORY,
            dimensionType:
                'dimensionType' in xColumn
                    ? xColumn.dimensionType
                    : DimensionType.STRING,
        };

        const yColumn =
            numericColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            booleanColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            categoricalColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            metrics[0];

        if (yColumn === undefined) {
            return undefined;
        }

        const y = [
            {
                reference: yColumn.reference,
                aggregation:
                    'dimensionType' in yColumn &&
                    yColumn.dimensionType === DimensionType.NUMBER
                        ? VizAggregationOptions.SUM
                        : VizAggregationOptions.COUNT,
            },
        ];

        return {
            x,
            y,
            groupBy: [],
        };
    }

    async getTransformedData(query?: SemanticLayerQuery) {
        if (!query) {
            return undefined;
        }

        // MARSHALL REFACTOR: inline this with getEchartsSpec
        return this.resultsRunner.getPivotedVisualizationData(query);
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

    // eslint-disable-next-line class-methods-use-this
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
