import intersectionBy from 'lodash/intersectionBy';
import { getFirstIndexColumns } from '../pivot/utils';
import { type AnyType } from '../types/any';
import {
    capitalize,
    CustomFormatType,
    DimensionType,
    Format,
    friendlyName,
} from '../types/field';
import { type Organization } from '../types/organization';
import { type RawResultRow } from '../types/results';
import {
    CartesianSeriesType,
    ChartKind,
    ECHARTS_DEFAULT_COLORS,
} from '../types/savedCharts';
import { type SqlRunnerQuery } from '../types/sqlRunner';
import { applyCustomFormat, formatNumberValue } from '../utils/formatting';
import {
    getAxisLabelStyle,
    getAxisLineStyle,
    getAxisPointerStyle,
    getAxisTickStyle,
    getAxisTitleStyle,
} from './helpers/styles/axisStyles';
import {
    applyRoundedCornersToSqlRunnerStackData,
    calculateDynamicBorderRadius,
    getBarBorderRadius,
    getBarStyle,
} from './helpers/styles/barChartStyles';
import {
    getBarChartGridStyle,
    getLineChartGridStyle,
} from './helpers/styles/gridStyles';
import { getLegendStyle } from './helpers/styles/legendStyles';
import { getTooltipStyle } from './helpers/styles/tooltipStyles';
import { getValueLabelStyle } from './helpers/styles/valueLabelStyles';
import {
    buildSqlRunnerCartesianTooltipFormatter,
    createStack100TooltipFormatter,
    transformToPercentageStacking,
} from './helpers/tooltipFormatter';
import {
    SortByDirection,
    StackType,
    VizAggregationOptions,
    VizIndexType,
    type AxisSide,
    type PivotChartData,
    type PivotChartLayout,
    type SqlRunnerEChartsSeries,
    type VizCartesianChartConfig,
    type VizCartesianChartOptions,
    type VizConfigErrors,
} from './types';
import { type IResultsRunner } from './types/IResultsRunner';

// Empty config as default. This makes sense to be defined by the DataModel,
// but is this the right place?
const defaultFieldConfig: PivotChartLayout = {
    x: {
        reference: 'x',
        type: VizIndexType.CATEGORY,
    },
    y: [
        {
            reference: 'y',
            aggregation: VizAggregationOptions.SUM,
        },
    ],
    groupBy: [],
};

type CartesianChartKind = Extract<
    ChartKind,
    ChartKind.LINE | ChartKind.VERTICAL_BAR
>;

export enum ValueLabelPositionOptions {
    HIDDEN = 'hidden',
    TOP = 'top',
    BOTTOM = 'bottom',
    LEFT = 'left',
    RIGHT = 'right',
    INSIDE = 'inside',
}

export class CartesianChartDataModel {
    private readonly resultsRunner: IResultsRunner;

    private readonly fieldConfig: PivotChartLayout;

    private readonly type: CartesianChartKind;

    private pivotedChartData: PivotChartData | undefined;

    constructor(args: {
        resultsRunner: IResultsRunner;
        fieldConfig?: PivotChartLayout;
        type?: CartesianChartKind;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.fieldConfig = args.fieldConfig ?? defaultFieldConfig;
        this.type = args.type ?? ChartKind.VERTICAL_BAR;
    }

    // Get the formatter for the tooltip, which has a simple callback signature
    static getTooltipFormatter(format: Format | undefined) {
        if (format === Format.PERCENT) {
            return (value: number) =>
                applyCustomFormat(value, {
                    type: CustomFormatType.PERCENT,
                });
        }
        return undefined;
    }

    // Get the formatter for the value label,
    // which has more complex inputs
    static getValueFormatter(
        format: Format | undefined,
        isStack100: boolean = false,
    ) {
        // For 100% stacked charts, always format as percentage
        // because all values are already converted to 0-100 range
        if (isStack100) {
            return (params: AnyType) => {
                const value =
                    params.value[params.dimensionNames[params.encode.y[0]]];
                return typeof value === 'number'
                    ? `${formatNumberValue(value, {
                          type: CustomFormatType.NUMBER,
                          round: 1,
                      })}%`
                    : `${value}%`;
            };
        }

        if (format === Format.PERCENT) {
            // Echarts doesn't export the types for this function
            return (params: AnyType) => {
                const value =
                    params.value[params.dimensionNames[params.encode.y[0]]];

                return applyCustomFormat(value, {
                    type: CustomFormatType.PERCENT,
                });
            };
        }
        return undefined;
    }

    mergeConfig(
        chartKind: CartesianChartKind,
        existingConfig: VizCartesianChartConfig | undefined,
    ): VizCartesianChartConfig {
        const newDefaultLayout = this.getDefaultLayout();

        const someFieldsMatch =
            existingConfig?.fieldConfig?.x?.reference ===
                newDefaultLayout?.x?.reference ||
            intersectionBy(
                existingConfig?.fieldConfig?.y || [],
                newDefaultLayout?.y || [],
                'reference',
            ).length > 0;

        let mergedLayout: PivotChartLayout | undefined =
            existingConfig?.fieldConfig;

        if (!existingConfig?.fieldConfig || !someFieldsMatch) {
            mergedLayout = newDefaultLayout;
        }
        return {
            metadata: {
                version: 1,
            },
            type: chartKind,
            fieldConfig: mergedLayout ?? existingConfig?.fieldConfig,
            display: existingConfig?.display ?? {},
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
            dateColumns[0] ||
            categoricalColumns[0] ||
            booleanColumns[0] ||
            numericColumns[0] ||
            dimensions[0];

        if (xColumn === undefined) {
            return undefined;
        }
        const x = {
            reference: xColumn.reference,
            type:
                'axisType' in xColumn
                    ? xColumn.axisType
                    : VizIndexType.CATEGORY,
        };

        const yColumn =
            metrics[0] ||
            numericColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            booleanColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            categoricalColumns.filter(
                (column) => column.reference !== x.reference,
            )[0];

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

        const sortBy = [
            { reference: x.reference, direction: SortByDirection.ASC },
        ];

        return {
            x,
            y,
            groupBy: [],
            sortBy,
        };
    }

    getConfigErrors(fieldConfig?: PivotChartLayout) {
        if (!fieldConfig) {
            return undefined;
        }
        const { indexLayoutOptions, valuesLayoutOptions, pivotLayoutOptions } =
            this.getChartOptions();

        const indexFieldError = Boolean(
            fieldConfig?.x?.reference &&
                indexLayoutOptions.find(
                    (x) => x.reference === fieldConfig?.x?.reference,
                ) === undefined,
        );

        const metricFieldError = Boolean(
            fieldConfig?.y?.some(
                (yField) =>
                    yField.reference &&
                    valuesLayoutOptions.preAggregated.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined &&
                    valuesLayoutOptions.customAggregations.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );

        const customMetricFieldError = Boolean(
            fieldConfig?.y?.some(
                (yField) =>
                    yField.reference &&
                    valuesLayoutOptions.customAggregations.find(
                        (y) => y.reference === yField.reference,
                    ) === undefined,
            ),
        );
        const groupByFieldError = Boolean(
            fieldConfig?.groupBy?.some(
                (groupByField) =>
                    groupByField.reference &&
                    pivotLayoutOptions.find(
                        (x) => x.reference === groupByField.reference,
                    ) === undefined,
            ),
        );

        if (
            !indexFieldError &&
            !metricFieldError &&
            !customMetricFieldError &&
            !groupByFieldError
        ) {
            return undefined;
        }

        return {
            ...(indexFieldError &&
                fieldConfig?.x?.reference && {
                    indexFieldError: {
                        reference: fieldConfig.x.reference,
                    },
                }),
            // TODO: can we combine metricFieldError and customMetricFieldError?
            // And maybe take out some noise
            ...(metricFieldError &&
                fieldConfig?.y?.map((y) => y.reference) && {
                    metricFieldError: {
                        references: fieldConfig?.y.reduce<
                            NonNullable<
                                VizConfigErrors['metricFieldError']
                            >['references']
                        >((acc, y) => {
                            const valuesLayoutOption =
                                valuesLayoutOptions.preAggregated.find(
                                    (v) => v.reference === y.reference,
                                );
                            if (!valuesLayoutOption) {
                                acc.push(y.reference);
                            }
                            return acc;
                        }, []),
                    },
                }),
            ...(customMetricFieldError &&
                fieldConfig?.y?.map((y) => y.reference) && {
                    customMetricFieldError: {
                        references: fieldConfig?.y.reduce<
                            NonNullable<
                                VizConfigErrors['customMetricFieldError']
                            >['references']
                        >((acc, y) => {
                            const valuesLayoutOption =
                                valuesLayoutOptions.customAggregations.find(
                                    (v) => v.reference === y.reference,
                                );
                            if (!valuesLayoutOption) {
                                acc.push(y.reference);
                            }
                            return acc;
                        }, []),
                    },
                }),
            ...(groupByFieldError &&
                fieldConfig?.groupBy?.map((gb) => gb.reference) && {
                    groupByFieldError: {
                        references: fieldConfig.groupBy.map(
                            (gb) => gb.reference,
                        ),
                    },
                }),
        };
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

    async getTransformedData(query?: SqlRunnerQuery) {
        if (!query) {
            return undefined;
        }

        return this.resultsRunner.getPivotedVisualizationData(query);
    }

    // TODO: dupe function code - see pie chart
    async getPivotedChartData({
        sortBy,
        filters,
        limit,
        sql,
    }: Pick<SqlRunnerQuery, 'sortBy' | 'filters' | 'limit' | 'sql'>): Promise<
        PivotChartData | undefined
    > {
        const allDimensionNames = new Set(
            this.resultsRunner
                .getPivotQueryDimensions()
                .map((d) => d.reference),
        );
        const allSelectedDimensions = [
            this.fieldConfig?.x?.reference,
            ...(this.fieldConfig?.groupBy?.map(
                (groupBy) => groupBy.reference,
            ) ?? []),
        ];
        const [timeDimensions, dimensions] = this.resultsRunner
            .getPivotQueryDimensions()
            .reduce<
                [
                    { name: string }[],
                    {
                        name: string;
                    }[],
                ]
            >(
                (acc, dimension) => {
                    if (allSelectedDimensions.includes(dimension.reference)) {
                        if (
                            dimension.dimensionType === DimensionType.DATE ||
                            dimension.dimensionType === DimensionType.TIMESTAMP
                        ) {
                            acc[0].push({ name: dimension.reference });
                        } else {
                            acc[1].push({ name: dimension.reference });
                        }
                    }
                    return acc;
                },
                [[], []],
            );
        const { customMetrics, metrics } = this.fieldConfig?.y?.reduce<{
            customMetrics: Required<SqlRunnerQuery>['customMetrics'];
            metrics: SqlRunnerQuery['metrics'];
        }>(
            (acc, field) => {
                if (allDimensionNames.has(field.reference)) {
                    // it's a custom metric
                    const name = `${field.reference}_${field.aggregation}`;
                    acc.customMetrics.push({
                        name,
                        baseDimension: field.reference,
                        aggType: field.aggregation,
                    });
                    acc.metrics.push({ name });
                } else {
                    acc.metrics.push({ name: field.reference });
                }
                return acc;
            },
            { customMetrics: [], metrics: [] },
        ) ?? { customMetrics: [], metrics: [] };
        const pivot = {
            index: this.fieldConfig?.x?.reference
                ? [this.fieldConfig.x?.reference]
                : [],
            on:
                this.fieldConfig?.groupBy?.map(
                    (groupBy) => groupBy.reference,
                ) ?? [],
            values: metrics.map((metric) => metric.name),
        };
        const query: SqlRunnerQuery = {
            sql,
            limit,
            filters,
            sortBy,
            metrics,
            dimensions,
            timeDimensions,
            pivot,
            customMetrics,
        };
        const pivotedChartData = await this.getTransformedData(query);

        this.pivotedChartData = pivotedChartData;

        return pivotedChartData;
    }

    getPivotedTableData():
        | {
              columns: string[];
              rows: RawResultRow[];
          }
        | undefined {
        const transformedData = this.pivotedChartData;
        const firstIndexColumn = getFirstIndexColumns(
            transformedData?.indexColumn,
        );
        if (
            !transformedData ||
            !firstIndexColumn ||
            !transformedData.results ||
            !transformedData.results.length
        ) {
            return undefined;
        }

        return {
            columns: [
                firstIndexColumn.reference,
                ...transformedData.valuesColumns.map(
                    (valueColumn) => valueColumn.pivotColumnName,
                ),
            ],
            rows: transformedData.results,
        };
    }

    getDataDownloadUrl(): string | undefined {
        const transformedData = this.pivotedChartData;
        if (!transformedData) {
            return undefined;
        }

        return transformedData.fileUrl;
    }

    // Helper function to convert data to percentages for 100% stacking
    private static convertToPercentageStacking(
        transformedData: PivotChartData,
        xAxisReference: string,
    ): {
        transformedResults: RawResultRow[];
        originalValues: Map<string, Map<string, number>>;
    } {
        const yFieldRefs = transformedData.valuesColumns.map(
            (col) => col.pivotColumnName,
        );

        return transformToPercentageStacking(
            transformedData.results,
            xAxisReference,
            yFieldRefs,
        );
    }

    getSpec(
        display?: CartesianChartDisplay,
        colors?: Organization['chartColors'],
    ): Record<string, AnyType> {
        const transformedData = this.pivotedChartData;

        if (!transformedData) {
            return {};
        }

        const { type } = this;
        const orgColors = colors ?? ECHARTS_DEFAULT_COLORS;

        const DEFAULT_X_AXIS_TYPE = VizIndexType.CATEGORY;

        const defaultSeriesType =
            type === ChartKind.VERTICAL_BAR ? 'bar' : 'line';

        // Handle both old boolean format and new StackType string format
        const stackValue = display?.stack;
        const shouldStack =
            stackValue === true ||
            stackValue === StackType.NORMAL ||
            stackValue === StackType.PERCENT;
        const shouldStack100 = stackValue === StackType.PERCENT;

        const xAxisReference = getFirstIndexColumns(
            transformedData?.indexColumn,
        )?.reference;

        // Apply 100% stacking transformation if needed
        let dataToRender = transformedData.results;
        let originalValues: Map<string, Map<string, number>> | undefined;

        if (shouldStack100 && xAxisReference) {
            const result = CartesianChartDataModel.convertToPercentageStacking(
                transformedData,
                xAxisReference,
            );
            dataToRender = result.transformedResults;
            originalValues = result.originalValues;
        }

        const leftYAxisSeriesReferences: string[] = [];
        const rightYAxisSeriesReferences: string[] = [];

        // Calculate dynamic border radius for non-stacked bars
        const barSeriesCount = transformedData.valuesColumns.filter(
            (col) =>
                (display?.series?.[col.pivotColumnName]?.type ??
                    display?.series?.[col.referenceField]?.type ??
                    defaultSeriesType) === 'bar',
        ).length;
        const isHorizontal = false; // CartesianChartDataModel doesn't support flipAxes
        const nonStackedBorderRadius = !shouldStack
            ? calculateDynamicBorderRadius(
                  dataToRender.length,
                  barSeriesCount,
                  false, // isStacked
                  isHorizontal,
              )
            : undefined;

        let series: SqlRunnerEChartsSeries[] =
            transformedData.valuesColumns.map((seriesColumn, index) => {
                const seriesColumnId = seriesColumn.pivotColumnName;

                // NOTE: seriesColumnId is the post pivoted column name and we now store the display based on that.
                // If there is no display object for the seriesColumnId, we also referenceField for compatibility with
                // the old display object that stored display info by the field, not the ID.
                const seriesDisplay =
                    display?.series?.[seriesColumnId] ??
                    display?.series?.[seriesColumn.referenceField];

                const seriesColor = seriesDisplay?.color;
                const seriesValueLabelPosition =
                    seriesDisplay?.valueLabelPosition;
                const seriesType = seriesDisplay?.type ?? defaultSeriesType;

                // Any value other than 1 is considered the left axis.
                const whichYAxis = seriesDisplay?.whichYAxis === 1 ? 1 : 0;
                const seriesFormat =
                    seriesDisplay?.format ??
                    display?.yAxis?.[whichYAxis]?.format;

                const singleYAxisLabel =
                    // NOTE: When there's only one y-axis left, set the label on the series as well
                    transformedData.valuesColumns.length === 1 &&
                    display?.yAxis?.[0]?.label
                        ? display.yAxis[0].label
                        : undefined;
                const seriesLabel = singleYAxisLabel ?? seriesDisplay?.label;

                if (whichYAxis === 1) {
                    rightYAxisSeriesReferences.push(seriesColumnId);
                } else {
                    leftYAxisSeriesReferences.push(seriesColumnId);
                }

                // Apply value label styling
                const valueLabelStyle = seriesValueLabelPosition
                    ? getValueLabelStyle(
                          seriesValueLabelPosition as
                              | 'left'
                              | 'right'
                              | 'top'
                              | 'bottom'
                              | 'inside',
                          seriesType as CartesianSeriesType,
                      )
                    : {};

                // For non-stacked bars, apply border radius directly
                const itemStyle =
                    seriesType === 'bar' && !shouldStack
                        ? {
                              borderRadius: getBarBorderRadius(
                                  isHorizontal,
                                  true, // isStackEnd - always true for non-stacked bars
                                  nonStackedBorderRadius,
                              ),
                          }
                        : undefined;

                // Determine if symbols should be shown for line/area charts
                const isLineOrArea = seriesType === CartesianSeriesType.LINE;
                const showSymbol = isLineOrArea && dataToRender.length <= 100;

                return {
                    dimensions: [xAxisReference, seriesColumnId],
                    type: seriesType ?? defaultSeriesType,
                    stack:
                        shouldStack && seriesType === 'bar'
                            ? `stack-${seriesColumn.referenceField}` // Use referenceField for stack ID
                            : undefined,
                    name:
                        seriesLabel ||
                        capitalize(seriesColumnId.toLowerCase()).replaceAll(
                            '_',
                            ' ',
                        ), // similar to friendlyName, but this will preserve special characters
                    encode: {
                        x: xAxisReference,
                        y: seriesColumnId,
                    },
                    // NOTE: this yAxisIndex is the echarts option, NOT the yAxisIndex
                    // we had been storing in the display object.
                    yAxisIndex: whichYAxis,
                    emphasis: { focus: 'series' },
                    // Connect nulls for line/area series
                    ...(isLineOrArea ? { connectNulls: true } : {}),
                    // Show symbols for line/area series based on data point count
                    ...(isLineOrArea
                        ? {
                              showSymbol,
                              symbolSize: showSymbol ? 4 : 0,
                          }
                        : {}),
                    tooltip: {
                        valueFormatter: seriesFormat
                            ? CartesianChartDataModel.getTooltipFormatter(
                                  seriesFormat,
                              )
                            : undefined,
                    },
                    label: seriesValueLabelPosition
                        ? {
                              show: seriesValueLabelPosition !== 'hidden',
                              position: seriesValueLabelPosition,
                              ...valueLabelStyle,
                              // For stack100, always apply formatter even without seriesFormat
                              formatter:
                                  shouldStack100 || seriesFormat
                                      ? CartesianChartDataModel.getValueFormatter(
                                            seriesFormat,
                                            shouldStack100,
                                        )
                                      : undefined,
                          }
                        : undefined,
                    labelLayout: {
                        hideOverlap: true,
                    },
                    color:
                        seriesColor ||
                        CartesianChartDataModel.getDefaultColor(
                            index,
                            orgColors,
                        ),
                    ...(seriesType === 'bar' ? getBarStyle() : {}),
                    // Apply border radius for non-stacked bars
                    ...(itemStyle ? { itemStyle } : {}),
                };
            });

        // Apply rounded corners to stacked bars
        // Skip for 100% stacking to keep data in dataset mode for tooltips
        if (shouldStack && !shouldStack100 && defaultSeriesType === 'bar') {
            const stackedBarSeriesCount = series.filter(
                (s) => s.type === 'bar',
            ).length;
            const dataPointCount = dataToRender.length;
            const isStacked = true;

            // Calculate dynamic border radius based on bar width
            const radius = calculateDynamicBorderRadius(
                dataPointCount,
                stackedBarSeriesCount,
                isStacked,
                isHorizontal,
            );

            // Apply rounded corners to stack data
            // This converts to tuple mode but tooltips don't need dataset mode for regular stacking
            series = applyRoundedCornersToSqlRunnerStackData(
                series,
                dataToRender,
                {
                    radius,
                    isHorizontal,
                    legendSelected: undefined,
                },
            );
        }

        const xAxisType =
            display?.xAxis?.type ||
            getFirstIndexColumns(transformedData.indexColumn)?.type ||
            DEFAULT_X_AXIS_TYPE;

        // Determine tooltip configuration
        let tooltipConfig = {};
        if (shouldStack100 && xAxisReference && originalValues) {
            // Custom formatter for 100% stacking: show percentage and actual count
            tooltipConfig = {
                formatter: createStack100TooltipFormatter(
                    originalValues,
                    (param) => {
                        const { encode, dimensionNames } = param;
                        if (!encode) return undefined;

                        // For SQL Runner dataset mode, encode.y is a string (field name)
                        // For tuple mode, it could be a number (index)
                        const yField = encode.y;

                        if (typeof yField === 'string') {
                            // Dataset mode - return the field name directly
                            return yField;
                        }

                        if (!dimensionNames) return undefined;

                        // Tuple mode - get field name from dimensionNames using index
                        const yFieldIndex = Array.isArray(yField)
                            ? yField[0]
                            : yField;

                        if (typeof yFieldIndex === 'number') {
                            return dimensionNames[yFieldIndex];
                        }

                        return undefined;
                    },
                    xAxisReference,
                ),
            };
        } else if (xAxisType === VizIndexType.TIME && xAxisReference) {
            tooltipConfig = {
                axisPointer: {
                    label: {
                        // ECharts converts timezone values to local time
                        // so we need to show the original value in the tooltip
                        // this function is loosely typed because we don't have ECharts types in common
                        formatter: (params: {
                            seriesData: {
                                value: Record<string, unknown>;
                            }[];
                        }) => params.seriesData[0]?.value[xAxisReference],
                    },
                },
            };
        }

        // Determine legend icon type - use 'line' only when ALL series are line/area
        const allSeriesAreLineOrArea = series.every(
            (s) => s.type === 'line' || s.type === 'area',
        );
        const legendIconType = allSeriesAreLineOrArea ? 'line' : 'square';

        // Determine grid style based on chart type
        const isBarChart = defaultSeriesType === 'bar';
        const gridStyle = isBarChart
            ? getBarChartGridStyle()
            : getLineChartGridStyle();

        // Show legend when there are multiple series
        const showLegend = transformedData.valuesColumns.length > 1;

        const spec = {
            tooltip: {
                ...getTooltipStyle(),
                trigger: 'axis',
                appendToBody: true, // Similar to rendering a tooltip in a Portal
                axisPointer: getAxisPointerStyle(),
                ...tooltipConfig,
                formatter: buildSqlRunnerCartesianTooltipFormatter({
                    stackValue: display?.stack,
                    flipAxes: false,
                    xFieldId: xAxisReference,
                    originalValues,
                }),
                extraCssText: `overflow-y: auto; max-height:280px; ${
                    getTooltipStyle().extraCssText
                }`,
            },
            legend: {
                show: showLegend,
                type: 'scroll',
                ...getLegendStyle(legendIconType),
            },
            grid: {
                left: 60,
                right: 60,
                top: showLegend ? 70 : 60, // Add more space when legend is shown
                bottom: 60,
                containLabel: true,
                ...gridStyle,
            },
            xAxis: {
                type: xAxisType,
                name:
                    display?.xAxis?.label ||
                    friendlyName(xAxisReference || 'xAxisColumn'),
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: getAxisTitleStyle(),
                axisLabel: getAxisLabelStyle(),
                axisLine: getAxisLineStyle(),
                axisTick: getAxisTickStyle(),
                axisPointer: getAxisPointerStyle(),
            },
            yAxis: [
                {
                    type: 'value',
                    position: display?.yAxis?.[0]?.position || 'left',
                    name:
                        leftYAxisSeriesReferences.length > 0
                            ? display?.yAxis?.[0]?.label ||
                              friendlyName(leftYAxisSeriesReferences[0])
                            : '',
                    nameLocation: 'center',
                    nameGap: 50,
                    nameRotate: 90,
                    nameTextStyle: getAxisTitleStyle(),
                    axisLabel: {
                        ...getAxisLabelStyle(),
                        ...(() => {
                            if (shouldStack100) {
                                // For 100% stacking, show percentage on y-axis
                                return {
                                    formatter: '{value}%',
                                };
                            }
                            if (display?.yAxis?.[0]?.format) {
                                return {
                                    formatter:
                                        CartesianChartDataModel.getTooltipFormatter(
                                            display.yAxis[0].format,
                                        ),
                                };
                            }
                            return {};
                        })(),
                    },
                    axisLine: getAxisLineStyle(),
                    axisTick: getAxisTickStyle(),
                    axisPointer: getAxisPointerStyle(),
                    ...(shouldStack100 ? { max: 100 } : {}),
                },
                {
                    type: 'value',
                    position: 'right',
                    name:
                        rightYAxisSeriesReferences.length > 0
                            ? display?.yAxis?.[1]?.label ||
                              friendlyName(rightYAxisSeriesReferences[0])
                            : '',
                    nameLocation: 'center',
                    nameGap: 50,
                    nameRotate: -90,
                    nameTextStyle: getAxisTitleStyle(),
                    axisLabel: {
                        ...getAxisLabelStyle(),
                        ...(display?.yAxis?.[1]?.format
                            ? {
                                  formatter:
                                      CartesianChartDataModel.getTooltipFormatter(
                                          display?.yAxis?.[1].format,
                                      ),
                              }
                            : {}),
                    },
                    axisLine: getAxisLineStyle(),
                    axisTick: getAxisTickStyle(),
                    axisPointer: getAxisPointerStyle(),
                },
            ],
            dataset: {
                id: 'dataset',
                source: dataToRender, // Use transformed data for 100% stacking
            },
            series,
            textStyle: {
                fontFamily: 'Inter, sans-serif',
            },
        };

        return spec;
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
            // 'label' maps to 'name' in ECharts
            label?: string;
            format?: Format;
            // NOTE: this is the yAxisIndex in the display object, NOT the
            // eCharts yAxisIndex. It shouldn't be used to refer to a y-axis, but
            // the series index in the yAxis array.
            yAxisIndex?: number;
            color?: string;
            type?: CartesianSeriesType.LINE | CartesianSeriesType.BAR;
            // Value labels maps to 'label' in ECharts
            valueLabelPosition?: ValueLabelPositionOptions;
            // whichAxis maps to the yAxis index in Echarts.
            whichYAxis?: AxisSide;
        };
    };
    legend?: {
        position: 'top' | 'bottom' | 'left' | 'right';
        align: 'start' | 'center' | 'end';
    };
    stack?: boolean | StackType; // Support both old boolean and new StackType for backward compatibility
};
