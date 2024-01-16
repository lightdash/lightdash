import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    DimensionType,
    formatItemValue,
    formatTableCalculationValue,
    formatValue,
    friendlyName,
    getAxisName,
    getDateGroupLabel,
    getDefaultSeriesColor,
    getItemLabelWithoutTableName,
    getResultValueArray,
    hashFieldReference,
    isCompleteLayout,
    isCustomDimension,
    isDimension,
    isField,
    isPivotReferenceWithValues,
    isTableCalculation,
    isTimeInterval,
    ItemsMap,
    MetricType,
    PivotReference,
    ResultRow,
    Series,
    TableCalculation,
    timeFrameConfigs,
} from '@lightdash/common';
import {
    DefaultLabelFormatterCallbackParams,
    LineSeriesOption,
    TooltipComponentFormatterCallback,
    TooltipComponentOption,
} from 'echarts';
import groupBy from 'lodash/groupBy';
import toNumber from 'lodash/toNumber';
import moment from 'moment';
import { useMemo } from 'react';
import { isCartesianVisualizationConfig } from '../../components/LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../components/LightdashVisualization/VisualizationProvider';
import { defaultGrid } from '../../components/VisualizationConfigs/ChartConfigPanel/Grid';
import { EMPTY_X_AXIS } from '../cartesianChartConfig/useCartesianChartConfig';
import getPlottedData from '../plottedData/getPlottedData';

// NOTE: CallbackDataParams type doesn't have axisValue, axisValueLabel properties: https://github.com/apache/echarts/issues/17561
type TooltipFormatterParams = DefaultLabelFormatterCallbackParams & {
    axisId: string;
    axisIndex: number;
    axisType: string;
    axisValue: string | number;
    axisValueLabel: string;
};

type TooltipOption = Omit<TooltipComponentOption, 'formatter'> & {
    formatter?:
        | string
        | TooltipComponentFormatterCallback<
              TooltipFormatterParams | TooltipFormatterParams[]
          >;
};

export const isLineSeriesOption = (obj: unknown): obj is LineSeriesOption =>
    typeof obj === 'object' && obj !== null && 'showSymbol' in obj;

const getLabelFromField = (fields: ItemsMap, key: string | undefined) => {
    const item = key ? fields[key] : undefined;

    if (item) {
        return getDateGroupLabel(item) || getItemLabelWithoutTableName(item);
    } else if (key) {
        return friendlyName(key);
    } else {
        return '';
    }
};

const getAxisTypeFromField = (item?: ItemsMap[string]): string => {
    if (item && isCustomDimension(item)) return 'category';
    if (item && isField(item)) {
        switch (item.type) {
            case DimensionType.NUMBER:
            case MetricType.NUMBER:
            case MetricType.PERCENTILE:
            case MetricType.MEDIAN:

            case MetricType.AVERAGE:
            case MetricType.COUNT:
            case MetricType.COUNT_DISTINCT:
            case MetricType.SUM:
            case MetricType.MIN:
            case MetricType.MAX:
                return 'value';
            case DimensionType.TIMESTAMP:
            case MetricType.TIMESTAMP:
            case DimensionType.DATE:
            case MetricType.DATE:
                return 'time';
            default: {
                return 'category';
            }
        }
    } else {
        return 'value';
    }
};

type GetAxisTypeArg = {
    validCartesianConfig: CartesianChart;
    itemsMap: ItemsMap;
    topAxisXId?: string;
    bottomAxisXId?: string;
    rightAxisYId?: string;
    leftAxisYId?: string;
};
const getAxisType = ({
    validCartesianConfig,
    itemsMap,
    topAxisXId,
    bottomAxisXId,
    rightAxisYId,
    leftAxisYId,
}: GetAxisTypeArg) => {
    const topAxisType = getAxisTypeFromField(
        topAxisXId ? itemsMap[topAxisXId] : undefined,
    );
    const bottomAxisType =
        bottomAxisXId === EMPTY_X_AXIS
            ? 'category'
            : getAxisTypeFromField(
                  bottomAxisXId ? itemsMap[bottomAxisXId] : undefined,
              );
    // horizontal bar chart needs the type 'category' in the left/right axis
    const defaultRightAxisType = getAxisTypeFromField(
        rightAxisYId ? itemsMap[rightAxisYId] : undefined,
    );
    const rightAxisType =
        validCartesianConfig.layout.flipAxes &&
        defaultRightAxisType === 'value' &&
        (
            validCartesianConfig.eChartsConfig.series?.find(
                (serie) => serie.yAxisIndex === 1,
            ) || validCartesianConfig.eChartsConfig.series?.[0]
        )?.type === CartesianSeriesType.BAR
            ? 'category'
            : defaultRightAxisType;
    const defaultLeftAxisType = getAxisTypeFromField(
        leftAxisYId ? itemsMap[leftAxisYId] : undefined,
    );
    const leftAxisType =
        validCartesianConfig.layout.flipAxes &&
        defaultLeftAxisType === 'value' &&
        (
            validCartesianConfig.eChartsConfig.series?.find(
                (serie) => serie.yAxisIndex === 0,
            ) || validCartesianConfig.eChartsConfig.series?.[0]
        )?.type === CartesianSeriesType.BAR
            ? 'category'
            : defaultLeftAxisType;

    return {
        topAxisType,
        bottomAxisType,
        rightAxisType,
        leftAxisType,
    };
};

export const getAxisDefaultMinValue = ({
    min,
    max,
}: {
    min: any;
    max: any;
}) => {
    if (
        isNaN(parseInt(min)) ||
        isNaN(parseInt(max)) ||
        min instanceof Date ||
        max instanceof Date
    ) {
        return undefined;
    } else if (min >= 0 && min > (max - min) * 3) {
        return min;
    }
    return undefined;
};

const maybeGetAxisDefaultMinValue = (allowFunction: boolean) =>
    allowFunction ? getAxisDefaultMinValue : undefined;

export const getAxisDefaultMaxValue = ({
    min,
    max,
}: {
    min: any;
    max: any;
}) => {
    if (
        isNaN(parseInt(min)) ||
        isNaN(parseInt(max)) ||
        min instanceof Date ||
        max instanceof Date
    ) {
        return undefined;
    } else if (max < 0 && Math.abs(max) > Math.abs(min - max) * 3) {
        return max;
    }
    return undefined;
};

const maybeGetAxisDefaultMaxValue = (allowFunction: boolean) =>
    allowFunction ? getAxisDefaultMaxValue : undefined;

export type EChartSeries = {
    type: Series['type'];
    connectNulls: boolean;
    stack?: string;
    stackLabel?: {
        show?: boolean;
    };
    name?: string;
    color?: string;
    yAxisIndex?: number;
    xAxisIndex?: number;
    encode?: {
        x: string;
        y: string;
        tooltip: string[];
        seriesName: string;
    };
    dimensions?: Array<{ name: string; displayName: string }>;
    emphasis?: {
        focus?: string;
    };
    areaStyle?: any;
    pivotReference?: PivotReference;
    label?: {
        show?: boolean;
        fontSize?: number;
        fontWeight?: string;
        position?: 'left' | 'top' | 'right' | 'bottom' | 'inside';
        formatter?: (param: { data: Record<string, unknown> }) => string;
    };
    labelLayout?: {
        hideOverlap?: boolean;
    };
    tooltip?: {
        show?: boolean;
        valueFormatter?: (value: unknown) => string;
    };
    data?: unknown[];
    showSymbol?: boolean;
};

const getFormattedValue = (
    value: any,
    key: string,
    itemsMap: ItemsMap,
    convertToUTC: boolean = true,
): string => {
    return formatItemValue(itemsMap[key], value, convertToUTC);
};

const valueFormatter =
    (yFieldId: string, itemsMap: ItemsMap) => (rawValue: any) => {
        return getFormattedValue(rawValue, yFieldId, itemsMap);
    };

const removeEmptyProperties = <T = Record<any, any>>(obj: T | undefined) => {
    if (!obj) return undefined;
    return Object.entries(obj).reduce(
        (sum, [key, value]) =>
            value !== undefined && value !== ''
                ? { ...sum, [key]: value }
                : sum,
        {},
    );
};

const mergeLegendSettings = <T = Record<any, any>>(
    legendConfig: T | undefined,
    legendsSelected: LegendValues,
    series: EChartSeries[],
) => {
    const normalizedConfig = removeEmptyProperties(legendConfig);
    if (!normalizedConfig) {
        return {
            show: series.length > 1,
            type: 'scroll',
            selected: legendsSelected,
        };
    }
    return {
        ...normalizedConfig,
        selected: legendsSelected,
    };
};

const minDate = (a: number | string, b: string) => {
    if (typeof a === 'number') return b;

    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA < dateB ? a : b;
};

const maxDate = (a: number | string, b: string) => {
    if (typeof a === 'number') return b;

    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA > dateB ? a : b;
};

export const getMinAndMaxValues = (
    axis: string | undefined,
    rows: ResultRow[],
): (string | number)[] => {
    if (!axis) return [];

    return rows
        .map((row) => row[axis]?.value.raw)
        .reduce<(string | number)[]>(
            (acc, value) => {
                if (
                    typeof value === 'string' &&
                    moment(value, 'YYYY-MM-DD', false).isValid()
                ) {
                    // is date
                    const min = minDate(acc[0], value);
                    const max = maxDate(acc[1], value);

                    return [min, max];
                } else if (
                    typeof value === 'string' ||
                    typeof value === 'number'
                ) {
                    // is number or numeric string
                    const currentNumber =
                        typeof value === 'string' ? parseFloat(value) : value;
                    const currentMin =
                        typeof acc[0] === 'string'
                            ? parseFloat(acc[0])
                            : acc[0];
                    const currentMax =
                        typeof acc[1] === 'string'
                            ? parseFloat(acc[1])
                            : acc[1];

                    if (!isNaN(currentNumber)) {
                        const min =
                            currentNumber < currentMin
                                ? currentNumber
                                : currentMin;
                        const max =
                            currentNumber > currentMax
                                ? currentNumber
                                : currentMax;

                        return [min, max];
                    }
                }
                return acc;
            },
            [0, 0],
        );
};

const getMinAndMaxReferenceLines = (
    leftAxisYId: string | undefined,
    rightAxisYId: string | undefined,
    bottomAxisXId: string | undefined,
    resultsData: ApiQueryResults | undefined,
    series: Series[] | undefined,
    items: ItemsMap,
) => {
    if (resultsData === undefined || series === undefined) return {};
    // Skip method if there are no reference lines
    const hasReferenceLines =
        series.find((serie) => {
            const data = serie.markLine?.data;
            return data !== undefined && data.length > 0;
        }) !== undefined;

    if (!hasReferenceLines) return {};

    const getMinAndMaxReferenceLineValues = (
        axis: string,
        fieldId: string | undefined,
    ): (string | number)[] => {
        const values = series.flatMap<string | number>((serie) => {
            const serieFieldId =
                axis === 'yAxis' ? serie.encode.yRef : serie.encode.xRef;
            if (serieFieldId.field !== fieldId) return [];

            if (!serie.markLine) return [];
            const field = items[serieFieldId.field];

            const fieldType = isField(field) ? field.type : undefined;

            switch (fieldType) {
                case DimensionType.NUMBER:
                case MetricType.NUMBER:
                case MetricType.AVERAGE:
                case MetricType.COUNT:
                case MetricType.COUNT_DISTINCT:
                case MetricType.SUM:
                case MetricType.MEDIAN:
                case MetricType.PERCENTILE:
                case MetricType.MIN:
                case MetricType.MAX:
                    return serie.markLine?.data.reduce<number[]>(
                        (acc, data) => {
                            try {
                                const axisValue =
                                    axis === 'yAxis' ? data.yAxis : data.xAxis;
                                if (axisValue === undefined) return acc;
                                const value = parseInt(axisValue);
                                if (isNaN(value)) return acc;
                                return [...acc, value];
                            } catch (e) {
                                console.error(
                                    `Unexpected value when getting numbers min/max for ${fieldType}: ${JSON.stringify(
                                        data,
                                    )}`,
                                );
                                return acc;
                            }
                        },
                        [],
                    );

                case DimensionType.TIMESTAMP:
                case MetricType.TIMESTAMP:
                case DimensionType.DATE:
                case MetricType.DATE:
                    return serie.markLine?.data.reduce<string[]>(
                        (acc, data) => {
                            try {
                                const axisValue =
                                    axis === 'yAxis' ? data.yAxis : data.xAxis;
                                if (axisValue === undefined) return acc;
                                return [...acc, axisValue];
                            } catch (e) {
                                console.error(
                                    `Unexpected value when getting date min/max for ${fieldType}: ${data}`,
                                );
                                return acc;
                            }
                        },
                        [],
                    );
                default: {
                    // We will try getting values for TableCalculations
                    return serie.markLine?.data.reduce<number[]>(
                        (acc, data) => {
                            try {
                                const axisValue =
                                    axis === 'yAxis' ? data.yAxis : data.xAxis;
                                if (axisValue === undefined) return acc;
                                const value = parseInt(axisValue);
                                if (isNaN(value)) return acc;
                                return [...acc, value];
                            } catch (e) {
                                console.error(
                                    `Unexpected value when getting numbers min/max for ${fieldType}: ${JSON.stringify(
                                        data,
                                    )}`,
                                );
                                return acc;
                            }
                        },
                        [],
                    );
                }
            }
        });

        if (values.length === 0) return [];
        const min: string | number = values.sort()[0];
        const max = values.reverse()[0];
        return [min, max];
    };

    const [minValueLeftY, maxValueLeftY] = getMinAndMaxValues(
        leftAxisYId,
        resultsData.rows,
    );
    const [minValueRightY, maxValueRightY] = getMinAndMaxValues(
        rightAxisYId,
        resultsData.rows,
    );
    const [minValueX, maxValueX] = getMinAndMaxValues(
        bottomAxisXId,
        resultsData.rows,
    );

    const [minReferenceLineX, maxReferenceLineX] =
        getMinAndMaxReferenceLineValues('xAxis', bottomAxisXId);
    const [minReferenceLineLeftY, maxReferenceLineLeftY] =
        getMinAndMaxReferenceLineValues('yAxis', leftAxisYId);
    const [minReferenceLineRightY, maxReferenceLineRightY] =
        getMinAndMaxReferenceLineValues('yAxis', rightAxisYId);

    return {
        referenceLineMinX:
            minReferenceLineX < minValueX ? minReferenceLineX : undefined,
        referenceLineMaxX:
            maxReferenceLineX > maxValueX ? maxReferenceLineX : undefined,
        referenceLineMinLeftY:
            minReferenceLineLeftY < minValueLeftY
                ? minReferenceLineLeftY
                : undefined,
        referenceLineMaxLeftY:
            maxReferenceLineLeftY > maxValueLeftY
                ? maxReferenceLineLeftY
                : undefined,
        referenceLineMinRightY:
            minReferenceLineRightY < minValueRightY
                ? minReferenceLineRightY
                : undefined,
        referenceLineMaxRightY:
            maxReferenceLineRightY > maxValueRightY
                ? maxReferenceLineRightY
                : undefined,
    };
};
type GetPivotSeriesArg = {
    series: Series;
    itemsMap: ItemsMap;
    cartesianChart: CartesianChart;
    flipAxes: boolean | undefined;
    yFieldHash: string;
    xFieldHash: string;
    pivotReference: Required<PivotReference>;
};

const getPivotSeries = ({
    series,
    pivotReference,
    itemsMap,
    xFieldHash,
    yFieldHash,
    flipAxes,
    cartesianChart,
}: GetPivotSeriesArg): EChartSeries => {
    const pivotLabel = pivotReference.pivotValues.reduce(
        (acc, { field, value }) => {
            const formattedValue = getFormattedValue(value, field, itemsMap);
            return acc ? `${acc} - ${formattedValue}` : formattedValue;
        },
        '',
    );

    return {
        ...series,
        emphasis: {
            focus: 'series',
        },
        xAxisIndex: flipAxes ? series.yAxisIndex : undefined,
        yAxisIndex: flipAxes ? undefined : series.yAxisIndex,
        connectNulls: true,
        encode: {
            x: flipAxes ? yFieldHash : xFieldHash,
            y: flipAxes ? xFieldHash : yFieldHash,
            tooltip: [yFieldHash],
            seriesName: yFieldHash,
        },
        pivotReference,
        dimensions: [
            {
                name: xFieldHash,
                displayName: getLabelFromField(itemsMap, xFieldHash),
            },
            {
                name: yFieldHash,
                displayName:
                    cartesianChart.layout.yField &&
                    cartesianChart.layout.yField.length > 1
                        ? `[${pivotLabel}] ${getLabelFromField(
                              itemsMap,
                              series.encode.yRef.field,
                          )}`
                        : pivotLabel,
            },
        ],
        tooltip: {
            valueFormatter: valueFormatter(series.encode.yRef.field, itemsMap),
        },
        showSymbol: series.showSymbol ?? true,
        ...(series.label?.show && {
            label: {
                ...series.label,
                ...(itemsMap &&
                    itemsMap[series.encode.yRef.field] && {
                        formatter: (value: any) => {
                            const field = itemsMap[series.encode.yRef.field];
                            if (isCustomDimension(field)) {
                                return value;
                            }
                            if (isTableCalculation(field)) {
                                return formatTableCalculationValue(
                                    field as TableCalculation,
                                    value?.value?.[yFieldHash],
                                );
                            } else {
                                return formatValue(value?.value?.[yFieldHash], {
                                    format: field.format,
                                    round: field.round,
                                    compact: field.compact,
                                });
                            }
                        },
                    }),
            },
            labelLayout: {
                hideOverlap: true,
            },
        }),
    };
};

type GetSimpleSeriesArg = {
    series: Series;
    itemsMap: ItemsMap;
    flipAxes: boolean | undefined;
    yFieldHash: string;
    xFieldHash: string;
};

const getSimpleSeries = ({
    series,
    flipAxes,
    yFieldHash,
    xFieldHash,
    itemsMap,
}: GetSimpleSeriesArg) => ({
    ...series,
    xAxisIndex: flipAxes ? series.yAxisIndex : undefined,
    yAxisIndex: flipAxes ? undefined : series.yAxisIndex,
    emphasis: {
        focus: 'series',
    },
    connectNulls: true,
    encode: {
        ...series.encode,
        x: flipAxes ? yFieldHash : xFieldHash,
        y: flipAxes ? xFieldHash : yFieldHash,
        tooltip: [yFieldHash],
        seriesName: yFieldHash,
    },
    dimensions: [
        {
            name: xFieldHash,
            displayName: getLabelFromField(itemsMap, xFieldHash),
        },
        {
            name: yFieldHash,
            displayName: getLabelFromField(itemsMap, yFieldHash),
        },
    ],
    tooltip: {
        valueFormatter: valueFormatter(yFieldHash, itemsMap),
    },
    showSymbol: series.showSymbol ?? true,
    ...(series.label?.show && {
        label: {
            ...series.label,
            ...(itemsMap &&
                itemsMap[yFieldHash] && {
                    formatter: (value: any) => {
                        const field = itemsMap[yFieldHash];
                        if (isCustomDimension(field)) {
                            return value;
                        }
                        if (isTableCalculation(field)) {
                            return formatTableCalculationValue(
                                field as TableCalculation,
                                value?.value?.[yFieldHash],
                            );
                        } else {
                            return formatValue(value?.value?.[yFieldHash], {
                                format: field.format,
                                round: field.round,
                                compact: field.compact,
                            });
                        }
                    },
                }),
        },
        labelLayout: {
            hideOverlap: true,
        },
    }),
});

const getEchartsSeries = (
    itemsMap: ItemsMap,
    cartesianChart: CartesianChart,
    pivotKeys: string[] | undefined,
): EChartSeries[] => {
    return (cartesianChart.eChartsConfig.series || [])
        .filter((s) => !s.hidden)
        .map<EChartSeries>((series) => {
            const { flipAxes } = cartesianChart.layout;
            const xFieldHash = hashFieldReference(series.encode.xRef);
            const yFieldHash = hashFieldReference(series.encode.yRef);
            if (pivotKeys && isPivotReferenceWithValues(series.encode.yRef)) {
                return getPivotSeries({
                    series,
                    itemsMap,
                    cartesianChart,
                    pivotReference: series.encode.yRef,
                    flipAxes,
                    xFieldHash,
                    yFieldHash,
                });
            }

            return getSimpleSeries({
                series,
                itemsMap,
                flipAxes,
                yFieldHash,
                xFieldHash,
            });
        });
};

const calculateWidthText = (text: string | undefined): number => {
    if (!text) return 0;

    const span = document.createElement('span');
    document.body.appendChild(span);

    span.style.font = 'sans-serif';
    span.style.fontSize = '12px';
    span.style.height = 'auto';
    span.style.width = 'auto';
    span.style.top = '0px';
    span.style.position = 'absolute';
    span.style.whiteSpace = 'no-wrap';
    span.innerHTML = text;

    const width = Math.ceil(span.clientWidth);
    span.remove();
    return width;
};

const getEchartAxis = ({
    itemsMap,
    validCartesianConfig,
    series,
    resultsData,
}: {
    validCartesianConfig: CartesianChart;
    itemsMap: ItemsMap;
    series: EChartSeries[];
    resultsData: ApiQueryResults | undefined;
}) => {
    const xAxisItemId = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.layout?.yField?.[0]
        : validCartesianConfig.layout?.xField;
    const xAxisItem = xAxisItemId ? itemsMap[xAxisItemId] : undefined;

    const yAxisItemId = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.layout?.xField
        : validCartesianConfig.layout?.yField?.[0];

    const yAxisItem = yAxisItemId ? itemsMap[yAxisItemId] : undefined;

    const selectedAxisInSeries = Array.from(
        new Set(
            series?.map(({ yAxisIndex, xAxisIndex }) =>
                validCartesianConfig.layout.flipAxes ? xAxisIndex : yAxisIndex,
            ),
        ),
    );
    const isAxisTheSameForAllSeries: boolean =
        selectedAxisInSeries.length === 1;
    const selectedAxisIndex = selectedAxisInSeries[0] || 0;

    const xAxisConfiguration = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig?.yAxis
        : validCartesianConfig.eChartsConfig?.xAxis;
    const yAxisConfiguration = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig?.xAxis
        : validCartesianConfig.eChartsConfig?.yAxis;

    const [allowFirstAxisDefaultRange, allowSecondAxisDefaultRange] = (
        series || []
    ).reduce<[boolean, boolean]>(
        (acc, singleSeries) => {
            if (singleSeries.type === CartesianSeriesType.BAR) {
                acc[singleSeries.yAxisIndex || 0] = false;
            }
            return acc;
        },
        [true, true],
    );

    const getAxisFormatter = (axisItem: ItemsMap[string] | undefined) => {
        const hasFormattingConfig =
            isField(axisItem) &&
            (axisItem.format || axisItem.round || axisItem.compact);
        const axisMinInterval =
            isDimension(axisItem) &&
            axisItem.timeInterval &&
            isTimeInterval(axisItem.timeInterval) &&
            timeFrameConfigs[axisItem.timeInterval].getAxisMinInterval();
        const axisLabelFormatter =
            isDimension(axisItem) &&
            axisItem.timeInterval &&
            isTimeInterval(axisItem.timeInterval) &&
            timeFrameConfigs[axisItem.timeInterval].getAxisLabelFormatter();
        const axisConfig: Record<string, any> = {};

        if (axisItem && (hasFormattingConfig || axisMinInterval)) {
            axisConfig.axisLabel = {
                formatter: (value: any) => {
                    return formatItemValue(axisItem, value, true);
                },
            };
            axisConfig.axisPointer = {
                label: {
                    formatter: (value: any) => {
                        return formatItemValue(axisItem, value.value, false);
                    },
                },
            };
        } else if (axisLabelFormatter) {
            axisConfig.axisLabel = {
                formatter: axisLabelFormatter,
            };
            axisConfig.axisPointer = {
                label: {
                    formatter: (value: any) => {
                        return formatItemValue(axisItem, value.value, false);
                    },
                },
            };
        } else if (axisItem !== undefined && isTableCalculation(axisItem)) {
            axisConfig.axisLabel = {
                formatter: (value: any) => {
                    return formatTableCalculationValue(axisItem, value);
                },
            };
            axisConfig.axisPointer = {
                label: {
                    formatter: (value: any) => {
                        return formatTableCalculationValue(
                            axisItem,
                            value.value,
                        );
                    },
                },
            };
        }
        if (axisMinInterval) {
            axisConfig.minInterval = axisMinInterval;
        }
        return axisConfig;
    };

    const showGridX = !!validCartesianConfig.layout.showGridX;
    const showGridY =
        validCartesianConfig.layout.showGridY !== undefined
            ? validCartesianConfig.layout.showGridY
            : true;

    // There is no Top x axis when no flipped
    const topAxisXId = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig.series?.find(
              (serie) => serie.yAxisIndex === 1,
          )?.encode.yRef.field
        : undefined;
    const bottomAxisXId = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig.series?.find(
              (serie) => serie.yAxisIndex === 0,
          )?.encode.yRef.field
        : xAxisItemId;

    const leftAxisYId = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.layout?.xField
        : validCartesianConfig.eChartsConfig.series?.find(
              (serie) => serie.yAxisIndex === 0,
          )?.encode.yRef.field || yAxisItemId;
    // There is no right Y axis when flipped
    const rightAxisYId =
        validCartesianConfig.eChartsConfig.series?.find(
            (serie) => serie.yAxisIndex === 1,
        )?.encode.yRef.field || validCartesianConfig.layout?.yField?.[1];

    const longestValueYAxisLeft: string | undefined =
        leftAxisYId &&
        resultsData?.rows
            .map((row) => row[leftAxisYId]?.value.formatted)
            .reduce<string>(
                (acc, p) => (p && acc.length > p.length ? acc : p),
                '',
            );
    const leftYaxisGap = calculateWidthText(longestValueYAxisLeft);

    const longestValueYAxisRight: string | undefined =
        rightAxisYId &&
        resultsData?.rows
            .map((row) => row[rightAxisYId]?.value.formatted)
            .reduce<string>(
                (acc, p) => (p && acc.length > p.length ? acc : p),
                '',
            );
    const rightYaxisGap = calculateWidthText(longestValueYAxisRight);

    const rightAxisYField = rightAxisYId ? itemsMap[rightAxisYId] : undefined;
    const leftAxisYField = leftAxisYId ? itemsMap[leftAxisYId] : undefined;
    const topAxisXField = topAxisXId ? itemsMap[topAxisXId] : undefined;
    const bottomAxisXField = bottomAxisXId
        ? itemsMap[bottomAxisXId]
        : undefined;

    const { bottomAxisType, topAxisType, rightAxisType, leftAxisType } =
        getAxisType({
            validCartesianConfig,
            itemsMap,
            topAxisXId,
            bottomAxisXId,
            leftAxisYId,
            rightAxisYId,
        });

    const {
        referenceLineMinX,
        referenceLineMaxX,
        referenceLineMinLeftY,
        referenceLineMaxLeftY,
        referenceLineMinRightY,
        referenceLineMaxRightY,
    } = getMinAndMaxReferenceLines(
        leftAxisYId,
        rightAxisYId,
        bottomAxisXId,
        resultsData,
        validCartesianConfig.eChartsConfig.series,
        itemsMap,
    );

    return {
        xAxis: [
            {
                type: bottomAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 0,
                          axisReference: 'yRef',
                          axisName: xAxisConfiguration?.[0]?.name,
                          itemsMap,
                          series: validCartesianConfig.eChartsConfig.series,
                      })
                    : xAxisConfiguration?.[0]?.name ||
                      (xAxisItem
                          ? getDateGroupLabel(xAxisItem) ||
                            getItemLabelWithoutTableName(xAxisItem)
                          : undefined),
                min: validCartesianConfig.layout.flipAxes
                    ? xAxisConfiguration?.[0]?.min ||
                      maybeGetAxisDefaultMinValue(allowFirstAxisDefaultRange)
                    : referenceLineMinX,
                max: validCartesianConfig.layout.flipAxes
                    ? xAxisConfiguration?.[0]?.max ||
                      maybeGetAxisDefaultMaxValue(allowFirstAxisDefaultRange)
                    : referenceLineMaxX,
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
                ...getAxisFormatter(bottomAxisXField),
                splitLine: {
                    show: validCartesianConfig.layout.flipAxes
                        ? showGridY
                        : showGridX,
                },
                inverse: !!xAxisConfiguration?.[0].inverse,
            },
            {
                type: topAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 1,
                          axisReference: 'yRef',
                          axisName: xAxisConfiguration?.[1]?.name,
                          itemsMap,
                          series: validCartesianConfig.eChartsConfig.series,
                      })
                    : undefined,
                min: validCartesianConfig.layout.flipAxes
                    ? xAxisConfiguration?.[1]?.min ||
                      maybeGetAxisDefaultMinValue(allowSecondAxisDefaultRange)
                    : undefined,
                max: validCartesianConfig.layout.flipAxes
                    ? xAxisConfiguration?.[1]?.max ||
                      maybeGetAxisDefaultMaxValue(allowSecondAxisDefaultRange)
                    : undefined,
                nameLocation: 'center',
                nameGap: 30,
                ...getAxisFormatter(topAxisXField),

                nameTextStyle: {
                    fontWeight: 'bold',
                },
                splitLine: {
                    show: isAxisTheSameForAllSeries,
                },
            },
        ],
        yAxis: [
            {
                type: leftAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[0]?.name ||
                      (yAxisItem
                          ? getDateGroupLabel(yAxisItem) ||
                            getItemLabelWithoutTableName(yAxisItem)
                          : undefined)
                    : getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 0,
                          axisReference: 'yRef',
                          axisName: yAxisConfiguration?.[0]?.name,
                          itemsMap,
                          series: validCartesianConfig.eChartsConfig.series,
                      }),
                min: !validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[0]?.min ||
                      referenceLineMinLeftY ||
                      maybeGetAxisDefaultMinValue(allowFirstAxisDefaultRange)
                    : undefined,
                max: !validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[0]?.max ||
                      referenceLineMaxLeftY ||
                      maybeGetAxisDefaultMaxValue(allowFirstAxisDefaultRange)
                    : undefined,
                nameTextStyle: {
                    fontWeight: 'bold',
                    align: 'center',
                },
                nameLocation: 'center',
                nameGap: leftYaxisGap + 20,
                ...getAxisFormatter(leftAxisYField),
                splitLine: {
                    show: validCartesianConfig.layout.flipAxes
                        ? showGridX
                        : showGridY,
                },
                inverse: !!yAxisConfiguration?.[0].inverse,
            },
            {
                type: rightAxisType,
                name: validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[1]?.name
                    : getAxisName({
                          isAxisTheSameForAllSeries,
                          selectedAxisIndex,
                          axisIndex: 1,
                          axisReference: 'yRef',
                          axisName: yAxisConfiguration?.[1]?.name,
                          itemsMap,
                          series: validCartesianConfig.eChartsConfig.series,
                      }),
                min: !validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[1]?.min ||
                      referenceLineMinRightY ||
                      maybeGetAxisDefaultMinValue(allowSecondAxisDefaultRange)
                    : undefined,
                max: !validCartesianConfig.layout.flipAxes
                    ? yAxisConfiguration?.[1]?.max ||
                      referenceLineMaxRightY ||
                      maybeGetAxisDefaultMaxValue(allowSecondAxisDefaultRange)
                    : undefined,
                nameTextStyle: {
                    fontWeight: 'bold',
                    align: 'center',
                },
                ...getAxisFormatter(rightAxisYField),

                nameLocation: 'center',
                nameRotate: -90,
                nameGap: rightYaxisGap + 20,
                splitLine: {
                    show: isAxisTheSameForAllSeries,
                },
            },
        ],
    };
};

const getValidStack = (series: EChartSeries | undefined) => {
    return series && (series.type === 'bar' || !!series.areaStyle)
        ? series.stack
        : undefined;
};

type LegendValues = { [name: string]: boolean } | undefined;

const calculateStackTotal = (
    row: ResultRow,
    series: EChartSeries[],
    flipAxis: boolean | undefined,
    selectedLegendNames: LegendValues,
) => {
    return series.reduce<number>((acc, s) => {
        const hash = flipAxis ? s.encode?.x : s.encode?.y;
        const legendName = s.dimensions?.[1]?.displayName;
        let selected = true;
        for (const key in selectedLegendNames) {
            if (legendName === key) {
                selected = selectedLegendNames[key];
            }
        }
        const numberValue =
            hash && selected ? toNumber(row[hash]?.value.raw) : 0;
        if (!Number.isNaN(numberValue)) {
            acc += numberValue;
        }
        return acc;
    }, 0);
};

// Stack total row contains:
// - x/y axis value
// - the value 0 to be stacked (hack)
// - the total of that stack to be used in the label
// The x/axis value and the "0" need to flip position if the axis are flipped
const getStackTotalRows = (
    rows: ResultRow[],
    series: EChartSeries[],
    flipAxis: boolean | undefined,
    selectedLegendNames: LegendValues,
): [unknown, unknown, number][] => {
    const isNonStackable = series.some(
        (s) =>
            s.type === CartesianSeriesType.LINE ||
            s.type === CartesianSeriesType.SCATTER,
    );
    if (isNonStackable) return [];
    return rows.map((row) => {
        const total = calculateStackTotal(
            row,
            series,
            flipAxis,
            selectedLegendNames,
        );
        const hash = flipAxis ? series[0].encode?.y : series[0].encode?.x;
        if (!hash) {
            return [null, null, 0];
        }
        return flipAxis
            ? [0, row[hash]?.value.raw, total]
            : [row[hash]?.value.raw, 0, total];
    });
};

// To hack the stack totals in echarts we need to create a fake series with the value 0 and display the total in the label
const getStackTotalSeries = (
    rows: ResultRow[],
    seriesWithStack: EChartSeries[],
    itemsMap: ItemsMap,
    flipAxis: boolean | undefined,
    selectedLegendNames: LegendValues,
) => {
    const seriesGroupedByStack = groupBy(seriesWithStack, 'stack');
    return Object.entries(seriesGroupedByStack).reduce<EChartSeries[]>(
        (acc, [stack, series]) => {
            if (!stack || !series[0] || !series[0].stackLabel?.show) {
                return acc;
            }
            const stackSeries: EChartSeries = {
                type: series[0].type,
                connectNulls: true,
                stack: stack,
                label: {
                    show: series[0].stackLabel?.show,
                    formatter: (param) => {
                        const stackTotal = param.data[2];
                        const fieldId = series[0].pivotReference?.field;
                        if (fieldId) {
                            return getFormattedValue(
                                stackTotal,
                                fieldId,
                                itemsMap,
                            );
                        }
                        return '';
                    },
                    fontWeight: 'bold',
                    position: flipAxis ? 'right' : 'top',
                },
                labelLayout: {
                    hideOverlap: true,
                },
                tooltip: {
                    show: false,
                },
                data: getStackTotalRows(
                    rows,
                    series,
                    flipAxis,
                    selectedLegendNames,
                ),
                yAxisIndex: series[0].yAxisIndex,
            };
            return [...acc, stackSeries];
        },
        [],
    );
};

const useEchartsCartesianConfig = (
    validCartesianConfigLegend?: LegendValues,
    isInDashboard?: boolean,
) => {
    const {
        visualizationConfig,
        pivotDimensions,
        resultsData,
        itemsMap,
        colorPalette,
    } = useVisualizationContext();

    const validCartesianConfig = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig.validConfig;
    }, [visualizationConfig]);

    const [pivotedKeys, nonPivotedKeys] = useMemo(() => {
        if (
            itemsMap &&
            validCartesianConfig &&
            isCompleteLayout(validCartesianConfig.layout)
        ) {
            const yFieldPivotedKeys = validCartesianConfig.layout.yField.filter(
                (yField) =>
                    !itemsMap[yField] ||
                    (itemsMap[yField] && !isDimension(itemsMap[yField])),
            );
            const yFieldNonPivotedKeys =
                validCartesianConfig.layout.yField.filter(
                    (yField) =>
                        !itemsMap[yField] ||
                        (itemsMap[yField] && isDimension(itemsMap[yField])),
                );

            return [
                yFieldPivotedKeys,
                [...yFieldNonPivotedKeys, validCartesianConfig.layout.xField],
            ];
        }
        return [];
    }, [itemsMap, validCartesianConfig]);

    const { rows } = useMemo(() => {
        return getPlottedData(
            resultsData?.rows,
            pivotDimensions,
            pivotedKeys,
            nonPivotedKeys,
        );
    }, [resultsData?.rows, pivotDimensions, pivotedKeys, nonPivotedKeys]);

    const series = useMemo(() => {
        if (!itemsMap || !validCartesianConfig || !resultsData) {
            return [];
        }

        return getEchartsSeries(
            itemsMap,
            validCartesianConfig,
            pivotDimensions,
        );
    }, [validCartesianConfig, resultsData, itemsMap, pivotDimensions]);

    const axis = useMemo(() => {
        if (!itemsMap || !validCartesianConfig) {
            return { xAxis: [], yAxis: [] };
        }

        return getEchartAxis({
            itemsMap,
            series,
            validCartesianConfig,
            resultsData,
        });
    }, [itemsMap, series, validCartesianConfig, resultsData]);

    const stackedSeries = useMemo(() => {
        if (!itemsMap) return;
        const seriesWithValidStack = series.map<EChartSeries>((serie) => ({
            ...serie,
            stack: getValidStack(serie),
        }));
        return [
            ...seriesWithValidStack,
            ...getStackTotalSeries(
                rows,
                seriesWithValidStack,
                itemsMap,
                validCartesianConfig?.layout.flipAxes,
                validCartesianConfigLegend,
            ),
        ];
    }, [
        series,
        rows,
        itemsMap,
        validCartesianConfig?.layout.flipAxes,
        validCartesianConfigLegend,
    ]);

    const colors = useMemo<string[]>(() => {
        //Do not use colors from hidden series
        return validCartesianConfig?.eChartsConfig.series
            ? validCartesianConfig.eChartsConfig.series.reduce<string[]>(
                  (acc, serie, index) => {
                      if (!serie.hidden)
                          return [
                              ...acc,
                              colorPalette[index] ||
                                  getDefaultSeriesColor(index),
                          ];
                      else return acc;
                  },
                  [],
              )
            : colorPalette;
    }, [colorPalette, validCartesianConfig]);

    const sortedResults = useMemo(() => {
        const results =
            validCartesianConfig?.layout?.xField === EMPTY_X_AXIS
                ? getResultValueArray(rows, true).map((s) => ({
                      ...s,
                      [EMPTY_X_AXIS]: ' ',
                  }))
                : getResultValueArray(rows, true);
        try {
            if (!itemsMap) return results;

            const xFieldId = validCartesianConfig?.layout?.xField;
            if (xFieldId === undefined) return results;

            const alreadySorted =
                resultsData?.metricQuery.sorts?.[0]?.fieldId === xFieldId;
            if (alreadySorted) return results;

            const xField = itemsMap[xFieldId];
            const hasTotal = validCartesianConfig?.eChartsConfig?.series?.some(
                (s) => s.stackLabel?.show,
            );

            // If there is a total, we don't sort the results because we need to keep the same order on results
            // This could still cause issues if there is a total on bar chart axis, the sorting is wrong and one of the axis is a line chart
            if (hasTotal) return results;

            if (isCustomDimension(xField)) {
                return results.sort((a, b) => {
                    if (
                        typeof a[xFieldId] === 'string' &&
                        typeof b[xFieldId] === 'string'
                    ) {
                        const startA = parseInt(
                            (a[xFieldId] as string).split('-')[0],
                        );
                        const startB = parseInt(
                            (b[xFieldId] as string).split('-')[0],
                        );
                        return startA - startB;
                    }
                    return 0;
                });
            }
            if (
                xField !== undefined &&
                results.length >= 0 &&
                isDimension(xField) &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    xField.type,
                )
            ) {
                return results.sort((a, b) => {
                    if (
                        typeof a[xFieldId] === 'string' &&
                        typeof b[xFieldId] === 'string'
                    ) {
                        return (a[xFieldId] as string).localeCompare(
                            b[xFieldId] as string,
                        );
                    }
                    return 0;
                });
            }

            return results;
        } catch (e) {
            console.error('Unable to sort date results', e);
            return results;
        }
    }, [
        validCartesianConfig?.layout?.xField,
        validCartesianConfig?.eChartsConfig?.series,
        rows,
        itemsMap,
        resultsData?.metricQuery.sorts,
    ]);

    const tooltip = useMemo<TooltipOption>(
        () => ({
            show: true,
            confine: true,
            trigger: 'axis',
            enterable: true,
            extraCssText: 'overflow-y: auto; max-height:280px;',
            axisPointer: {
                type: 'shadow',
                label: {
                    show: true,
                },
            },
            formatter: (params) => {
                if (!Array.isArray(params) || !itemsMap) return '';

                const tooltipRows = params
                    .map((param) => {
                        const {
                            marker,
                            seriesName,
                            dimensionNames,
                            encode,
                            value,
                        } = param;

                        if (dimensionNames) {
                            const dim =
                                encode?.y[0] !== undefined
                                    ? dimensionNames[encode?.y[0]]
                                    : '';

                            if (typeof value === 'object' && dim in value) {
                                return `
                            <tr>
                                <td>${marker}</td>
                                <td>${seriesName}</td>
                                <td style="text-align: right;"><b>${getFormattedValue(
                                    (value as Record<string, unknown>)[dim],
                                    dim.split('.')[0],
                                    itemsMap,
                                )}</b></td>
                            </tr>
                        `;
                            }
                        }
                        return '';
                    })
                    .join('');

                const dimensionId = params[0].dimensionNames?.[0];

                if (dimensionId !== undefined) {
                    const field = itemsMap[dimensionId];
                    if (isTableCalculation(field)) {
                        const tooltipHeader = formatTableCalculationValue(
                            field as TableCalculation,
                            params[0].axisValueLabel,
                        );

                        return `${tooltipHeader}<br/><table>${tooltipRows}</table>`;
                    }
                    if (
                        isDimension(field) &&
                        (field.type === DimensionType.DATE ||
                            field.type === DimensionType.TIMESTAMP)
                    ) {
                        const date = (params[0].data as Record<string, any>)[
                            dimensionId
                        ]; // get full timestamp from data
                        const dateFormatted = getFormattedValue(
                            date,
                            dimensionId,
                            itemsMap,
                            false,
                        );
                        return `${dateFormatted}<br/><table>${tooltipRows}</table>`;
                    }

                    const hasFormat = isField(field)
                        ? field.format !== undefined
                        : false;

                    if (hasFormat) {
                        const tooltipHeader = getFormattedValue(
                            params[0].axisValueLabel,
                            dimensionId,
                            itemsMap,
                        );

                        return `${tooltipHeader}<br/><table>${tooltipRows}</table>`;
                    }
                }
                return `${params[0].axisValueLabel}<br/><table>${tooltipRows}</table>`;
            },
        }),
        [itemsMap],
    );

    const eChartsOptions = useMemo(
        () => ({
            xAxis: axis.xAxis,
            yAxis: axis.yAxis,
            useUTC: true,
            series: stackedSeries,
            animation: !isInDashboard,
            legend: mergeLegendSettings(
                validCartesianConfig?.eChartsConfig.legend,
                validCartesianConfigLegend,
                series,
            ),
            dataset: {
                id: 'lightdashResults',
                source: sortedResults,
            },
            tooltip,
            grid: {
                ...defaultGrid,
                ...removeEmptyProperties(
                    validCartesianConfig?.eChartsConfig.grid,
                ),
            },
            color: colors,
        }),
        [
            axis.xAxis,
            axis.yAxis,
            stackedSeries,
            isInDashboard,
            validCartesianConfig?.eChartsConfig.legend,
            validCartesianConfig?.eChartsConfig.grid,
            validCartesianConfigLegend,
            series,
            sortedResults,
            tooltip,
            colors,
        ],
    );

    if (
        !itemsMap ||
        series.length <= 0 ||
        rows.length <= 0 ||
        !validCartesianConfig
    ) {
        return undefined;
    }
    return eChartsOptions;
};

export default useEchartsCartesianConfig;
