import {
    applyCustomFormat,
    applyRoundedCornersToStackData,
    assertUnreachable,
    buildCartesianTooltipFormatter,
    calculateDynamicBorderRadius,
    CartesianSeriesType,
    CustomFormatType,
    DimensionType,
    evaluateConditionalFormatExpression,
    formatItemValue,
    formatNumberValue,
    formatValueWithExpression,
    friendlyName,
    getCartesianAxisFormatterConfig as getAxisFormatterConfig,
    getAxisLabelStyle,
    getAxisLineStyle,
    getAxisName,
    getAxisPointerStyle,
    getAxisTickStyle,
    getAxisTitleStyle,
    getBarBorderRadius,
    getBarChartGridStyle,
    getBarStyle,
    getBarTotalLabelStyle,
    getCustomFormatFromLegacy,
    getDateGroupLabel,
    getFormattedValue,
    getIndexFromEncode,
    getItemLabelWithoutTableName,
    getItemType,
    getLineChartGridStyle,
    getReferenceLineStyle,
    getResultValueArray,
    getTooltipStyle,
    getValueLabelStyle,
    hashFieldReference,
    hasValidFormatExpression,
    isCompleteLayout,
    isCustomBinDimension,
    isCustomDimension,
    isCustomSqlDimension,
    isDimension,
    isField,
    isMetric,
    isPivotReferenceWithValues,
    isTableCalculation,
    LightdashParameters,
    MetricType,
    StackType,
    TableCalculationType,
    TimeFrames,
    transformToPercentageStacking,
    valueFormatter,
    XAxisSortType,
    type CartesianChart,
    type CustomDimension,
    type EChartsSeries,
    type Field,
    type Item,
    type ItemsMap,
    type MarkLineData,
    type ParametersValuesMap,
    type PivotReference,
    type PivotValuesColumn,
    type ResultRow,
    type Series,
    type TableCalculation,
    type XAxis,
} from '@lightdash/common';
import { getLegendStyle } from '@lightdash/common/src/visualizations/helpers/styles/legendStyles';
import { useMantineTheme } from '@mantine/core';
import dayjs from 'dayjs';
import {
    type DefaultLabelFormatterCallbackParams,
    type TooltipComponentFormatterCallback,
    type TooltipComponentOption,
} from 'echarts';
import groupBy from 'lodash/groupBy';
import maxBy from 'lodash/maxBy';
import toNumber from 'lodash/toNumber';
import { useMemo } from 'react';
import { isCartesianVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import {
    defaultAxisLabelGap,
    defaultGrid,
} from '../../components/VisualizationConfigs/ChartConfigPanel/Grid/constants';
import { EMPTY_X_AXIS } from '../cartesianChartConfig/useCartesianChartConfig';
import {
    getPivotedDataFromPivotDetails,
    getPlottedData,
    type RowKeyMap,
} from '../plottedData/getPlottedData';
import { type InfiniteQueryResults } from '../useQueryResults';
import {
    computeSeriesColorsWithPop,
    generatePopSeries,
} from './popSeriesUtils';
import { useLegendDoubleClickTooltip } from './useLegendDoubleClickTooltip';

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

export const getAxisTypeFromField = (
    item?: ItemsMap[string],
    hasReferenceLine?: boolean,
): string => {
    if (item && isCustomBinDimension(item)) return 'category';
    if (item && isTableCalculation(item) && !item.type) return 'value';
    if (
        item &&
        (isField(item) ||
            isTableCalculation(item) ||
            isCustomSqlDimension(item))
    ) {
        const type = getItemType(item);
        switch (type) {
            case TableCalculationType.NUMBER:
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
            case MetricType.PERCENT_OF_PREVIOUS:
            case MetricType.PERCENT_OF_TOTAL:
            case MetricType.RUNNING_TOTAL:
                return 'value';
            case DimensionType.TIMESTAMP:
            case MetricType.TIMESTAMP:
            case DimensionType.DATE:
            case MetricType.DATE:
            case TableCalculationType.DATE:
            case TableCalculationType.TIMESTAMP:
                // Use categorical axis for weeks only. Echarts handles the
                // other time frames well with a time axis
                // For week intervals, only switch to time axis if there's a reference line on this specific axis
                if (
                    'timeInterval' in item &&
                    item.timeInterval === TimeFrames.WEEK &&
                    !hasReferenceLine
                ) {
                    return 'category';
                }
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
    const hasReferenceLine = (
        axisId: string | undefined,
        isXAxis: boolean = false,
    ) => {
        if (axisId === undefined) return false;
        return validCartesianConfig.eChartsConfig.series?.some((serie) => {
            if (
                serie.markLine === undefined ||
                serie.markLine.data === undefined ||
                serie.markLine.data.length === 0
            ) {
                return false;
            }

            // Check if any reference line data affects the specified axis
            return serie.markLine.data.some((markData) => {
                if (isXAxis) {
                    // X-axis reference lines are vertical lines (have xAxis value)
                    return markData.xAxis !== undefined;
                } else {
                    // Y-axis reference lines are horizontal lines (have yAxis value)
                    return markData.yAxis !== undefined;
                }
            });
        });
    };
    const topAxisType = getAxisTypeFromField(
        topAxisXId ? itemsMap[topAxisXId] : undefined,
        hasReferenceLine(topAxisXId, true), // X-axis reference lines
    );
    const bottomAxisType =
        bottomAxisXId === EMPTY_X_AXIS
            ? 'category'
            : getAxisTypeFromField(
                  bottomAxisXId ? itemsMap[bottomAxisXId] : undefined,
                  hasReferenceLine(bottomAxisXId, true), // X-axis reference lines
              );
    // horizontal bar chart needs the type 'category' in the left/right axis
    const defaultRightAxisType = getAxisTypeFromField(
        rightAxisYId ? itemsMap[rightAxisYId] : undefined,
        hasReferenceLine(rightAxisYId, false), // Y-axis reference lines
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
        hasReferenceLine(leftAxisYId, false), // Y-axis reference lines
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

const convertPivotValuesColumnsIntoMap = (
    valuesColumns?: PivotValuesColumn[],
) => {
    if (!valuesColumns) return;
    return Object.fromEntries(
        valuesColumns.map((column) => [column.pivotColumnName, column]),
    );
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
    series: EChartsSeries[],
) => {
    const normalizedConfig = removeEmptyProperties(legendConfig);
    if (!normalizedConfig) {
        return {
            show: series.length > 1,
            type: 'scroll',
            orient: 'horizontal',
            top: 0,
            selected: legendsSelected,
        };
    }
    return {
        orient: 'horizontal',
        // After echarts v6, the new default legend is positioned at bottom. We need to keep old behavior in placeholders
        // so we only define top 0 if there is no 'bottom' configuration.
        // spreading `normalizedConfig` will overwrite top value if needed
        top: 'bottom' in normalizedConfig ? undefined : 0,
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

/**
 * Get actual column names for a field ID from pivotDetails.
 * For backend pivoting, rows have pivot column names (e.g., "payments_total_revenue_any_bank_transfer")
 * instead of field IDs (e.g., "payments_total_revenue").
 * This helper maps field IDs to their actual column names in the pivoted data.
 */
const getColumnNamesForField = (
    fieldId: string,
    pivotDetails: InfiniteQueryResults['pivotDetails'],
): string[] => {
    if (!pivotDetails?.valuesColumns) return [fieldId];

    const columnNames = pivotDetails.valuesColumns
        .filter((col) => col.referenceField === fieldId)
        .map((col) => col.pivotColumnName);

    return columnNames.length > 0 ? columnNames : [fieldId];
};

export const getMinAndMaxValues = (
    series: string[] | undefined,
    rows: ResultRow[],
    pivotDetails?: InfiniteQueryResults['pivotDetails'],
): (string | number)[] => {
    if (!series || series.length === 0) return [];

    let rawValues = [];
    for (const s of series) {
        // Get the actual column names to look up (handles backend pivoting)
        const columnNames = getColumnNamesForField(s, pivotDetails);
        for (const columnName of columnNames) {
            for (const row of rows) {
                rawValues.push(row[columnName]?.value.raw);
            }
        }
    }

    return rawValues.reduce<(string | number)[]>(
        (acc, value) => {
            if (
                typeof value === 'string' &&
                dayjs(value, 'YYYY-MM-DD', false).isValid()
            ) {
                // is date
                const min = minDate(acc[0], value);
                const max = maxDate(acc[1], value);

                return [min, max];
            } else if (typeof value === 'string' || typeof value === 'number') {
                // is number or numeric string
                const currentNumber =
                    typeof value === 'string' ? parseFloat(value) : value;
                const currentMin =
                    typeof acc[0] === 'string' ? parseFloat(acc[0]) : acc[0];
                const currentMax =
                    typeof acc[1] === 'string' ? parseFloat(acc[1]) : acc[1];

                if (!isNaN(currentNumber)) {
                    const min =
                        currentNumber < currentMin ? currentNumber : currentMin;
                    const max =
                        currentNumber > currentMax ? currentNumber : currentMax;

                    return [min, max];
                }
            } else {
                // TODO: this case comes up more than it should given that
                // this 'else' wasn't here before. We should maybe use getAxisType
                // for this function
            }
            return acc;
        },
        [0, 0],
    );
};

const getMinAndMaxReferenceLines = (
    leftAxisFieldYIds: string[] | undefined,
    rightAxisYFieldIds: string[] | undefined,
    bottomAxisXFieldIds: string[] | undefined,
    rows: ResultRow[] | undefined,
    series: Series[] | undefined,
    items: ItemsMap,
    pivotDetails?: InfiniteQueryResults['pivotDetails'],
) => {
    if (rows === undefined || series === undefined) return {};
    // Skip method if there are no reference lines
    const hasReferenceLines =
        series.find((serie) => {
            const data = serie.markLine?.data;
            return data !== undefined && data.length > 0;
        }) !== undefined;

    if (!hasReferenceLines) return {};

    const getMinAndMaxReferenceLineValues = (
        axis: string,
        fieldIds: (string | undefined)[] | undefined,
    ): (string | number)[] => {
        const values = series.flatMap<string | number>((serie) => {
            const serieFieldId =
                axis === 'yAxis' ? serie.encode.yRef : serie.encode.xRef;
            if (!fieldIds || !fieldIds.includes(serieFieldId.field)) return [];

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
        leftAxisFieldYIds,
        rows,
        pivotDetails,
    );
    const [minValueRightY, maxValueRightY] = getMinAndMaxValues(
        rightAxisYFieldIds,
        rows,
        pivotDetails,
    );
    const [minValueX, maxValueX] = getMinAndMaxValues(
        bottomAxisXFieldIds,
        rows,
        pivotDetails,
    );

    const [minReferenceLineX, maxReferenceLineX] =
        getMinAndMaxReferenceLineValues('xAxis', bottomAxisXFieldIds);
    const [minReferenceLineLeftY, maxReferenceLineLeftY] =
        getMinAndMaxReferenceLineValues('yAxis', leftAxisFieldYIds);
    const [minReferenceLineRightY, maxReferenceLineRightY] =
        getMinAndMaxReferenceLineValues('yAxis', rightAxisYFieldIds);

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
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null;
    parameters?: ParametersValuesMap;
    isStack100?: boolean;
};

const seriesValueFormatter = (
    item: Item,
    value: unknown,
    parameters?: ParametersValuesMap,
) => {
    if (hasValidFormatExpression(item)) {
        // Check if format uses parameter placeholders
        const hasParameterPlaceholders =
            item.format.includes(`\${${LightdashParameters.PREFIX_SHORT}`) ||
            item.format.includes(`\${${LightdashParameters.PREFIX}`);

        // Evaluate conditional expressions if parameters are provided
        const formatExpression =
            hasParameterPlaceholders && parameters
                ? evaluateConditionalFormatExpression(item.format, parameters)
                : item.format;

        return formatValueWithExpression(formatExpression, value);
    }

    if (isCustomDimension(item)) {
        return value;
    }
    if (isTableCalculation(item)) {
        return formatItemValue(item, value, false, parameters);
    } else {
        const defaultFormatOptions = getCustomFormatFromLegacy({
            format: item.format,
            round: item.round,
            compact: item.compact,
        });
        const formatOptions = isMetric(item) ? item.formatOptions : undefined;
        return applyCustomFormat(value, formatOptions || defaultFormatOptions);
    }
};

/**
 * Format value for 100% stacked charts
 * For stack100, values are already percentages (0-100) so we just append %
 */
const formatStack100Value = (value: unknown): string => {
    return typeof value === 'number'
        ? `${formatNumberValue(value, {
              type: CustomFormatType.NUMBER,
              round: 1,
          })}%`
        : `${value}%`;
};

/**
 * Get the metric from the param
 * @param param - The param
 * @param series - The series
 * @param yFieldHash - The y field hash
 * @param isHorizontal - Whether the chart is horizontal
 * @returns The metric
 */
const getMetricFromParam = (
    param: any,
    series: Series,
    yFieldHash: string,
    isHorizontal: boolean,
) => {
    const v = param?.value;
    // dataset mode (object): use column key directly
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        return v[yFieldHash];
    }

    // tuple mode (array) = when stacked bar charts are used
    if (Array.isArray(v)) {
        const enc = param?.encode ?? series.encode;
        const dimNames: string[] | undefined = param?.dimensionNames;

        // Prefer the actual index of the metric column name
        let metricIdx = dimNames ? dimNames.indexOf(yFieldHash) : -1;
        if (metricIdx < 0) {
            // Fallback: use x for horizontal, y for vertical
            const xIdx = getIndexFromEncode(enc, dimNames, 'x');
            const yIdx = getIndexFromEncode(enc, dimNames, 'y');
            metricIdx = (isHorizontal ? xIdx : yIdx) ?? -1;
        }
        return metricIdx >= 0 ? v[metricIdx] : undefined;
    }

    // primitive
    return v;
};

const isPrimaryYAxis = (series: Series) => {
    return (series.yAxisIndex ?? 0) === 0;
};

const getPivotSeries = ({
    series,
    pivotReference,
    itemsMap,
    xFieldHash,
    yFieldHash,
    flipAxes,
    cartesianChart,
    pivotValuesColumnsMap,
    parameters,
    isStack100,
}: GetPivotSeriesArg): EChartsSeries => {
    const pivotLabel = pivotReference.pivotValues.reduce(
        (acc, { field, value }) => {
            const formattedValue = getFormattedValue(
                value,
                field,
                itemsMap,
                undefined,
                pivotValuesColumnsMap,
                parameters,
            );
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
            valueFormatter: valueFormatter(
                series.encode.yRef.field,
                itemsMap,
                pivotValuesColumnsMap,
                parameters,
            ),
        },
        showSymbol: series.showSymbol ?? true,
        ...(series.label?.show && {
            label: {
                ...series.label,
                ...(series.color &&
                    getValueLabelStyle(series.label.position, series.type)),
                ...(itemsMap &&
                    itemsMap[series.encode.yRef.field] && {
                        formatter: (param: any) => {
                            const field = itemsMap[series.encode.yRef.field];
                            const raw = getMetricFromParam(
                                param,
                                series,
                                yFieldHash,
                                !!flipAxes,
                            );

                            // For 100% stacked bar charts on the primary axis, values are already percentages (0-100)
                            // Only apply stack100 formatting if this series is on yAxisIndex 0
                            if (isStack100 && isPrimaryYAxis(series)) {
                                return formatStack100Value(raw);
                            }

                            return seriesValueFormatter(field, raw, parameters);
                        },
                    }),
            },
            labelLayout: {
                hideOverlap: true,
            },
        }),
    };
};

/**
 * Get the series symbol configuration for a simple series
 * This is used to hide the symbol if showSymbol is false for line and area charts
 *
 * Issue reference: https://github.com/apache/echarts/issues/19178
 */
const getSimpleSeriesSymbolConfig = (series: Series) => {
    const { showSymbol, type } = series;
    switch (type) {
        case CartesianSeriesType.LINE:
        case CartesianSeriesType.AREA:
            return {
                showSymbol: true,
                symbolSize: showSymbol ? 4 : 0,
            };
        case CartesianSeriesType.BAR:
        case CartesianSeriesType.SCATTER:
            return {
                showSymbol: showSymbol ?? true,
            };
        default:
            return assertUnreachable(type, `unexpected series type: ${type}`);
    }
};

type GetSimpleSeriesArg = {
    series: Series;
    itemsMap: ItemsMap;
    flipAxes: boolean | undefined;
    yFieldHash: string;
    xFieldHash: string;
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null;
    parameters?: ParametersValuesMap;
    isStack100?: boolean;
};

const getSimpleSeries = ({
    series,
    flipAxes,
    yFieldHash,
    xFieldHash,
    itemsMap,
    pivotValuesColumnsMap,
    parameters,
    isStack100,
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
        valueFormatter: valueFormatter(
            yFieldHash,
            itemsMap,
            pivotValuesColumnsMap,
            parameters,
        ),
    },
    ...getSimpleSeriesSymbolConfig(series),
    ...(series.label?.show && {
        label: {
            ...series.label,
            // Apply value label styling for all series types
            ...getValueLabelStyle(series.label.position, series.type),
            ...(itemsMap &&
                itemsMap[yFieldHash] && {
                    formatter: (value: any) => {
                        const field = itemsMap[yFieldHash];
                        const v = value?.value;
                        let rawValue: any;

                        // Handle tuple mode (array) vs dataset mode (object)
                        if (Array.isArray(v)) {
                            // Use encode.y to get the right index
                            const yIdx = Array.isArray(value?.encode?.y)
                                ? value.encode.y[0]
                                : value?.encode?.y;
                            rawValue =
                                typeof yIdx === 'number' ? v[yIdx] : v[1];
                        } else if (v && typeof v === 'object') {
                            // Dataset mode: use yFieldHash as key
                            rawValue = v[yFieldHash];
                        } else {
                            rawValue = v;
                        }

                        // For 100% stacked charts on the primary axis, values are already percentages (0-100)
                        // Only apply stack100 formatting if this series is on yAxisIndex 0
                        if (isStack100 && (series.yAxisIndex ?? 0) === 0) {
                            return formatStack100Value(rawValue);
                        }

                        return seriesValueFormatter(
                            field,
                            rawValue,
                            parameters,
                        );
                    },
                }),
        },
        labelLayout: {
            hideOverlap: true,
        },
    }),
    ...(series.markLine && {
        markLine: {
            ...series.markLine,
            ...getReferenceLineStyle(series.color),
        },
    }),
});

// New series generation for pre-pivoted data from backend
const getEchartsSeriesFromPivotedData = (
    itemsMap: ItemsMap,
    cartesianChart: CartesianChart,
    rowKeyMap: RowKeyMap,
    pivotValuesColumnsMap?:
        | Record<string, PivotValuesColumn>
        | null
        | undefined,
    parameters?: ParametersValuesMap,
): EChartsSeries[] => {
    // Check if 100% stacking is enabled
    const isStack100 = cartesianChart.layout.stack === StackType.PERCENT;

    // Use pivotDetails to find the correct column name for each series
    const findMatchingColumnName = (series: Series): string | undefined => {
        if (isPivotReferenceWithValues(series.encode.yRef)) {
            const yRef = series.encode.yRef;
            const valuesColumn = Object.values(
                pivotValuesColumnsMap || {},
            ).find((col) => {
                return (
                    col.referenceField === yRef.field &&
                    col.pivotValues.length === yRef.pivotValues.length &&
                    col.pivotValues.every(
                        (pv, idx) => pv.value === yRef.pivotValues[idx].value,
                    )
                );
            });

            if (valuesColumn) {
                return valuesColumn.pivotColumnName;
            }
        }

        // For non-pivoted fields (like the index column), use the field name directly
        return series.encode.yRef.field;
    };

    const allSeries = cartesianChart.eChartsConfig.series || [];

    // Don't sort here - series order is already set correctly by useCartesianChartConfig
    // which respects the user's columnOrder preference
    const resultSeries = allSeries
        .filter((s) => !s.hidden)
        .map<EChartsSeries>((series) => {
            const { flipAxes } = cartesianChart.layout;
            const xFieldHash = hashFieldReference(series.encode.xRef);

            // Find the actual column name in the data
            const actualYFieldName = findMatchingColumnName(series);
            const yFieldHash =
                actualYFieldName || hashFieldReference(series.encode.yRef);

            // For pre-pivoted data, check if this is a pivoted column
            const yFieldReference = rowKeyMap[yFieldHash];

            if (
                yFieldReference &&
                typeof yFieldReference === 'object' &&
                'pivotValues' in yFieldReference &&
                yFieldReference.pivotValues
            ) {
                // This is a pivoted column, use the pivot reference
                return getPivotSeries({
                    series,
                    itemsMap,
                    cartesianChart,
                    pivotReference: yFieldReference as Required<PivotReference>,
                    flipAxes,
                    xFieldHash,
                    yFieldHash,
                    pivotValuesColumnsMap,
                    parameters,
                    isStack100,
                });
            }

            // Simple series for non-pivoted columns
            return getSimpleSeries({
                series,
                itemsMap,
                flipAxes,
                yFieldHash,
                xFieldHash,
                pivotValuesColumnsMap,
                parameters,
                isStack100,
            });
        });

    return resultSeries;
};

const getEchartsSeries = (
    itemsMap: ItemsMap,
    cartesianChart: CartesianChart,
    pivotKeys: string[] | undefined,
    parameters?: ParametersValuesMap,
): EChartsSeries[] => {
    // Check if 100% stacking is enabled
    const isStack100 = cartesianChart.layout.stack === StackType.PERCENT;

    return (cartesianChart.eChartsConfig.series || [])
        .filter((s) => !s.hidden)
        .map<EChartsSeries>((series) => {
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
                    parameters,
                    isStack100,
                });
            }

            return getSimpleSeries({
                series,
                itemsMap,
                flipAxes,
                yFieldHash,
                xFieldHash,
                parameters,
                isStack100,
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

const findLongest = (strings: string[]): string | undefined =>
    strings.length > 0 ? maxBy(strings, 'length') : undefined;

const getLongestLabel = ({
    rows = [],
    axisId,
}: {
    rows?: ResultRow[];
    axisId?: string;
}): string | undefined => {
    if (!axisId || rows.length === 0) return undefined;

    const directValues = rows
        .map((row) => row[axisId]?.value.formatted)
        .filter((v): v is string => v !== undefined);

    if (directValues.length > 0) return findLongest(directValues);

    // If no direct match, check if this is a hashed field reference with pivot values
    // In that case, we need to find all row keys that could be pivot variants of this field
    const baseField = axisId.split('.')[0];

    const allValues: string[] = [];
    rows.forEach((row) => {
        Object.keys(row).forEach((key) => {
            if (key.startsWith(baseField)) {
                const formatted = row[key]?.value.formatted;
                if (formatted) {
                    allValues.push(formatted);
                }
            }
        });
    });

    return findLongest(allValues);
};

const getWeekAxisConfig = (
    axisId?: string,
    axisField?: Field | TableCalculation | CustomDimension,
    rows?: ResultRow[],
    axisType?: string,
) => {
    if (!axisId || !rows || !axisField) return {};
    if (
        'timeInterval' in axisField &&
        axisField.timeInterval === TimeFrames.WEEK &&
        axisType === 'category' // Only apply week config for category axes
    ) {
        const [minX, maxX] = getMinAndMaxValues([axisId], rows || []);
        const continuousWeekRange = [];
        let nextDate = dayjs.utc(minX);
        while (nextDate.isBefore(dayjs(maxX))) {
            continuousWeekRange.push(nextDate.format());
            nextDate = nextDate.add(1, 'week');
        }
        continuousWeekRange.push(dayjs.utc(maxX).format());
        return {
            data: continuousWeekRange,
            axisTick: { alignWithLabel: true, interval: 0 },
        };
    } else {
        return {};
    }
};

const getEchartAxes = ({
    itemsMap,
    validCartesianConfig,
    series,
    resultsData,
    minsAndMaxes,
    parameters,
}: {
    validCartesianConfig: CartesianChart;
    itemsMap: ItemsMap;
    series: EChartsSeries[];
    resultsData: InfiniteQueryResults | undefined;
    minsAndMaxes: ReturnType<typeof getResultValueArray>['minsAndMaxes'];
    parameters?: ParametersValuesMap;
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

    const showGridX = !!validCartesianConfig.layout.showGridX;
    const showGridY =
        validCartesianConfig.layout.showGridY !== undefined
            ? validCartesianConfig.layout.showGridY
            : true;

    const showXAxis =
        validCartesianConfig.layout.showXAxis !== undefined
            ? validCartesianConfig.layout.showXAxis
            : true;
    const showYAxis =
        validCartesianConfig.layout.showYAxis !== undefined
            ? validCartesianConfig.layout.showYAxis
            : true;

    const hasBarChart = series.some((s) => s.type === CartesianSeriesType.BAR);
    const gridStyle = hasBarChart
        ? getBarChartGridStyle()
        : getLineChartGridStyle();

    // There is no Top x axis when no flipped
    // Use base field ID for itemsMap lookups (axis formatting).
    // For min/max value lookups, pivotDetails maps these to actual column names.
    const topAxisXFieldIds = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig.series
              ?.filter((serie) => serie.yAxisIndex === 1)
              .map((s) => s.encode.yRef.field)
        : undefined;

    const topAxisXId = topAxisXFieldIds?.[0] || undefined;

    const bottomAxisXFieldIds = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.eChartsConfig.series
              ?.filter((serie) => serie.yAxisIndex === 0)
              .map((s) => s.encode.yRef.field)
        : [];

    const bottomAxisXId = bottomAxisXFieldIds?.[0] || xAxisItemId;

    const longestValueXAxisTop: string | undefined = getLongestLabel({
        rows: resultsData?.rows,
        axisId: topAxisXId,
    });

    const longestValueXAxisBottom: string | undefined = getLongestLabel({
        rows: resultsData?.rows,
        axisId: bottomAxisXId,
    });

    const leftAxisYFieldIds = validCartesianConfig.layout.flipAxes
        ? validCartesianConfig.layout?.xField
            ? [validCartesianConfig.layout?.xField]
            : []
        : validCartesianConfig.eChartsConfig.series
              ?.filter((serie) => serie.yAxisIndex === 0)
              .map((s) => s.encode.yRef.field);

    const leftAxisYId = leftAxisYFieldIds?.[0] || yAxisItemId;

    // There is no right Y axis when flipped
    const rightAxisYFieldIds = validCartesianConfig.eChartsConfig.series
        ?.filter((serie) => serie.yAxisIndex === 1)
        .map((s) => s.encode.yRef.field);

    const rightAxisYId =
        rightAxisYFieldIds?.[0] || validCartesianConfig.layout?.yField?.[1];

    const longestValueYAxisLeft: string | undefined = getLongestLabel({
        rows: resultsData?.rows,
        axisId: leftAxisYId,
    });
    const leftYaxisGap = calculateWidthText(longestValueYAxisLeft);

    const longestValueYAxisRight: string | undefined = getLongestLabel({
        rows: resultsData?.rows,
        axisId: rightAxisYId,
    });
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
        leftAxisYFieldIds,
        rightAxisYFieldIds,
        bottomAxisXFieldIds,
        resultsData?.rows,
        validCartesianConfig.eChartsConfig.series,
        itemsMap,
        resultsData?.pivotDetails,
    );
    const bottomAxisExtraConfig = getWeekAxisConfig(
        bottomAxisXId,
        bottomAxisXField,
        resultsData?.rows,
        bottomAxisType,
    );
    const topAxisExtraConfig = getWeekAxisConfig(
        topAxisXId,
        topAxisXField,
        resultsData?.rows,
        topAxisType,
    );
    const rightAxisExtraConfig = getWeekAxisConfig(
        rightAxisYId,
        rightAxisYField,
        resultsData?.rows,
        rightAxisType,
    );
    const leftAxisExtraConfig = getWeekAxisConfig(
        leftAxisYId,
        leftAxisYField,
        resultsData?.rows,
        leftAxisType,
    );

    const bottomAxisFormatterConfig = getAxisFormatterConfig({
        axisItem: bottomAxisXField,
        longestLabelWidth: calculateWidthText(longestValueXAxisBottom),
        rotate: xAxisConfiguration?.[0]?.rotate,
        defaultNameGap: 30,
        show: showXAxis,
        parameters,
    });
    const bottomAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        bottomAxisFormatterConfig,
        showXAxis && bottomAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(),
                      ...bottomAxisFormatterConfig.axisLabel,
                  },
              }
            : {},
    );

    const topAxisFormatterConfig = getAxisFormatterConfig({
        axisItem: topAxisXField,
        longestLabelWidth: calculateWidthText(longestValueXAxisTop),
        defaultNameGap: 30,
        show: showXAxis,
        parameters,
    });
    const topAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        topAxisFormatterConfig,
        showXAxis && topAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(),
                      ...topAxisFormatterConfig.axisLabel,
                  },
              }
            : {},
    );

    const leftAxisFormatterConfig = getAxisFormatterConfig({
        axisItem: leftAxisYField,
        defaultNameGap: leftYaxisGap + defaultAxisLabelGap,
        show: showYAxis,
        parameters,
    });
    const leftAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        leftAxisFormatterConfig,
        showYAxis && leftAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(),
                      ...leftAxisFormatterConfig.axisLabel,
                  },
              }
            : {},
    );

    const rightAxisFormatterConfig = getAxisFormatterConfig({
        axisItem: rightAxisYField,
        defaultNameGap: rightYaxisGap + defaultAxisLabelGap,
        show: showYAxis,
        parameters,
    });
    const rightAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        rightAxisFormatterConfig,
        showYAxis && rightAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(),
                      ...rightAxisFormatterConfig.axisLabel,
                  },
              }
            : {},
    );

    const bottomAxisOffset = {
        enabled:
            !!xAxisConfiguration?.[0]?.minOffset ||
            !!xAxisConfiguration?.[0]?.maxOffset,
        minOffset:
            xAxisConfiguration?.[0]?.minOffset !== undefined
                ? parseFloat(xAxisConfiguration?.[0].minOffset)
                : undefined,
        maxOffset:
            xAxisConfiguration?.[0]?.maxOffset !== undefined
                ? parseFloat(xAxisConfiguration?.[0].maxOffset)
                : undefined,
    };

    // Get the min and max values for the bottom X axis
    const getMinAndMaxFromBottomAxisBounds = (
        axisType: 'value' | 'category' | 'time' | string,
        min?: number,
        max?: number,
    ) => {
        if (axisType === 'value') {
            const initialBottomAxisMin =
                xAxisConfiguration?.[0]?.min ??
                referenceLineMinX ??
                maybeGetAxisDefaultMinValue(allowFirstAxisDefaultRange);

            const initialBottomAxisMax =
                xAxisConfiguration?.[0]?.max ??
                referenceLineMaxX ??
                maybeGetAxisDefaultMaxValue(allowFirstAxisDefaultRange);

            // Apply offset to the min and max values of the axis
            if (
                bottomAxisOffset.enabled &&
                min !== undefined &&
                max !== undefined
            ) {
                const minX =
                    xAxisConfiguration?.[0]?.min !== undefined
                        ? parseFloat(xAxisConfiguration?.[0]?.min)
                        : min;
                const maxX =
                    xAxisConfiguration?.[0]?.max !== undefined
                        ? parseFloat(xAxisConfiguration?.[0]?.max)
                        : max;

                // Apply logarithmic scaling to the range to determine offsets
                // This is helpful when the range is very large, but also accomodates small ranges
                const logRange = Number(Math.log1p(maxX - minX).toFixed(0));

                // Baseline offset to ensure minimum value
                const baselineOffset = 0.5;

                let minOffset =
                    ((bottomAxisOffset.minOffset ?? 0) / 100) * logRange +
                    baselineOffset;
                let maxOffset =
                    ((bottomAxisOffset.maxOffset ?? 0) / 100) * logRange +
                    baselineOffset;

                return {
                    min: minX - minOffset,
                    max: maxX + maxOffset,
                };
            }
            return {
                min: initialBottomAxisMin,
                max: initialBottomAxisMax,
            };
        }

        // For category and time axis, we don't need to apply the offset
        return {
            min: undefined,
            max: undefined,
        };
    };

    const { minValue: bottomAxisMinValue, maxValue: bottomAxisMaxValue } =
        bottomAxisOffset.enabled &&
        xAxisItemId &&
        minsAndMaxes &&
        minsAndMaxes[xAxisItemId]
            ? // Find the min and max values for the axis if the offset is enabled
              {
                  minValue: minsAndMaxes[xAxisItemId].min,
                  maxValue: minsAndMaxes[xAxisItemId].max,
              }
            : {
                  minValue: undefined,
                  maxValue: undefined,
              };

    // Check if 100% stacking is enabled
    const stackValue = validCartesianConfig.layout?.stack;
    const shouldStack100 = stackValue === StackType.PERCENT;

    const bottomAxisBounds = getMinAndMaxFromBottomAxisBounds(
        bottomAxisType,
        bottomAxisMinValue,
        bottomAxisMaxValue,
    );

    // For 100% stacking with flipped axes, set X-axis max to 100
    const maxXAxisValue =
        bottomAxisType === 'value'
            ? shouldStack100 && validCartesianConfig.layout.flipAxes
                ? 100 // For 100% stacking with flipped axes, max is always 100
                : bottomAxisBounds.max
            : undefined;

    const maxYAxisValue =
        leftAxisType === 'value'
            ? shouldStack100 && !validCartesianConfig.layout.flipAxes
                ? 100 // For 100% stacking without flipped axes, max is always 100
                : yAxisConfiguration?.[0]?.max ||
                  referenceLineMaxLeftY ||
                  maybeGetAxisDefaultMaxValue(allowFirstAxisDefaultRange)
            : undefined;

    const minYAxisValue =
        leftAxisType === 'value'
            ? yAxisConfiguration?.[0]?.min ||
              referenceLineMinLeftY ||
              maybeGetAxisDefaultMinValue(allowFirstAxisDefaultRange)
            : undefined;

    const showSecondaryXAxis = validCartesianConfig.layout.flipAxes
        ? topAxisXFieldIds && topAxisXFieldIds.length > 0
        : false;
    const showSecondaryYAxis = !validCartesianConfig.layout.flipAxes
        ? rightAxisYFieldIds && rightAxisYFieldIds.length > 0
        : false;

    return {
        xAxis: [
            {
                type: bottomAxisType,
                ...(showXAxis
                    ? {
                          name: validCartesianConfig.layout.flipAxes
                              ? getAxisName({
                                    isAxisTheSameForAllSeries,
                                    selectedAxisIndex,
                                    axisIndex: 0,
                                    axisReference: 'yRef',
                                    axisName: xAxisConfiguration?.[0]?.name,
                                    itemsMap,
                                    series: validCartesianConfig.eChartsConfig
                                        .series,
                                })
                              : xAxisConfiguration?.[0]?.name ||
                                (xAxisItem
                                    ? getDateGroupLabel(xAxisItem) ||
                                      getItemLabelWithoutTableName(xAxisItem)
                                    : undefined),
                          nameLocation: 'center',
                          nameTextStyle: getAxisTitleStyle(),
                      }
                    : {}),
                ...bottomAxisConfigWithStyle,
                splitLine: validCartesianConfig.layout.flipAxes
                    ? showGridY
                        ? gridStyle
                        : { show: false }
                    : showGridX
                    ? gridStyle
                    : { show: false },
                axisLine: getAxisLineStyle(),
                axisTick: getAxisTickStyle(
                    validCartesianConfig?.eChartsConfig?.showAxisTicks,
                ),
                // Override formatter for 100% stacking with flipped axes
                ...(shouldStack100 &&
                    validCartesianConfig.layout.flipAxes &&
                    showXAxis && {
                        axisLabel: {
                            ...(bottomAxisConfigWithStyle.axisLabel || {}),
                            formatter: '{value}%',
                        },
                    }),
                // Override axisLabel settings when scrollable is enabled (not flipped)
                ...(!validCartesianConfig.layout.flipAxes &&
                    (xAxisConfiguration?.[0] as XAxis | undefined)
                        ?.enableDataZoom &&
                    bottomAxisType === 'category' &&
                    showXAxis && {
                        axisLabel: {
                            ...(bottomAxisConfigWithStyle.axisLabel || {}),
                            interval: 0,
                            // Keep hideOverlap true to avoid overlapping when labels are long on X axis
                            hideOverlap: true,
                        },
                    }),
                inverse: !!xAxisConfiguration?.[0].inverse,
                ...bottomAxisExtraConfig,
                min: bottomAxisBounds.min,
                max: maxXAxisValue,
            },
            {
                type: topAxisType,
                show: showSecondaryXAxis,
                ...(showXAxis
                    ? {
                          name: validCartesianConfig.layout.flipAxes
                              ? getAxisName({
                                    isAxisTheSameForAllSeries,
                                    selectedAxisIndex,
                                    axisIndex: 1,
                                    axisReference: 'yRef',
                                    axisName: xAxisConfiguration?.[1]?.name,
                                    itemsMap,
                                    series: validCartesianConfig.eChartsConfig
                                        .series,
                                })
                              : undefined,
                          nameLocation: 'center',
                          nameTextStyle: getAxisTitleStyle(),
                      }
                    : {}),
                min:
                    topAxisType === 'value'
                        ? xAxisConfiguration?.[1]?.min ||
                          maybeGetAxisDefaultMinValue(
                              allowSecondAxisDefaultRange,
                          )
                        : undefined,
                max:
                    topAxisType === 'value'
                        ? xAxisConfiguration?.[1]?.max ||
                          maybeGetAxisDefaultMaxValue(
                              allowSecondAxisDefaultRange,
                          )
                        : undefined,
                ...topAxisConfigWithStyle,
                splitLine: isAxisTheSameForAllSeries
                    ? gridStyle
                    : { show: false },
                axisLine: getAxisLineStyle(),
                axisTick: getAxisTickStyle(
                    validCartesianConfig?.eChartsConfig?.showAxisTicks,
                ),
                inverse: !!xAxisConfiguration?.[1]?.inverse,
                ...topAxisExtraConfig,
            },
        ],
        yAxis: [
            {
                type: leftAxisType,
                ...(showYAxis
                    ? {
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
                                    series: validCartesianConfig.eChartsConfig
                                        .series,
                                }),
                          nameLocation: 'center',
                          nameTextStyle: {
                              ...getAxisTitleStyle(),
                              align: 'center',
                          },
                      }
                    : {}),
                min: minYAxisValue,
                max: maxYAxisValue,
                ...leftAxisConfigWithStyle,
                // Override formatter for 100% stacking without flipped axes
                ...(shouldStack100 &&
                    !validCartesianConfig.layout.flipAxes &&
                    showYAxis && {
                        axisLabel: {
                            ...(leftAxisConfigWithStyle.axisLabel || {}),
                            formatter: '{value}%',
                        },
                    }),
                // Override axisLabel settings when scrollable is enabled and axes are flipped
                ...(validCartesianConfig.layout.flipAxes &&
                    (yAxisConfiguration?.[0] as XAxis | undefined)
                        ?.enableDataZoom &&
                    leftAxisType === 'category' &&
                    showYAxis && {
                        axisLabel: {
                            ...(leftAxisConfigWithStyle.axisLabel || {}),
                            interval: 0,
                            // Set hideOverlap to false to avoid hiding labels
                            hideOverlap: false,
                        },
                    }),
                splitLine: validCartesianConfig.layout.flipAxes
                    ? showGridX
                        ? gridStyle
                        : { show: false }
                    : showGridY
                    ? gridStyle
                    : { show: false },
                axisLine: getAxisLineStyle(),
                axisTick: getAxisTickStyle(
                    validCartesianConfig?.eChartsConfig?.showAxisTicks,
                ),
                inverse: !!yAxisConfiguration?.[0].inverse,
                ...leftAxisExtraConfig,
            },
            {
                type: rightAxisType,
                show: showSecondaryYAxis,
                ...(showYAxis
                    ? {
                          name: validCartesianConfig.layout.flipAxes
                              ? yAxisConfiguration?.[1]?.name
                              : getAxisName({
                                    isAxisTheSameForAllSeries,
                                    selectedAxisIndex,
                                    axisIndex: 1,
                                    axisReference: 'yRef',
                                    axisName: yAxisConfiguration?.[1]?.name,
                                    itemsMap,
                                    series: validCartesianConfig.eChartsConfig
                                        .series,
                                }),
                          nameLocation: 'center',
                          nameRotate: -90,
                          nameTextStyle: {
                              ...getAxisTitleStyle(),
                              align: 'center',
                          },
                      }
                    : {}),
                min:
                    rightAxisType === 'value'
                        ? yAxisConfiguration?.[1]?.min ||
                          referenceLineMinRightY ||
                          maybeGetAxisDefaultMinValue(
                              allowSecondAxisDefaultRange,
                          )
                        : undefined,
                max:
                    rightAxisType === 'value'
                        ? yAxisConfiguration?.[1]?.max ||
                          referenceLineMaxRightY ||
                          maybeGetAxisDefaultMaxValue(
                              allowSecondAxisDefaultRange,
                          )
                        : undefined,
                ...rightAxisConfigWithStyle,
                splitLine: isAxisTheSameForAllSeries
                    ? gridStyle
                    : { show: false },
                axisLine: getAxisLineStyle(),
                axisTick: getAxisTickStyle(
                    validCartesianConfig?.eChartsConfig?.showAxisTicks,
                ),
                inverse: !!yAxisConfiguration?.[1]?.inverse,
                ...rightAxisExtraConfig,
            },
        ],
    };
};

const getValidStack = (series: EChartsSeries | undefined) => {
    return series && (series.type === 'bar' || !!series.areaStyle)
        ? series.stack
        : undefined;
};

type LegendValues = { [name: string]: boolean } | undefined;

const calculateStackTotal = (
    row: ResultRow,
    series: EChartsSeries[],
    flipAxis: boolean | undefined,
    selectedLegendNames: LegendValues,
) => {
    return series.reduce<number>((acc, s) => {
        const hash = flipAxis ? s.encode?.x : s.encode?.y;
        const legendName = s.name || s.dimensions?.[1]?.displayName;
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
    series: EChartsSeries[],
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
    seriesWithStack: EChartsSeries[],
    itemsMap: ItemsMap,
    flipAxis: boolean | undefined,
    selectedLegendNames: LegendValues,
) => {
    const seriesGroupedByStack = groupBy(seriesWithStack, 'stack');
    return Object.entries(seriesGroupedByStack).reduce<EChartsSeries[]>(
        (acc, [stack, series]) => {
            if (!stack || !series[0] || !series[0].stackLabel?.show) {
                return acc;
            }
            const stackSeries: EChartsSeries = {
                type: series[0].type,
                connectNulls: true,
                stack: stack,
                label: {
                    ...getBarTotalLabelStyle(),
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
        getSeriesColor,
        minimal,
        parameters,
    } = useVisualizationContext();

    const theme = useMantineTheme();

    const validCartesianConfig = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig.validConfig;
    }, [visualizationConfig]);

    const tooltipConfig = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig.tooltip;
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

    const pivotValuesColumnsMap = useMemo(() => {
        if (!resultsData?.pivotDetails) return;
        return convertPivotValuesColumnsIntoMap(
            resultsData.pivotDetails.valuesColumns,
        );
    }, [resultsData?.pivotDetails]);

    const { rows, rowKeyMap } = useMemo(() => {
        if (resultsData?.pivotDetails) {
            return getPivotedDataFromPivotDetails(resultsData, undefined);
        }

        // Legacy implementation - comment out when fully migrated
        return getPlottedData(
            resultsData?.rows,
            pivotDimensions,
            pivotedKeys,
            nonPivotedKeys,
        );
    }, [resultsData, pivotDimensions, pivotedKeys, nonPivotedKeys]);

    const baseSeries = useMemo(() => {
        if (!itemsMap || !validCartesianConfig || !resultsData) {
            return [];
        }

        // Use new series generation for pre-pivoted data
        if (resultsData?.pivotDetails && rowKeyMap) {
            return getEchartsSeriesFromPivotedData(
                itemsMap,
                validCartesianConfig,
                rowKeyMap,
                pivotValuesColumnsMap,
                parameters,
            );
        }

        // Legacy implementation
        return getEchartsSeries(
            itemsMap,
            validCartesianConfig,
            pivotDimensions,
            parameters,
        );
    }, [
        validCartesianConfig,
        resultsData,
        itemsMap,
        pivotDimensions,
        rowKeyMap,
        pivotValuesColumnsMap,
        parameters,
    ]);

    // Generate period-over-period comparison series
    // Creates dashed line series for _previous suffixed metrics returned by the backend
    const series = useMemo(() => {
        if (!resultsData?.metricQuery?.periodOverPeriod || !baseSeries.length) {
            return baseSeries;
        }

        return generatePopSeries({
            baseSeries,
            periodOverPeriod: resultsData.metricQuery.periodOverPeriod,
            resultsColumns: resultsData.columns,
            metrics: resultsData.metricQuery.metrics || [],
        });
    }, [baseSeries, resultsData]);

    const resultsAndMinsAndMaxes = useMemo(
        () => getResultValueArray(rows, true, true),
        [rows],
    );

    const axes = useMemo(() => {
        if (!itemsMap || !validCartesianConfig) {
            return { xAxis: [], yAxis: [] };
        }

        return getEchartAxes({
            itemsMap,
            series,
            validCartesianConfig,
            resultsData,
            minsAndMaxes: resultsAndMinsAndMaxes.minsAndMaxes,
            parameters,
        });
    }, [
        itemsMap,
        validCartesianConfig,
        series,
        resultsData,
        resultsAndMinsAndMaxes.minsAndMaxes,
        parameters,
    ]);

    const stackedSeriesWithColorAssignments = useMemo(() => {
        if (!itemsMap) return;

        const isHorizontal = Boolean(validCartesianConfig?.layout.flipAxes);

        // Calculate dynamic border radius based on chart characteristics
        const barSeries = series.filter(
            (s) => s.type === CartesianSeriesType.BAR,
        );
        const isStacked = barSeries.some((s) => s.stack);
        const nonStackedBarCount = isStacked
            ? barSeries.filter((s) => !s.stack).length
            : barSeries.length;

        const dynamicRadius = calculateDynamicBorderRadius(
            rows.length,
            Math.max(1, nonStackedBarCount),
            isStacked,
            isHorizontal,
        );

        // Compute colors for all series (handles PoP series with sibling color + opacity)
        const seriesColors = computeSeriesColorsWithPop({
            series,
            getSeriesColor,
        });

        const seriesWithValidStack = series.map<EChartsSeries>(
            (serie, index) => {
                const computedColor = seriesColors[index];

                const baseConfig = {
                    ...serie,
                    color: computedColor,
                    stack: getValidStack(serie),
                    // Ensure label styles are applied after color is known
                    ...(serie.label?.show && {
                        label: {
                            ...serie.label,
                            ...getValueLabelStyle(
                                serie.label.position,
                                serie.type,
                            ),
                        },
                    }),
                    // Apply reference line styling
                    ...(serie.markLine && {
                        markLine: {
                            ...serie.markLine,
                            ...getReferenceLineStyle(computedColor),
                        },
                    }),
                };

                // Apply bar styling for bar charts
                if (serie.type === CartesianSeriesType.BAR) {
                    return {
                        ...baseConfig,
                        ...getBarStyle(),
                        // Non-stacked bars get border radius on all bars
                        ...((!serie.stack ||
                            getValidStack(serie) === undefined) && {
                            itemStyle: {
                                borderRadius: getBarBorderRadius(
                                    isHorizontal,
                                    true,
                                    dynamicRadius,
                                ),
                            },
                        }),
                    };
                }

                return baseConfig;
            },
        );

        // Apply border radius to stacked bar charts (only regular stacked, not 100%)
        const isStack100 =
            validCartesianConfig?.layout?.stack === StackType.PERCENT;

        const isStackNone =
            validCartesianConfig?.layout?.stack === StackType.NONE;

        const stackedBarSeries = seriesWithValidStack.filter(
            (s) =>
                s.type === CartesianSeriesType.BAR &&
                s.stack &&
                !isStack100 &&
                !isStackNone,
        );

        const seriesWithRoundedStacks =
            stackedBarSeries.length > 0
                ? applyRoundedCornersToStackData(seriesWithValidStack, rows, {
                      radius: dynamicRadius,
                      isHorizontal: !!isHorizontal,
                      legendSelected: validCartesianConfigLegend,
                  })
                : seriesWithValidStack;

        return [
            ...seriesWithRoundedStacks,
            ...getStackTotalSeries(
                rows,
                seriesWithRoundedStacks,
                itemsMap,
                validCartesianConfig?.layout.flipAxes,
                validCartesianConfigLegend,
            ),
        ];
    }, [
        itemsMap,
        validCartesianConfig?.layout.flipAxes,
        validCartesianConfig?.layout?.stack,
        series,
        rows,
        validCartesianConfigLegend,
        getSeriesColor,
    ]);
    const sortedResults = useMemo(() => {
        const results =
            validCartesianConfig?.layout?.xField === EMPTY_X_AXIS
                ? resultsAndMinsAndMaxes.results.map((s) => ({
                      ...s,
                      [EMPTY_X_AXIS]: ' ',
                  }))
                : resultsAndMinsAndMaxes.results;

        try {
            if (!itemsMap) return results;
            // Get the field that represents the X-axis visually
            const xFieldId = validCartesianConfig?.layout.flipAxes
                ? validCartesianConfig?.layout?.yField?.[0]
                : validCartesianConfig?.layout?.xField;

            if (xFieldId === undefined) return results;
            const { min, max } = axes.xAxis[0];

            const hasCustomRange =
                (min !== undefined || max !== undefined) &&
                (typeof min === 'string' || typeof max === 'string');

            const resultsInRange = hasCustomRange
                ? results.filter((result) => {
                      const value = result[xFieldId];
                      if (!value) return true;

                      const isGreaterThan =
                          min === undefined ||
                          typeof min !== 'string' ||
                          value >= min;

                      return isGreaterThan;
                  })
                : results;

            const alreadySorted =
                resultsData?.metricQuery?.sorts?.[0]?.fieldId === xFieldId;
            if (alreadySorted) return resultsInRange;

            const xField = itemsMap[xFieldId];
            const hasTotal = validCartesianConfig?.eChartsConfig?.series?.some(
                (s) => s.stackLabel?.show,
            );

            // If there is a total, we don't sort the results because we need to keep the same order on results
            // This could still cause issues if there is a total on bar chart axis, the sorting is wrong and one of the axis is a line chart
            if (hasTotal) return resultsInRange;

            if (isCustomDimension(xField)) {
                return resultsInRange.sort((a, b) => {
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
                resultsInRange.length >= 0 &&
                isDimension(xField) &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    xField.type,
                )
            ) {
                return resultsInRange.sort((a, b) => {
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

            return resultsInRange;
        } catch (e) {
            console.error('Unable to sort date results', e);
            return results;
        }
    }, [
        validCartesianConfig?.layout?.xField,
        validCartesianConfig?.layout.flipAxes,
        validCartesianConfig?.layout?.yField,
        validCartesianConfig?.eChartsConfig?.series,
        resultsAndMinsAndMaxes.results,
        itemsMap,
        axes.xAxis,
        resultsData?.metricQuery?.sorts,
    ]);

    const { xAxisSortedResults, xAxisSortedCategoryValues } = useMemo(() => {
        if (!stackedSeriesWithColorAssignments?.length) {
            return {
                xAxisSortedResults: sortedResults,
                xAxisSortedCategoryValues: undefined,
            };
        }

        const axis = validCartesianConfig?.layout.flipAxes
            ? axes.yAxis[0]
            : axes.xAxis[0];

        const xFieldId = validCartesianConfig?.layout?.xField;
        const xAxisConfig = validCartesianConfig?.eChartsConfig.xAxis?.[0];

        // Handle bar totals sorting
        if (
            xFieldId &&
            axis?.type === 'category' &&
            xAxisConfig?.sortType === XAxisSortType.BAR_TOTALS
        ) {
            const stackTotalValueIndex = validCartesianConfig?.layout.flipAxes
                ? 1
                : 0;

            const stackTotals = getStackTotalRows(
                rows,
                stackedSeriesWithColorAssignments,
                validCartesianConfig?.layout.flipAxes,
                validCartesianConfigLegend,
            );

            // Using entries since we cannot use a map here (cannot index with unknown)
            // Also grouping by here since when there are no groups in the config we need to calculate the totals for bar
            const stackTotalEntries: [unknown, number][] = Object.entries(
                groupBy(stackTotals, (total) => total[stackTotalValueIndex]),
            ).reduce<[unknown, number][]>((acc, [key, totals]) => {
                acc.push([
                    key,
                    totals.reduce((sum, total) => sum + total[2], 0),
                ]);
                return acc;
            }, []);

            // ! good candidate for deduplication, we loop over the result set in many places in this file - should mostly impact very large datasets
            const sorted = sortedResults.sort((a, b) => {
                const totalA =
                    stackTotalEntries.find(
                        (entry) => entry[0] === a[xFieldId],
                    )?.[1] ?? 0;

                const totalB =
                    stackTotalEntries.find(
                        (entry) => entry[0] === b[xFieldId],
                    )?.[1] ?? 0;

                return totalA - totalB; // Asc/Desc will be taken care of by inverse config
            });

            // Extract sorted category values for ECharts axis data property
            const categoryValues = Array.from(
                new Set(
                    sorted.map((row) =>
                        EMPTY_X_AXIS in row ? undefined : row[xFieldId],
                    ),
                ),
            );

            return {
                xAxisSortedResults: sorted,
                xAxisSortedCategoryValues: categoryValues,
            };
        }

        // Handle alphabetical category sorting
        if (
            xFieldId &&
            axis?.type === 'category' &&
            xAxisConfig?.sortType === XAxisSortType.CATEGORY
        ) {
            const sorted = [...sortedResults].sort((a, b) => {
                const valueA = EMPTY_X_AXIS in a ? '' : a[xFieldId];
                const valueB = EMPTY_X_AXIS in b ? '' : b[xFieldId];

                const valA = String(valueA ?? '');
                const valB = String(valueB ?? '');

                return valA.localeCompare(valB);
            });

            // Extract sorted category values for ECharts axis data property
            const categoryValues = Array.from(
                new Set(
                    sorted.map((row) =>
                        EMPTY_X_AXIS in row ? undefined : row[xFieldId],
                    ),
                ),
            );

            return {
                xAxisSortedResults: sorted,
                xAxisSortedCategoryValues: categoryValues,
            };
        }

        return {
            xAxisSortedResults: sortedResults,
            xAxisSortedCategoryValues: undefined,
        };
    }, [
        stackedSeriesWithColorAssignments,
        sortedResults,
        validCartesianConfig?.layout.flipAxes,
        validCartesianConfig?.layout?.xField,
        validCartesianConfig?.eChartsConfig.xAxis,
        axes.yAxis,
        axes.xAxis,
        rows,
        validCartesianConfigLegend,
    ]);

    // Apply 100% stacking transformation if needed
    const { dataToRender, originalValues } = useMemo(() => {
        const stackValue = validCartesianConfig?.layout?.stack;
        const shouldStack100 = stackValue === StackType.PERCENT;
        // For grouping in 100% stacking, always use the dimension field (xField)
        // regardless of whether axes are flipped
        const xFieldId = validCartesianConfig?.layout?.xField;

        if (
            !shouldStack100 ||
            !xFieldId ||
            !stackedSeriesWithColorAssignments
        ) {
            return {
                dataToRender: xAxisSortedResults,
                originalValues: undefined,
            };
        }

        // Collect all y-field hashes from stacked series ON THE PRIMARY AXIS ONLY
        // 100% stacking should only affect series on yAxisIndex 0 (the left/primary Y-axis)
        const yFieldRefs = stackedSeriesWithColorAssignments
            .filter((serie) => {
                return (
                    serie.stack && serie.encode && (serie.yAxisIndex ?? 0) === 0 // Only primary axis
                );
            })
            .map((serie) =>
                validCartesianConfig?.layout.flipAxes
                    ? serie.encode!.x
                    : serie.encode!.y,
            )
            .filter((hash): hash is string => !!hash);

        // Use shared transformation utility
        const { transformedResults, originalValues: originalValuesMap } =
            transformToPercentageStacking(sortedResults, xFieldId, yFieldRefs);

        return {
            dataToRender: transformedResults,
            originalValues: originalValuesMap,
        };
    }, [
        sortedResults,
        validCartesianConfig?.layout?.stack,
        validCartesianConfig?.layout?.xField,
        validCartesianConfig?.layout.flipAxes,
        stackedSeriesWithColorAssignments,
        xAxisSortedResults,
    ]);

    const tooltip = useMemo<TooltipOption>(() => {
        // Check if any series is line/area/scatter (use line pointer) vs bar (use shadow pointer)
        const hasLineAreaScatterSeries = series.some(
            (s) =>
                s.type === CartesianSeriesType.LINE ||
                s.type === CartesianSeriesType.AREA ||
                s.type === CartesianSeriesType.SCATTER,
        );

        return {
            show: true,
            trigger: 'axis',
            enterable: true,
            ...getTooltipStyle(),
            confine: true,
            extraCssText: `overflow-y: auto; max-height:280px; ${
                getTooltipStyle().extraCssText
            }`,
            axisPointer: getAxisPointerStyle(hasLineAreaScatterSeries),
            formatter: buildCartesianTooltipFormatter({
                itemsMap,
                stackValue: validCartesianConfig?.layout?.stack,
                flipAxes: validCartesianConfig?.layout.flipAxes,
                xFieldId: validCartesianConfig?.layout?.xField,
                originalValues,
                series,
                tooltipHtmlTemplate: tooltipConfig,
                pivotValuesColumnsMap,
                parameters,
            }),
        };
    }, [
        itemsMap,
        validCartesianConfig?.layout.flipAxes,
        validCartesianConfig?.layout?.stack,
        validCartesianConfig?.layout?.xField,
        tooltipConfig,
        pivotValuesColumnsMap,
        originalValues,
        parameters,
        series,
    ]);

    const currentGrid = useMemo(() => {
        const enableDataZoom =
            validCartesianConfig?.eChartsConfig?.xAxis?.[0]?.enableDataZoom;
        const flipAxes = validCartesianConfig?.layout?.flipAxes;

        const grid = {
            ...defaultGrid,
            ...removeEmptyProperties(validCartesianConfig?.eChartsConfig.grid),
        };

        const gridLeft = grid.left;
        const gridRight = grid.right;
        const gridBottom = grid.bottom;

        // Check if any series has a markLine (reference line) and determine label positions
        let maxLeftLabelLength = 0;
        let maxRightLabelLength = 0;

        series.forEach((s) => {
            if (s.markLine && s.markLine.data) {
                const dataArray = s.markLine.data as MarkLineData[];
                dataArray.forEach((d) => {
                    if ('yAxis' in d || d.type === 'average') {
                        // Horizontal line - check label position and text length
                        const labelPosition =
                            d.label?.position ||
                            (s.markLine?.label as { position?: string })
                                ?.position ||
                            'start';
                        const labelText =
                            d.name ||
                            d.label?.formatter ||
                            String(d.yAxis || '');
                        const textLength = labelText.length;

                        if (
                            labelPosition === 'start' ||
                            labelPosition.includes('Start')
                        ) {
                            maxLeftLabelLength = Math.max(
                                maxLeftLabelLength,
                                textLength,
                            );
                        } else if (
                            labelPosition === 'end' ||
                            labelPosition.includes('End')
                        ) {
                            maxRightLabelLength = Math.max(
                                maxRightLabelLength,
                                textLength,
                            );
                        }
                    }
                });
            }
        });

        // Calculate padding based on text length (3px per char + 5px buffer, cap at 20px)
        const extraLeftPadding =
            maxLeftLabelLength > 0
                ? Math.min(20, maxLeftLabelLength * 2 + 5)
                : 0;
        const extraRightPadding =
            maxRightLabelLength > 0
                ? Math.min(20, maxRightLabelLength * 2 + 5)
                : 0;

        // Adds extra gap to grid to make room for axis labels -> there is an open ticket in echarts to fix this: https://github.com/apache/echarts/issues/9265
        // Only works for px values, percentage values are not supported because it cannot use calc()
        return {
            ...grid,
            left: gridLeft.includes('px')
                ? `${
                      parseInt(gridLeft.replace('px', '')) +
                      defaultAxisLabelGap +
                      extraLeftPadding
                  }px`
                : grid.left,
            right:
                gridRight.includes('px') && !enableDataZoom
                    ? `${
                          parseInt(gridRight.replace('px', '')) +
                          defaultAxisLabelGap +
                          extraRightPadding
                      }px`
                    : gridRight.includes('px') && enableDataZoom && flipAxes
                    ? `${
                          parseInt(gridRight.replace('px', '')) +
                          defaultAxisLabelGap +
                          extraRightPadding +
                          30
                      }px`
                    : grid.right,
            // Add extra bottom spacing for dataZoom slider when not flipped
            bottom:
                enableDataZoom && !flipAxes && gridBottom.includes('px')
                    ? `${parseInt(gridBottom.replace('px', '')) + 30}px`
                    : grid.bottom,
        };
    }, [
        validCartesianConfig?.eChartsConfig.grid,
        validCartesianConfig?.eChartsConfig?.xAxis,
        validCartesianConfig?.layout?.flipAxes,
        series,
    ]);

    const { tooltip: legendDoubleClickTooltip } = useLegendDoubleClickTooltip();

    const legendConfigWithInstructionsTooltip = useMemo(() => {
        const mergedLegendConfig = mergeLegendSettings(
            validCartesianConfig?.eChartsConfig.legend,
            validCartesianConfigLegend,
            series,
        );

        // Use line icon only for line/area charts, otherwise use square with border radius
        const hasOnlyLineCharts = series.every(
            (s) =>
                s.type === CartesianSeriesType.LINE ||
                s.type === CartesianSeriesType.AREA,
        );

        const legendStyle = getLegendStyle(
            hasOnlyLineCharts ? 'line' : 'square',
        );

        return {
            ...mergedLegendConfig,
            ...legendStyle,
            tooltip: legendDoubleClickTooltip,
        };
    }, [
        legendDoubleClickTooltip,
        validCartesianConfig?.eChartsConfig.legend,
        validCartesianConfigLegend,
        series,
    ]);

    // When BAR_TOTALS or CATEGORY sorting is active, we need to explicitly set the category axis data
    // to preserve our sorted order, as ECharts would otherwise sort it differently
    const sortedAxes = useMemo(() => {
        if (!xAxisSortedCategoryValues) {
            return { xAxis: axes.xAxis, yAxis: axes.yAxis };
        }

        const flipAxes = validCartesianConfig?.layout?.flipAxes;

        return {
            xAxis: flipAxes
                ? axes.xAxis
                : axes.xAxis.map((axis, index) =>
                      index === 0
                          ? { ...axis, data: xAxisSortedCategoryValues }
                          : axis,
                  ),
            yAxis: flipAxes
                ? axes.yAxis.map((axis, index) =>
                      index === 0
                          ? { ...axis, data: xAxisSortedCategoryValues }
                          : axis,
                  )
                : axes.yAxis,
        };
    }, [
        axes,
        xAxisSortedCategoryValues,
        validCartesianConfig?.layout?.flipAxes,
    ]);

    const eChartsOptions = useMemo(() => {
        const enableDataZoom =
            validCartesianConfig?.eChartsConfig?.xAxis?.[0]?.enableDataZoom;
        const flipAxes = validCartesianConfig?.layout?.flipAxes;

        return {
            xAxis: sortedAxes.xAxis,
            yAxis: sortedAxes.yAxis,
            useUTC: true,
            series: stackedSeriesWithColorAssignments,
            animation: !(isInDashboard || minimal),
            legend: legendConfigWithInstructionsTooltip,
            dataset: {
                id: 'lightdashResults',
                source: dataToRender,
            },
            tooltip,
            grid: currentGrid,
            textStyle: {
                fontFamily: theme?.other.chartFont as string | undefined,
            },
            // We assign colors per series, so we specify an empty list here.
            color: [],
            ...(enableDataZoom && {
                dataZoom: [
                    {
                        type: 'slider',
                        show: true,
                        [flipAxes ? 'yAxisIndex' : 'xAxisIndex']: 0,
                        startValue: 0,
                        endValue: 10,
                        brushSelect: false,
                        zoomLock: true,
                        minValueSpan: 5,
                        maxValueSpan: 30,
                        // Reduce scroll bar size
                        ...(flipAxes && {
                            width: 20,
                        }),
                        ...(!flipAxes && {
                            height: 20,
                        }),
                    },
                ],
            }),
        };
    }, [
        sortedAxes,
        stackedSeriesWithColorAssignments,
        isInDashboard,
        minimal,
        legendConfigWithInstructionsTooltip,
        dataToRender,
        tooltip,
        currentGrid,
        theme?.other.chartFont,
        validCartesianConfig,
    ]);

    if (
        !itemsMap ||
        rows.length <= 0 ||
        !eChartsOptions ||
        !validCartesianConfig
    ) {
        return undefined;
    }

    return eChartsOptions;
};

export default useEchartsCartesianConfig;
