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
    getFormatExpressionLocale,
    getFormattedValue,
    getFormatterTimezone,
    getGranularityMapFromItems,
    getIndexFromEncode,
    getItemLabelWithoutTableName,
    getItemType,
    getLineChartGridStyle,
    getReadableColor,
    getReferenceLineStyle,
    getResultValueArray,
    getTooltipStyle,
    getValueLabelStyle,
    hasFormatting,
    hashFieldReference,
    hasValidFormatExpression,
    isCalendarValueItem,
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
    resolveGranularityInLabel,
    StackType,
    TableCalculationType,
    TimeFrames,
    transformToPercentageStacking,
    valueFormatter,
    XAxisSortType,
    type CartesianChart,
    type ConditionalFormattingConfig,
    type CustomDimension,
    type EChartsSeries,
    type EchartsLegend,
    type Field,
    type GranularityMap,
    type Item,
    type ItemsMap,
    type MarkLine,
    type MarkLineData,
    type ParametersValuesMap,
    type PivotReference,
    type PivotValuesColumn,
    type ResultRow,
    type RowLimit,
    type Series,
    type TableCalculation,
    type XAxis,
} from '@lightdash/common';
import { getLegendStyle } from '@lightdash/common/src/visualizations/helpers/styles/legendStyles';
import { useMantineTheme } from '@mantine-8/core';
import dayjs from 'dayjs';
import {
    type DefaultLabelFormatterCallbackParams,
    type TooltipComponentFormatterCallback,
    type TooltipComponentOption,
} from 'echarts';
import groupBy from 'lodash/groupBy';
import maxBy from 'lodash/maxBy';
import toNumber from 'lodash/toNumber';
import uniq from 'lodash/uniq';
import { useMemo } from 'react';
import { isCartesianVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import {
    defaultAxisLabelGap,
    defaultGrid,
    legendTopSpacing,
} from '../../components/VisualizationConfigs/ChartConfigPanel/Grid/constants';
import { sanitizeEchartsFontFamily } from '../../utils/sanitizeEchartsFontFamily';
import { sliceRows } from '../../utils/sliceRows';
import { EMPTY_X_AXIS } from '../cartesianChartConfig/useCartesianChartConfig';
import {
    getPivotedDataFromPivotDetails,
    type RowKeyMap,
} from '../plottedData/getPlottedData';
import { type InfiniteQueryResults } from '../useQueryResults';
import { getCartesianConditionalFormattingColor } from './cartesianConditionalFormatting';
import {
    applyTimezoneShiftToEchartsOptions,
    resolveAxisTimezone,
    TIME_INTERVALS_FOR_CATEGORY_AXIS,
} from './timezoneShift';
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

const resolveName = (name: unknown, granularityMap: GranularityMap): unknown =>
    typeof name === 'string'
        ? resolveGranularityInLabel(name, granularityMap)
        : name;

export const resolveCartesianGranularityLabels = ({
    xAxis,
    yAxis,
    series,
    granularityMap,
}: {
    xAxis: Record<string, unknown>[];
    yAxis: Record<string, unknown>[];
    series: EChartsSeries[] | undefined;
    granularityMap: GranularityMap;
}) => ({
    xAxis: xAxis.map((axis) => ({
        ...axis,
        name: resolveName(axis.name, granularityMap),
    })),
    yAxis: yAxis.map((axis) => ({
        ...axis,
        name: resolveName(axis.name, granularityMap),
    })),
    series: (series ?? []).map((serie) => ({
        ...serie,
        name: resolveName(serie.name, granularityMap) as EChartsSeries['name'],
    })),
});

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

const addPx = (pxValue: string, amount: number): string => {
    const base = parseInt(pxValue.replace('px', ''), 10);
    return `${base + amount}px`;
};

const isPxValue = (value: string): boolean => {
    return value.endsWith('px');
};

export const getAxisTypeFromField = (item?: ItemsMap[string]): string => {
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
            case MetricType.SUM_DISTINCT:
            case MetricType.AVERAGE_DISTINCT:
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
    // Check if axis has reference lines (which need continuous 'time' axis for positioning)
    const hasReferenceLine = (axisId?: string, isXAxis: boolean = false) => {
        if (!axisId) return false;
        return validCartesianConfig.eChartsConfig.series?.some((serie) => {
            if (!serie.markLine?.data?.length) return false;
            return serie.markLine.data.some((markData) =>
                isXAxis
                    ? markData.xAxis !== undefined
                    : markData.yAxis !== undefined,
            );
        });
    };

    // For coarse time intervals (week, month, quarter, year), use category axis to prevent
    // ECharts from generating misleading intermediate ticks (e.g., daily ticks for weekly data).
    // Exception: keep 'time' axis if there's a reference line (needs continuous positioning)
    const inferAxisType = (axisId?: string, isXAxis: boolean = false) => {
        const field = axisId ? itemsMap[axisId] : undefined;
        const axisType = getAxisTypeFromField(field);
        const shouldUseCategory =
            axisType === 'time' &&
            !hasReferenceLine(axisId, isXAxis) &&
            field &&
            'timeInterval' in field &&
            TIME_INTERVALS_FOR_CATEGORY_AXIS.includes(
                field.timeInterval as TimeFrames,
            );
        return shouldUseCategory ? 'category' : axisType;
    };

    const topAxisType = inferAxisType(topAxisXId, true);
    const bottomAxisType =
        bottomAxisXId === EMPTY_X_AXIS
            ? 'category'
            : inferAxisType(bottomAxisXId, true);

    // horizontal bar chart needs the type 'category' in the left/right axis
    const defaultRightAxisType = inferAxisType(rightAxisYId, false);
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

    const defaultLeftAxisType = inferAxisType(leftAxisYId, false);
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

/**
 * Returns an echarts axis-min function that ensures the axis extends down
 * to include the given reference line value, without ever shrinking the
 * axis range if the reference line is inside the auto-calculated bounds.
 */
const referenceLineMinBound = (refValue: number | string | undefined) => {
    if (refValue === undefined) return undefined;
    const numRef =
        typeof refValue === 'number' ? refValue : parseFloat(refValue);
    if (isNaN(numRef)) return undefined;
    return ({ min }: { min: number }) => Math.min(min, numRef);
};

/**
 * Returns an echarts axis-max function that ensures the axis extends up
 * to include the given reference line value, without ever capping the
 * axis range if the reference line is inside the auto-calculated bounds.
 */
const referenceLineMaxBound = (refValue: number | string | undefined) => {
    if (refValue === undefined) return undefined;
    const numRef =
        typeof refValue === 'number' ? refValue : parseFloat(refValue);
    if (isNaN(numRef)) return undefined;
    return ({ max }: { max: number }) => Math.max(max, numRef);
};

const convertPivotValuesColumnsIntoMap = (
    valuesColumns?: PivotValuesColumn[],
) => {
    if (!valuesColumns) return;
    return Object.fromEntries(
        valuesColumns.map((column) => [column.pivotColumnName, column]),
    );
};

const removeEmptyProperties = <
    T extends Record<string, any> = Record<any, any>,
>(
    obj: T | undefined,
): Partial<T> | undefined => {
    if (!obj) return undefined;
    return Object.entries(obj).reduce<Partial<T>>(
        (sum, [key, value]) =>
            value !== undefined && value !== ''
                ? { ...sum, [key as keyof T]: value }
                : sum,
        {},
    );
};

export const mergeLegendSettings = <
    T extends Record<string, any> = Record<any, any>,
>(
    legendConfig: T | undefined,
    legendsSelected: LegendValues,
    series: EChartsSeries[],
): Record<string, unknown> => {
    const normalizedConfig = removeEmptyProperties(legendConfig);
    if (!normalizedConfig || Object.keys(normalizedConfig).length === 0) {
        return {
            show: series.length > 1,
            type: 'scroll',
            orient: 'horizontal',
            top: 0,
            selected: legendsSelected,
        };
    }

    const { placement, ...rest } = normalizedConfig;

    // Truncate long series labels so they don't bleed into the plot area
    // when the legend column is narrower than the label width. Hover shows
    // the full label via the legend's built-in tooltip.
    const outsideLegendOverflow = {
        textStyle: {
            overflow: 'truncate',
            width: 150,
        },
        tooltip: { show: true },
    };

    if (placement === 'outsideRight') {
        return {
            ...rest,
            // Force scroll: 'plain' wraps items into a grid that overruns the
            // reserved grid.right margin when there are many series or long labels.
            type: 'scroll',
            orient: 'vertical',
            // Center vertically: top 'middle' aligns the legend's centre with
            // the canvas middle; height caps the bounding box so scroll
            // pagination still works for legends with many series.
            top: 'middle',
            height: '80%',
            right: '2%',
            left: undefined,
            bottom: undefined,
            ...outsideLegendOverflow,
            selected: legendsSelected,
        };
    }

    if (placement === 'outsideLeft') {
        return {
            ...rest,
            type: 'scroll',
            orient: 'vertical',
            top: 'middle',
            height: '80%',
            left: '2%',
            right: undefined,
            bottom: undefined,
            ...outsideLegendOverflow,
            selected: legendsSelected,
        };
    }

    return {
        orient: 'horizontal',
        // After echarts v6, the new default legend is positioned at bottom. We need to keep old behavior in placeholders
        // so we only define top 0 if there is no 'bottom' configuration.
        // spreading `rest` will overwrite top value if needed
        top: 'bottom' in rest ? undefined : 0,
        ...rest,
        selected: legendsSelected,
    };
};

type GridLike = {
    containLabel: boolean;
    left: string;
    right: string;
    top: string;
    bottom: string;
};

export const applyLegendPlacementToGrid = (
    grid: GridLike,
    legendConfig: Pick<EchartsLegend, 'placement'> | undefined,
    isLegendShown: boolean,
    userGrid?: { left?: string; right?: string },
): GridLike => {
    if (!isLegendShown) return grid;
    if (legendConfig?.placement === 'outsideRight') {
        return { ...grid, right: userGrid?.right ?? '25%' };
    }
    if (legendConfig?.placement === 'outsideLeft') {
        return { ...grid, left: userGrid?.left ?? '25%' };
    }
    return grid;
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
                case MetricType.SUM_DISTINCT:
                case MetricType.AVERAGE_DISTINCT:
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
        const min: string | number = values.sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            return String(a).localeCompare(String(b));
        })[0];
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
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn>;
    parameters?: ParametersValuesMap;
    isStack100?: boolean;
    resolvedTimezone?: string;
};

const seriesValueFormatter = (
    item: Item,
    value: unknown,
    parameters?: ParametersValuesMap,
    resolvedTimezone?: string,
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

        // Same timezone decision formatItemValue uses.
        const expressionTimezone = getFormatterTimezone(
            item,
            value,
            resolvedTimezone,
        );
        return formatValueWithExpression(
            formatExpression,
            value,
            getFormatExpressionLocale(item),
            expressionTimezone,
        );
    }

    if (isCustomDimension(item)) {
        return value;
    }
    if (isTableCalculation(item)) {
        return formatItemValue(
            item,
            value,
            false,
            parameters,
            resolvedTimezone,
        );
    } else {
        const defaultFormatOptions = getCustomFormatFromLegacy({
            format: item.format,
            round: item.round,
            compact: item.compact,
        });
        // Check for formatOptions from both metrics and dimension overrides
        // Dimension overrides add formatOptions to the item via the itemsMap
        const formatOptions =
            isMetric(item) || isDimension(item)
                ? item.formatOptions
                : undefined;
        return applyCustomFormat(
            value,
            formatOptions || defaultFormatOptions,
            resolvedTimezone,
        );
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
 * Format the label based on showValue, showLabel, and showSeriesName options
 * @param formattedValue - The formatted metric value
 * @param labelName - The legend/pivot label name (e.g., "United States")
 * @param metricFieldName - The metric field name (e.g., "Revenue")
 * @param showValue - Whether to show the value (default: true)
 * @param showLabel - Whether to show the legend/pivot name (default: false)
 * @param showSeriesName - Whether to show the metric field name (default: false)
 * @returns The formatted label string, e.g., "United States (Revenue): 17,000"
 */
const formatLabelWithOptions = (
    formattedValue: string,
    labelName: string | undefined,
    metricFieldName: string | undefined,
    showValue: boolean = true,
    showLabel: boolean = false,
    showSeriesName: boolean = false,
): string => {
    const nameParts: string[] = [];

    if (showLabel && labelName) {
        nameParts.push(labelName);
    }

    if (showSeriesName && metricFieldName && metricFieldName !== labelName) {
        nameParts.push(`(${metricFieldName})`);
    }

    const nameStr = nameParts.join(' ');

    const parts: string[] = [];

    if (nameStr) {
        parts.push(nameStr);
    }

    if (showValue) {
        parts.push(formattedValue);
    }

    // If nothing to show, return empty string
    if (parts.length === 0) {
        return '';
    }

    // Join parts with ": " if both name and value are present
    return parts.join(': ');
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

// Stacked bar/area series (on any axis) whose values become percentages under
// 100% stacking. Line/scatter never stack, so they are excluded.
const isStack100Normalized = (series: Series) =>
    !!series.stack &&
    (series.type === CartesianSeriesType.BAR || !!series.areaStyle);

/**
 * Create a labelLayout configuration for stacked bar charts.
 * When showOverlappingLabels is enabled, uses smaller font for labels that don't fit
 * in small segments to keep them visible.
 *
 * @param isStacked - Whether the series is part of a stack
 * @param flipAxes - Whether the chart is horizontal (flipped)
 * @param showOverlappingLabels - Force display labels even when they don't fit
 */
const createStackedBarLabelLayout = ({
    isStacked,
    flipAxes,
    showOverlappingLabels,
}: {
    isStacked: boolean;
    flipAxes: boolean;
    showOverlappingLabels: boolean;
}):
    | { hideOverlap: boolean }
    | ((params: {
          rect: { x: number; y: number; width: number; height: number };
          labelRect: { x: number; y: number; width: number; height: number };
      }) => { fontSize?: number } | undefined) => {
    // Only apply small-font treatment when showOverlappingLabels is enabled for stacked bars
    if (!isStacked || !showOverlappingLabels) {
        return { hideOverlap: true };
    }

    // Return callback function for dynamic font sizing
    return (params) => {
        const { rect, labelRect } = params;

        // Check if label fits inside the segment at normal size
        const segmentSize = flipAxes ? rect.width : rect.height;
        const labelSize = flipAxes ? labelRect.width : labelRect.height;
        const padding = 4;

        const labelFits = labelSize + padding <= segmentSize;

        if (labelFits) {
            return undefined; // Keep default size
        }

        // Label doesn't fit - use smaller font
        return { fontSize: 8 };
    };
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
    resolvedTimezone,
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
                resolvedTimezone,
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
        ...(series.type === CartesianSeriesType.LINE ||
        series.type === CartesianSeriesType.AREA
            ? {
                  connectNulls:
                      cartesianChart.layout.connectNulls !== undefined
                          ? cartesianChart.layout.connectNulls
                          : true,
              }
            : {}),
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
                resolvedTimezone,
            ),
        },
        showSymbol: series.showSymbol ?? true,
        ...(series.label?.show && {
            label: {
                ...series.label,
                ...(series.color &&
                    getValueLabelStyle(
                        series.label.position,
                        series.type,
                        series.color,
                    )),
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

                            // For 100% stacked bar/area series, values are already percentages (0-100).
                            // Applies on whichever axis the stacked series renders on.
                            const formattedValue =
                                isStack100 && isStack100Normalized(series)
                                    ? formatStack100Value(raw)
                                    : String(
                                          seriesValueFormatter(
                                              field,
                                              raw,
                                              parameters,
                                              resolvedTimezone,
                                          ) ?? '',
                                      );

                            const metricFieldName = getLabelFromField(
                                itemsMap,
                                series.encode.yRef.field,
                            );

                            return formatLabelWithOptions(
                                formattedValue,
                                pivotLabel,
                                metricFieldName,
                                series.label?.showValue ?? true,
                                series.label?.showLabel ?? false,
                                series.label?.showSeriesName ?? false,
                            );
                        },
                    }),
            },
            labelLayout: createStackedBarLabelLayout({
                isStacked: !!series.stack,
                flipAxes: !!flipAxes,
                showOverlappingLabels: !!series.label?.showOverlappingLabels,
            }),
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

const applyReadableColorsToMarkLine = (
    markLine: MarkLine,
    baseColor?: string,
    backgroundColor?: string,
) => {
    const baseStyle = getReferenceLineStyle(baseColor, backgroundColor);

    // Apply readable color adjustment to each reference line
    const adjustedData = markLine.data?.map((item: any) => {
        if (!item.lineStyle?.color || !backgroundColor) {
            return item;
        }

        const adjustedColor = getReadableColor(
            item.lineStyle.color,
            backgroundColor,
        );
        const itemStyle = getReferenceLineStyle(adjustedColor, backgroundColor);

        return {
            ...item,
            lineStyle: {
                ...item.lineStyle,
                color: adjustedColor,
            },
            label: {
                ...itemStyle.label,
                position: item.label?.position,
            },
        };
    });

    return {
        ...markLine,
        ...baseStyle,
        data: adjustedData,
    };
};

type GetSimpleSeriesArg = {
    series: Series;
    itemsMap: ItemsMap;
    connectNulls: boolean | undefined;
    flipAxes: boolean | undefined;
    yFieldHash: string;
    xFieldHash: string;
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn>;
    parameters?: ParametersValuesMap;
    isStack100?: boolean;
    backgroundColor?: string;
    resolvedTimezone?: string;
};

const getSimpleSeries = ({
    series,
    connectNulls = true,
    flipAxes,
    yFieldHash,
    xFieldHash,
    itemsMap,
    pivotValuesColumnsMap,
    parameters,
    isStack100,
    backgroundColor,
    resolvedTimezone,
}: GetSimpleSeriesArg) => ({
    ...series,
    xAxisIndex: flipAxes ? series.yAxisIndex : undefined,
    yAxisIndex: flipAxes ? undefined : series.yAxisIndex,
    emphasis: {
        focus: 'series',
    },
    ...(series.type === CartesianSeriesType.LINE ||
    series.type === CartesianSeriesType.AREA
        ? {
              connectNulls,
          }
        : {}),
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
            resolvedTimezone,
        ),
    },
    ...getSimpleSeriesSymbolConfig(series),
    ...(series.label?.show && {
        label: {
            ...series.label,
            // Apply value label styling for all series types
            ...getValueLabelStyle(
                series.label.position,
                series.type,
                series.color,
            ),
            ...(itemsMap &&
                itemsMap[yFieldHash] && {
                    formatter: (param: any) => {
                        const field = itemsMap[yFieldHash];

                        const rawValue = getMetricFromParam(
                            param,
                            series,
                            yFieldHash,
                            !!flipAxes,
                        );

                        // For 100% stacked bar/area series, values are already percentages (0-100).
                        // Applies on whichever axis the stacked series renders on.
                        const formattedValue =
                            isStack100 && isStack100Normalized(series)
                                ? formatStack100Value(rawValue)
                                : String(
                                      seriesValueFormatter(
                                          field,
                                          rawValue,
                                          parameters,
                                          resolvedTimezone,
                                      ) ?? '',
                                  );

                        const metricFieldName = getLabelFromField(
                            itemsMap,
                            series.encode.yRef.field,
                        );

                        return formatLabelWithOptions(
                            formattedValue,
                            param?.seriesName as string | undefined,
                            metricFieldName,
                            series.label?.showValue ?? true,
                            series.label?.showLabel ?? false,
                            series.label?.showSeriesName ?? false,
                        );
                    },
                }),
        },
        labelLayout: createStackedBarLabelLayout({
            isStacked: !!series.stack,
            flipAxes: !!flipAxes,
            showOverlappingLabels: !!series.label?.showOverlappingLabels,
        }),
    }),
    ...(series.markLine && {
        markLine: applyReadableColorsToMarkLine(
            series.markLine,
            series.color,
            backgroundColor,
        ),
    }),
});

// New series generation for pre-pivoted data from backend
const getEchartsSeriesFromPivotedData = (
    itemsMap: ItemsMap,
    cartesianChart: CartesianChart,
    rowKeyMap: RowKeyMap,
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn>,
    parameters?: ParametersValuesMap,
    backgroundColor?: string,
    resolvedTimezone?: string,
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
                    resolvedTimezone,
                });
            }

            // Simple series for non-pivoted columns
            return getSimpleSeries({
                series,
                itemsMap,
                connectNulls: cartesianChart.layout.connectNulls,
                flipAxes,
                yFieldHash,
                xFieldHash,
                pivotValuesColumnsMap,
                parameters,
                isStack100,
                backgroundColor,
                resolvedTimezone,
            });
        });

    return resultSeries;
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

// Heckbert "nice number": the tick interval ECharts would choose for a range
const getNiceInterval = (range: number): number => {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / 10 ** exponent;
    const niceFraction =
        fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
    return niceFraction * 10 ** exponent;
};

// Outermost tick ECharts will render for a data bound (e.g. 314 -> 350, -222 -> -250)
export const getNiceTickBound = (value: number, splitNumber = 5): number => {
    if (value === 0 || !Number.isFinite(value)) return 0;
    const interval = getNiceInterval(Math.abs(value) / splitNumber);
    return Math.sign(value) * Math.ceil(Math.abs(value) / interval) * interval;
};

// Longest formatted value for each field plotted on an axis
export const getLongestLabelsForAxis = ({
    rows = [],
    axisIds = [],
}: {
    rows?: ResultRow[];
    axisIds?: (string | undefined)[];
}): string[] =>
    uniq(axisIds.filter((id): id is string => id !== undefined))
        .map((axisId) => getLongestLabel({ rows, axisId }))
        .filter((label): label is string => label !== undefined);

/**
 * Filter out series whose data column has all null/undefined values in the
 * displayed results. This prevents phantom legend entries and empty stacked
 * segments when row limiting slices away all data for a pivot series.
 *
 * Returns `unfilteredSeries` unchanged when row limiting is inactive.
 */
export const filterSeriesWithNoData = (
    unfilteredSeries: EChartsSeries[],
    results: Record<string, unknown>[],
    rowLimit: RowLimit | undefined,
): EChartsSeries[] => {
    if (!rowLimit) {
        return unfilteredSeries;
    }
    if (results.length === 0) return unfilteredSeries;

    const fieldsWithData = new Set<string>();
    for (const row of results) {
        for (const [key, val] of Object.entries(row)) {
            if (val !== null && val !== undefined) {
                fieldsWithData.add(key);
            }
        }
    }

    return unfilteredSeries.filter((s) => {
        const tooltipKeys = s.encode?.tooltip;
        if (!tooltipKeys?.length) return true;
        return tooltipKeys.some((key) => fieldsWithData.has(key));
    });
};

/**
 * Pad a dataset with empty rows for dates in a continuous range that have no
 * data. This ensures ECharts positional mapping (row index → category index)
 * stays correct when the axis has a continuous date range but the dataset has
 * gaps (e.g., row-limited data with non-consecutive months).
 *
 * Existing rows keep all their columns; gap rows contain only the x-field key.
 */
export const padDatasetForContinuousAxis = (
    data: Record<string, unknown>[],
    continuousRange: string[],
    xFieldId: string,
): Record<string, unknown>[] => {
    if (!continuousRange.length || !data.length) return data;

    // Normalize dates to YYYY-MM-DD for matching, because the continuous range
    // uses UTC (e.g., 2023-05-01T00:00:00Z) while dataset values may have a
    // timezone offset (e.g., 2023-05-01T01:00:00Z from BST).
    const normalizeDate = (d: string): string => d.slice(0, 10);

    const dataByDate = new Map<string, Record<string, unknown>>();
    for (const row of data) {
        const dateVal = normalizeDate(String(row[xFieldId] ?? ''));
        dataByDate.set(dateVal, row);
    }

    return continuousRange.map((date) => {
        const existing = dataByDate.get(normalizeDate(date));
        if (existing) {
            // Overwrite the x-field value with the canonical continuous-range
            // date so it matches xAxis.data exactly. ECharts uses strict string
            // equality between axis categories and dataset values.
            return { ...existing, [xFieldId]: date };
        }
        return { [xFieldId]: date };
    });
};

/**
 * Generate continuous date range config for category axes with date intervals.
 * This ensures bar charts only show data points that exist in the dataset,
 * preventing ECharts from auto-extending the axis range.
 */
type CategoryDateAxisConfig = {
    data?: string[];
    axisTick?: { alignWithLabel: boolean; interval: number };
    boundaryGap?: boolean;
};

export const getCategoryDateAxisConfig = (
    axisId?: string,
    axisField?: Field | TableCalculation | CustomDimension,
    rows?: ResultRow[],
    axisType?: string,
    series?: Series[],
    resolvedTimezone?: string,
): CategoryDateAxisConfig => {
    if (!axisId || !rows || !axisField || axisType !== 'category') return {};
    if (!('timeInterval' in axisField)) return {};

    const { timeInterval } = axisField;
    const [minX, maxX] = getMinAndMaxValues([axisId], rows || []);

    // Guard against invalid dates to prevent infinite loops
    const minDateValue = dayjs.utc(minX);
    const maxDateValue = dayjs.utc(maxX);
    if (!minDateValue.isValid() || !maxDateValue.isValid()) return {};

    // Match the date format used by the backend's raw values so that
    // xAxis.data strings equal the category values in series.data tuples
    // (ECharts uses strict string equality for category matching).
    // If the raw value is a date-only string (e.g. "2024-04-01"), format
    // without the time component; otherwise use full ISO format.
    const minXStr = String(minX);
    const isDateOnly = !minXStr.includes('T');

    // Bar charts need boundary gap for proper bar spacing, but line/area charts
    // look better extending to the edges
    const hasBarSeries = series?.some(
        (s) => s.type === CartesianSeriesType.BAR,
    );
    const boundaryGap = hasBarSeries;

    // Calendar values (wall-clock dates) are raw — snap in UTC to match.
    const tz =
        isCalendarValueItem(axisField) || !resolvedTimezone
            ? 'UTC'
            : resolvedTimezone;
    // Skip dayjs.tz for UTC: .add() chains drift sub-ms vs fresh .tz() objects
    // and break .isBefore at the boundary.
    const inTz = (v: string | number) =>
        tz === 'UTC' ? dayjs.utc(v) : dayjs.tz(dayjs.utc(v).toDate(), tz);

    // dayjs `.add(unit)` keeps the source UTC offset rather than re-resolving
    // DST in the target zone; re-parse the wall-clock to fix that. No-op for UTC.
    const reAnchor = (d: dayjs.Dayjs) =>
        tz === 'UTC' ? d : dayjs.tz(d.format('YYYY-MM-DD HH:mm:ss'), tz);

    const formatDate = (d: dayjs.Dayjs): string =>
        isDateOnly ? d.utc().format('YYYY-MM-DD') : d.utc().format();

    if (timeInterval === TimeFrames.WEEK) {
        const continuousRange: string[] = [];
        let nextDate = inTz(minX);
        const endDate = inTz(maxX);
        while (nextDate.isBefore(endDate)) {
            continuousRange.push(formatDate(nextDate));
            nextDate = reAnchor(nextDate.add(1, 'week'));
        }
        continuousRange.push(formatDate(endDate));
        return {
            data: continuousRange,
            axisTick: { alignWithLabel: true, interval: 0 },
            boundaryGap,
        };
    }

    if (timeInterval === TimeFrames.YEAR) {
        const continuousRange: string[] = [];
        let nextDate = inTz(minX).startOf('year');
        const endDate = inTz(maxX).startOf('year');
        while (!nextDate.isAfter(endDate)) {
            continuousRange.push(formatDate(nextDate));
            nextDate = reAnchor(nextDate.add(1, 'year'));
        }
        return {
            data: continuousRange,
            axisTick: { alignWithLabel: true, interval: 0 },
            boundaryGap,
        };
    }

    if (timeInterval === TimeFrames.QUARTER) {
        const continuousRange: string[] = [];
        let nextDate = inTz(minX).startOf('quarter');
        const endDate = inTz(maxX).startOf('quarter');
        while (!nextDate.isAfter(endDate)) {
            continuousRange.push(formatDate(nextDate));
            // dayjs requires quarterOfYear plugin for .add(1, 'quarter')
            nextDate = reAnchor(nextDate.add(3, 'months'));
        }
        return {
            data: continuousRange,
            axisTick: { alignWithLabel: true, interval: 0 },
            boundaryGap,
        };
    }

    if (timeInterval === TimeFrames.MONTH) {
        const continuousRange: string[] = [];
        let nextDate = inTz(minX).startOf('month');
        const endDate = inTz(maxX).startOf('month');
        while (!nextDate.isAfter(endDate)) {
            continuousRange.push(formatDate(nextDate));
            nextDate = reAnchor(nextDate.add(1, 'month'));
        }
        return {
            data: continuousRange,
            axisTick: { alignWithLabel: true, interval: 0 },
            boundaryGap,
        };
    }

    return {};
};

// Past this many ticks labels are thinned to illegibility anyway; fall back
// to ECharts auto ticks instead of paying the per-tick label layout cost.
const MAX_PINNED_TICKS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pin time-axis ticks/labels to the actual data instants for daily bar
 * charts whose day values are not UTC midnights. That happens when the
 * warehouse truncates days in a non-UTC timezone (e.g. Snowflake session
 * timezone), yielding instants like T04:00:00Z: bars render at those
 * instants while ECharts draws its automatic tick labels at UTC midnights,
 * so every label sits a constant few hours away from its bar group.
 * Returning the distinct data instants lets the axis use `customValues` so
 * every label sits exactly under its bar.
 *
 * Deliberately narrow: only explicit DAY granularity, only bar series, only
 * when timezone shifting is inactive, and only when a non-midnight value
 * proves the chart is misaligned today. Every other chart keeps ECharts'
 * automatic ticks and renders exactly as before. The shift gate is required
 * because the wall-clock shift rewrites plotted values after options are
 * built, which would desync pinned values; under current code DAY truncs
 * resolve to DATE and are never client-shifted, but the gate holds even if
 * that classification changes.
 */
export const getTimeAxisPinnedTickValues = (
    axisId?: string,
    axisField?: Field | TableCalculation | CustomDimension,
    rows?: ResultRow[],
    axisType?: string,
    series?: Series[],
    isTimeAxisShifted?: boolean,
): number[] | undefined => {
    if (!axisId || !axisField || !rows || rows.length === 0) return undefined;
    if (axisType !== 'time' || isTimeAxisShifted) return undefined;
    if (
        !('timeInterval' in axisField) ||
        axisField.timeInterval !== TimeFrames.DAY
    ) {
        return undefined;
    }
    const hasBarSeries = series?.some(
        (s) => s.type === CartesianSeriesType.BAR,
    );
    if (!hasBarSeries) return undefined;

    const values = new Set<number>();
    for (const row of rows) {
        const raw = row[axisId]?.value.raw;
        if (raw === null || raw === undefined) continue;
        const parsed = dayjs.utc(String(raw));
        if (parsed.isValid()) values.add(parsed.valueOf());
    }
    if (values.size === 0 || values.size > MAX_PINNED_TICKS) return undefined;

    // UTC-midnight days already get ECharts ticks on bar days; only pin when
    // a non-midnight value proves the labels are misaligned today.
    const hasNonMidnightValue = Array.from(values).some(
        (value) => value % DAY_MS !== 0,
    );
    if (!hasNonMidnightValue) return undefined;

    return Array.from(values).sort((a, b) => a - b);
};

/**
 * Label formatter for pinned daily ticks. Mirrors the leveled time-axis
 * template (bold month at boundaries, plain day numbers), but since ticks
 * only exist on data days a month may have no tick on the 1st — mark the
 * first tick of each month with a bold "MMM D" so month context survives.
 *
 * Renders the tick's UTC calendar day, matching how the results table and
 * tooltips format the same raw value. For positive-offset warehouse
 * timezones a local midnight is the previous UTC day (Jul 1 at UTC+2 =
 * Jun 30T22:00Z, labelled "30") — intentional: the chart must agree with
 * the table for the same row rather than guess the warehouse-local day.
 */
export const getPinnedDayTickFormatter = (
    tickValues: number[],
): ((value: number) => string) => {
    const firstTickOfMonth = new Set<number>();
    let lastMonthKey: string | undefined;
    for (const value of tickValues) {
        const monthKey = dayjs.utc(value).format('YYYY-MM');
        if (monthKey !== lastMonthKey) {
            firstTickOfMonth.add(value);
            lastMonthKey = monthKey;
        }
    }
    return (value: number) => {
        const date = dayjs.utc(value);
        if (date.date() === 1) {
            return date.month() === 0
                ? `{bold|${date.format('YYYY')}}`
                : `{bold|${date.format('MMM')}}`;
        }
        if (firstTickOfMonth.has(value)) {
            return `{bold|${date.format('MMM')}} ${date.format('D')}`;
        }
        return date.format('D');
    };
};

// Read from the axis holding the X field — bottom (normal) or left (flipped).
// Top/right hold Y-field metrics; leaking them corrupts the X field column.
export const selectContinuousDateRange = (
    flipAxes: boolean | undefined,
    bottomAxisExtraConfig: CategoryDateAxisConfig,
    leftAxisExtraConfig: CategoryDateAxisConfig,
): string[] | undefined =>
    flipAxes ? leftAxisExtraConfig.data : bottomAxisExtraConfig.data;

// Spacing that keeps `bottom`/`left` bar value labels clear of the category-axis
// tick labels they render next to. Bottom is height-based; left is width-based.
const BOTTOM_VALUE_LABEL_AXIS_MARGIN = 24;
const BOTTOM_VALUE_LABEL_NAME_GAP_EXTRA = 16;
const DEFAULT_AXIS_LABEL_MARGIN = 8;
const LEFT_VALUE_LABEL_GUTTER_PADDING = 12;

const getEchartAxes = ({
    itemsMap,
    validCartesianConfig,
    series,
    resultsData,
    displayedRows,
    minsAndMaxes,
    parameters,
    resolvedTimezone,
    displayTimezone,
    isTimeAxisShifted,
}: {
    validCartesianConfig: CartesianChart;
    itemsMap: ItemsMap;
    series: EChartsSeries[];
    resultsData: InfiniteQueryResults | undefined;
    displayedRows?: ResultRow[];
    minsAndMaxes: ReturnType<typeof getResultValueArray>['minsAndMaxes'];
    parameters?: ParametersValuesMap;
    resolvedTimezone?: string;
    displayTimezone?: string;
    isTimeAxisShifted?: boolean;
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
    // Legacy showYAxis is used as fallback for independent axis controls
    const legacyShowYAxis =
        validCartesianConfig.layout.showYAxis !== undefined
            ? validCartesianConfig.layout.showYAxis
            : true;
    // Use independent axis controls if defined, otherwise fallback to legacy showYAxis
    const showLeftYAxis =
        validCartesianConfig.layout.showLeftYAxis !== undefined
            ? validCartesianConfig.layout.showLeftYAxis
            : legacyShowYAxis;
    const showRightYAxis =
        validCartesianConfig.layout.showRightYAxis !== undefined
            ? validCartesianConfig.layout.showRightYAxis
            : legacyShowYAxis;

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

    // Width of the widest tick label a value axis will render: the axis bounds
    // formatted like the ticks, not raw row values of the first series
    const getValueAxisTickLabelWidth = (
        axisFieldIds: string[],
        axisItem: ItemsMap[string] | undefined,
        axisBounds: { min?: string; max?: string } | undefined,
    ): number | undefined => {
        const [dataMin, dataMax] = getMinAndMaxValues(
            axisFieldIds,
            resultsData?.rows ?? [],
            resultsData?.pivotDetails,
        );
        if (typeof dataMin !== 'number' || typeof dataMax !== 'number')
            return undefined;

        // Explicit bounds render as-is; otherwise ECharts rounds to a nice tick
        const parseBound = (bound: string | undefined, fallback: number) => {
            const parsed = bound ? toNumber(bound) : NaN;
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const tickMax = parseBound(axisBounds?.max, getNiceTickBound(dataMax));
        const tickMin = parseBound(
            axisBounds?.min,
            Math.min(0, getNiceTickBound(dataMin)),
        );

        const isDateItem =
            isField(axisItem) &&
            (axisItem.type === DimensionType.DATE ||
                axisItem.type === DimensionType.TIMESTAMP);
        // Mirror when getCartesianAxisFormatterConfig installs a tick formatter
        const ticksAreFormatted =
            axisItem !== undefined &&
            !isDateItem &&
            (hasFormatting(axisItem) ||
                (isTableCalculation(axisItem) && axisItem.type === undefined));
        const formatTick = (value: number): string =>
            axisItem && ticksAreFormatted
                ? formatItemValue(
                      axisItem,
                      value,
                      true,
                      parameters,
                      resolvedTimezone,
                      displayTimezone,
                  )
                : value.toLocaleString('en-US');

        return Math.max(
            calculateWidthText(formatTick(tickMax)),
            calculateWidthText(formatTick(tickMin)),
        );
    };

    // Category/time axes render row values as tick labels, so measure those
    const getCategoryAxisTickLabelWidth = (axisIds: (string | undefined)[]) =>
        Math.max(
            0,
            ...getLongestLabelsForAxis({
                rows: resultsData?.rows,
                axisIds,
            }).map(calculateWidthText),
        );

    // 100% stacking forces the left axis to 0-100
    const leftAxisIsStack100 =
        validCartesianConfig.layout?.stack === StackType.PERCENT &&
        !validCartesianConfig.layout.flipAxes;

    const leftAxisYIds = leftAxisYFieldIds?.length
        ? leftAxisYFieldIds
        : [leftAxisYId];
    const leftYaxisGap =
        (leftAxisType === 'value'
            ? getValueAxisTickLabelWidth(
                  leftAxisYIds.filter((id): id is string => id !== undefined),
                  leftAxisYField,
                  leftAxisIsStack100
                      ? { min: '0', max: '100' }
                      : yAxisConfiguration?.[0],
              )
            : undefined) ?? getCategoryAxisTickLabelWidth(leftAxisYIds);

    const rightAxisYIds = rightAxisYFieldIds?.length
        ? rightAxisYFieldIds
        : [rightAxisYId];
    const rightYaxisGap =
        (rightAxisType === 'value'
            ? getValueAxisTickLabelWidth(
                  rightAxisYIds.filter((id): id is string => id !== undefined),
                  rightAxisYField,
                  yAxisConfiguration?.[1],
              )
            : undefined) ?? getCategoryAxisTickLabelWidth(rightAxisYIds);

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
    const eChartsSeries = validCartesianConfig.eChartsConfig.series;
    // When row limiting is active, derive the continuous date range from
    // displayedRows instead of the full result set. The dataset is padded
    // with empty rows for gap dates (see padDatasetForContinuousAxis) so
    // ECharts positional mapping stays correct.
    const axisRows = displayedRows ?? resultsData?.rows;
    const bottomAxisExtraConfig = getCategoryDateAxisConfig(
        bottomAxisXId,
        bottomAxisXField,
        axisRows,
        bottomAxisType,
        eChartsSeries,
        resolvedTimezone,
    );
    const topAxisExtraConfig = getCategoryDateAxisConfig(
        topAxisXId,
        topAxisXField,
        axisRows,
        topAxisType,
        eChartsSeries,
        resolvedTimezone,
    );
    const rightAxisExtraConfig = getCategoryDateAxisConfig(
        rightAxisYId,
        rightAxisYField,
        axisRows,
        rightAxisType,
        eChartsSeries,
        resolvedTimezone,
    );
    const leftAxisExtraConfig = getCategoryDateAxisConfig(
        leftAxisYId,
        leftAxisYField,
        axisRows,
        leftAxisType,
        eChartsSeries,
        resolvedTimezone,
    );
    const bottomAxisPinnedTickValues = getTimeAxisPinnedTickValues(
        bottomAxisXId,
        bottomAxisXField,
        axisRows,
        bottomAxisType,
        eChartsSeries,
        isTimeAxisShifted,
    );
    const axisLabelFontSize =
        validCartesianConfig?.eChartsConfig?.axisLabelFontSize;
    const axisTitleFontSize =
        validCartesianConfig?.eChartsConfig?.axisTitleFontSize;

    const bottomAxisFormatterConfig = getAxisFormatterConfig({
        axisItem: bottomAxisXField,
        longestLabelWidth: calculateWidthText(longestValueXAxisBottom),
        rotate: xAxisConfiguration?.[0]?.rotate,
        defaultNameGap: 30,
        show: showXAxis,
        parameters,
        timezone: resolvedTimezone,
        displayTimezone,
    });
    // `bottom` (vertical) and `left` (horizontal) value labels render at the
    // value=0 baseline, overlapping the category-axis tick labels there.
    const barSeriesUsesLabelPosition = (position: 'bottom' | 'left') =>
        (validCartesianConfig.eChartsConfig.series ?? []).some(
            (serie) =>
                serie.type === CartesianSeriesType.BAR &&
                serie.label?.show === true &&
                serie.label?.position === position,
        );
    const hasBottomBarValueLabels =
        !validCartesianConfig.layout.flipAxes &&
        barSeriesUsesLabelPosition('bottom');
    const hasLeftBarValueLabels =
        !!validCartesianConfig.layout.flipAxes &&
        barSeriesUsesLabelPosition('left');
    // Left labels need a gutter as wide as the widest value label
    // (longestValueXAxisBottom is that value when flipped).
    const leftValueLabelGutter = hasLeftBarValueLabels
        ? calculateWidthText(longestValueXAxisBottom) +
          LEFT_VALUE_LABEL_GUTTER_PADDING
        : 0;

    const bottomAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        bottomAxisFormatterConfig,
        hasBottomBarValueLabels &&
            typeof bottomAxisFormatterConfig.nameGap === 'number'
            ? {
                  nameGap:
                      bottomAxisFormatterConfig.nameGap +
                      BOTTOM_VALUE_LABEL_NAME_GAP_EXTRA,
              }
            : {},
        showXAxis && bottomAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(axisLabelFontSize),
                      ...bottomAxisFormatterConfig.axisLabel,
                      ...(hasBottomBarValueLabels
                          ? { margin: BOTTOM_VALUE_LABEL_AXIS_MARGIN }
                          : {}),
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
        timezone: resolvedTimezone,
        displayTimezone,
    });
    const topAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        topAxisFormatterConfig,
        showXAxis && topAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(axisLabelFontSize),
                      ...topAxisFormatterConfig.axisLabel,
                  },
              }
            : {},
    );

    const leftAxisFormatterConfig = getAxisFormatterConfig({
        axisItem: leftAxisYField,
        defaultNameGap: leftYaxisGap + defaultAxisLabelGap,
        show: showLeftYAxis,
        parameters,
        timezone: resolvedTimezone,
        displayTimezone,
    });
    const leftAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        leftAxisFormatterConfig,
        hasLeftBarValueLabels &&
            typeof leftAxisFormatterConfig.nameGap === 'number'
            ? {
                  nameGap:
                      leftAxisFormatterConfig.nameGap + leftValueLabelGutter,
              }
            : {},
        showLeftYAxis && leftAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(axisLabelFontSize),
                      ...leftAxisFormatterConfig.axisLabel,
                      ...(hasLeftBarValueLabels
                          ? {
                                margin:
                                    DEFAULT_AXIS_LABEL_MARGIN +
                                    leftValueLabelGutter,
                            }
                          : {}),
                  },
              }
            : {},
    );

    const rightAxisFormatterConfig = getAxisFormatterConfig({
        axisItem: rightAxisYField,
        defaultNameGap: rightYaxisGap + defaultAxisLabelGap,
        show: showRightYAxis,
        parameters,
        timezone: resolvedTimezone,
        displayTimezone,
    });
    const rightAxisConfigWithStyle: Record<string, unknown> = Object.assign(
        {},
        rightAxisFormatterConfig,
        showRightYAxis && rightAxisFormatterConfig.axisLabel
            ? {
                  axisLabel: {
                      ...getAxisLabelStyle(axisLabelFontSize),
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
        axisType: string,
        min?: number,
        max?: number,
    ) => {
        if (axisType === 'value') {
            const initialBottomAxisMin =
                xAxisConfiguration?.[0]?.min ??
                referenceLineMinBound(referenceLineMinX) ??
                maybeGetAxisDefaultMinValue(allowFirstAxisDefaultRange);

            const initialBottomAxisMax =
                xAxisConfiguration?.[0]?.max ??
                referenceLineMaxBound(referenceLineMaxX) ??
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

                const offsetMin = minX - minOffset;
                const offsetMax = maxX + maxOffset;

                // When a min tick interval is set, snap the truncated bounds to
                // multiples of it so the edge ticks stay clean (e.g. integers)
                // instead of fractional offsets like 0.45 / 3.55
                const minInterval = xAxisConfiguration?.[0]?.minInterval;
                if (minInterval) {
                    return {
                        min: Math.floor(offsetMin / minInterval) * minInterval,
                        max: Math.ceil(offsetMax / minInterval) * minInterval,
                    };
                }

                return {
                    min: offsetMin,
                    max: offsetMax,
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

    // Value-axis positions (0 = primary, 1 = secondary) carrying stacked series.
    // yAxisIndex holds the value-axis position for both orientations.
    const stack100ValueAxes = shouldStack100
        ? (validCartesianConfig.eChartsConfig.series ?? []).reduce<Set<number>>(
              (acc, serie) => {
                  if (
                      serie.stack &&
                      (serie.type === CartesianSeriesType.BAR ||
                          !!serie.areaStyle)
                  ) {
                      acc.add(serie.yAxisIndex ?? 0);
                  }
                  return acc;
              },
              new Set<number>(),
          )
        : new Set<number>();
    const primaryValueAxisStack100 = stack100ValueAxes.has(0);
    const secondaryValueAxisStack100 = stack100ValueAxes.has(1);

    const bottomAxisBounds = getMinAndMaxFromBottomAxisBounds(
        bottomAxisType,
        bottomAxisMinValue,
        bottomAxisMaxValue,
    );

    // Clamp/format the primary value axis as % only when it carries stacked series.
    const clampPrimaryAxisTo100 = shouldStack100 && primaryValueAxisStack100;
    // For 100% stacking with flipped axes, set X-axis max to 100
    const maxXAxisValue =
        bottomAxisType === 'value'
            ? clampPrimaryAxisTo100 && validCartesianConfig.layout.flipAxes
                ? 100 // For 100% stacking with flipped axes, max is always 100
                : bottomAxisBounds.max
            : undefined;

    const maxYAxisValue =
        leftAxisType === 'value'
            ? clampPrimaryAxisTo100 && !validCartesianConfig.layout.flipAxes
                ? 100 // For 100% stacking without flipped axes, max is always 100
                : yAxisConfiguration?.[0]?.max ||
                  referenceLineMaxBound(referenceLineMaxLeftY) ||
                  maybeGetAxisDefaultMaxValue(allowFirstAxisDefaultRange)
            : undefined;

    const minYAxisValue =
        leftAxisType === 'value'
            ? yAxisConfiguration?.[0]?.min ||
              referenceLineMinBound(referenceLineMinLeftY) ||
              maybeGetAxisDefaultMinValue(allowFirstAxisDefaultRange)
            : undefined;

    const showSecondaryXAxis = validCartesianConfig.layout.flipAxes
        ? topAxisXFieldIds && topAxisXFieldIds.length > 0
        : false;
    const showSecondaryYAxis = !validCartesianConfig.layout.flipAxes
        ? rightAxisYFieldIds && rightAxisYFieldIds.length > 0
        : false;

    const bottomAxisLabelConfig = bottomAxisConfigWithStyle.axisLabel
        ? {
              ...bottomAxisConfigWithStyle.axisLabel,
              ...(clampPrimaryAxisTo100 && validCartesianConfig.layout.flipAxes
                  ? { formatter: '{value}%' }
                  : {}),
              ...(!validCartesianConfig.layout.flipAxes &&
              (xAxisConfiguration?.[0] as XAxis | undefined)?.enableDataZoom &&
              bottomAxisType === 'category' &&
              showXAxis
                  ? {
                        interval: 0,
                        hideOverlap: true,
                    }
                  : {}),
              ...(bottomAxisPinnedTickValues
                  ? {
                        customValues: bottomAxisPinnedTickValues,
                        formatter: getPinnedDayTickFormatter(
                            bottomAxisPinnedTickValues,
                        ),
                        rich: { bold: { fontWeight: 'bold' } },
                    }
                  : {}),
          }
        : undefined;

    const leftAxisLabelConfig = leftAxisConfigWithStyle.axisLabel
        ? {
              ...leftAxisConfigWithStyle.axisLabel,
              ...(clampPrimaryAxisTo100 && !validCartesianConfig.layout.flipAxes
                  ? { formatter: '{value}%' }
                  : {}),
              ...(validCartesianConfig.layout.flipAxes &&
              (yAxisConfiguration?.[0] as XAxis | undefined)?.enableDataZoom &&
              leftAxisType === 'category' &&
              showLeftYAxis
                  ? {
                        interval: 0,
                        hideOverlap: false,
                    }
                  : {}),
          }
        : undefined;

    // Secondary value axis (right Y / top X) formats as % when it carries the
    // stacked series. Built directly since it only has an axisLabel with a custom format.
    const clampSecondaryAxisTo100 =
        shouldStack100 && secondaryValueAxisStack100;
    const rightAxisLabelConfig =
        clampSecondaryAxisTo100 && !validCartesianConfig.layout.flipAxes
            ? {
                  ...getAxisLabelStyle(axisLabelFontSize),
                  ...((rightAxisConfigWithStyle.axisLabel as
                      | Record<string, unknown>
                      | undefined) ?? {}),
                  formatter: '{value}%',
              }
            : undefined;
    const topAxisLabelConfig =
        clampSecondaryAxisTo100 && validCartesianConfig.layout.flipAxes
            ? {
                  ...getAxisLabelStyle(axisLabelFontSize),
                  ...((topAxisConfigWithStyle.axisLabel as
                      | Record<string, unknown>
                      | undefined) ?? {}),
                  formatter: '{value}%',
              }
            : undefined;

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
                          nameTextStyle: getAxisTitleStyle(axisTitleFontSize),
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
                inverse: !!xAxisConfiguration?.[0]?.inverse,
                axisTick: {
                    ...getAxisTickStyle(
                        validCartesianConfig?.eChartsConfig?.showAxisTicks,
                    ),
                    ...(bottomAxisPinnedTickValues
                        ? { customValues: bottomAxisPinnedTickValues }
                        : {}),
                },
                // Spread last so a category-date axisTick keeps replacing the
                // tick style (sub-day time axes never set extraConfig.axisTick).
                ...bottomAxisExtraConfig,
                ...(bottomAxisLabelConfig
                    ? { axisLabel: bottomAxisLabelConfig }
                    : {}),
                min: bottomAxisBounds.min,
                max: maxXAxisValue,
                ...(bottomAxisType === 'value' &&
                xAxisConfiguration?.[0]?.minInterval !== undefined
                    ? { minInterval: xAxisConfiguration[0].minInterval }
                    : {}),
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
                          nameTextStyle: getAxisTitleStyle(axisTitleFontSize),
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
                    // eslint-disable-next-line no-nested-ternary
                    topAxisType === 'value'
                        ? clampSecondaryAxisTo100 &&
                          validCartesianConfig.layout.flipAxes
                            ? 100 // secondary value axis normalized to 100%
                            : xAxisConfiguration?.[1]?.max ||
                              maybeGetAxisDefaultMaxValue(
                                  allowSecondAxisDefaultRange,
                              )
                        : undefined,
                ...(topAxisType === 'value' &&
                xAxisConfiguration?.[1]?.minInterval !== undefined
                    ? { minInterval: xAxisConfiguration[1].minInterval }
                    : {}),
                ...topAxisConfigWithStyle,
                ...(topAxisLabelConfig
                    ? { axisLabel: topAxisLabelConfig }
                    : {}),
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
                ...(showLeftYAxis
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
                              ...getAxisTitleStyle(axisTitleFontSize),
                              align: 'center',
                          },
                      }
                    : {}),
                min: minYAxisValue,
                max: maxYAxisValue,
                ...(leftAxisType === 'value' &&
                yAxisConfiguration?.[0]?.minInterval !== undefined
                    ? { minInterval: yAxisConfiguration[0].minInterval }
                    : {}),
                ...leftAxisConfigWithStyle,
                splitLine: validCartesianConfig.layout.flipAxes
                    ? showGridX
                        ? gridStyle
                        : { show: false }
                    : showGridY
                      ? gridStyle
                      : { show: false },
                axisLine: getAxisLineStyle(),
                inverse: !!yAxisConfiguration?.[0]?.inverse,
                axisTick: {
                    ...getAxisTickStyle(
                        validCartesianConfig?.eChartsConfig?.showAxisTicks,
                    ),
                },
                // Spread last so a category-date axisTick keeps replacing the
                // tick style (sub-day time axes never set extraConfig.axisTick).
                ...leftAxisExtraConfig,
                ...(leftAxisLabelConfig
                    ? { axisLabel: leftAxisLabelConfig }
                    : {}),
            },
            {
                type: rightAxisType,
                show: showSecondaryYAxis,
                ...(showRightYAxis
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
                              ...getAxisTitleStyle(axisTitleFontSize),
                              align: 'center',
                          },
                      }
                    : {}),
                min:
                    rightAxisType === 'value'
                        ? yAxisConfiguration?.[1]?.min ||
                          referenceLineMinBound(referenceLineMinRightY) ||
                          maybeGetAxisDefaultMinValue(
                              allowSecondAxisDefaultRange,
                          )
                        : undefined,
                max:
                    // eslint-disable-next-line no-nested-ternary
                    rightAxisType === 'value'
                        ? clampSecondaryAxisTo100 &&
                          !validCartesianConfig.layout.flipAxes
                            ? 100 // secondary value axis normalized to 100%
                            : yAxisConfiguration?.[1]?.max ||
                              referenceLineMaxBound(referenceLineMaxRightY) ||
                              maybeGetAxisDefaultMaxValue(
                                  allowSecondAxisDefaultRange,
                              )
                        : undefined,
                ...(rightAxisType === 'value' &&
                yAxisConfiguration?.[1]?.minInterval !== undefined
                    ? { minInterval: yAxisConfiguration[1].minInterval }
                    : {}),
                ...rightAxisConfigWithStyle,
                ...(rightAxisLabelConfig
                    ? { axisLabel: rightAxisLabelConfig }
                    : {}),
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
        continuousDateRange: selectContinuousDateRange(
            validCartesianConfig.layout.flipAxes,
            bottomAxisExtraConfig,
            leftAxisExtraConfig,
        ),
    };
};

const getValidStack = (series: EChartsSeries | undefined) => {
    return series && (series.type === 'bar' || !!series.areaStyle)
        ? series.stack
        : undefined;
};

type LegendValues = { [name: string]: boolean } | undefined;

const calculateStackTotal = (
    row: Record<string, unknown>,
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
        const numberValue = hash && selected ? toNumber(row[hash]) : 0;
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
    rows: Record<string, unknown>[],
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
    return rows.reduce<[unknown, unknown, number][]>((acc, row) => {
        // Skip padded gap rows: when every stacked series value is absent from
        // the row, this is a date inserted by padDatasetForContinuousAxis and
        // should not render a stack-total label.
        const hasAnyValue = series.some((s) => {
            const valueHash = flipAxis ? s.encode?.x : s.encode?.y;
            return (
                typeof valueHash === 'string' && row[valueHash] !== undefined
            );
        });
        if (!hasAnyValue) return acc;

        const total = calculateStackTotal(
            row,
            series,
            flipAxis,
            selectedLegendNames,
        );
        const hash = flipAxis ? series[0].encode?.y : series[0].encode?.x;
        if (!hash) {
            acc.push([null, null, 0]);
            return acc;
        }
        acc.push(flipAxis ? [0, row[hash], total] : [row[hash], 0, total]);
        return acc;
    }, []);
};

/**
 * Convert stacked series values to per-x percentages for 100% stacking,
 * normalizing each value-axis against its own per-x total so charts with
 * stacked series on the secondary axis are normalized too.
 */
export const transformStack100ByValueAxis = <T extends Record<string, unknown>>(
    rows: T[],
    xFieldId: string,
    stackedSeries: EChartsSeries[],
    flipAxes: boolean | undefined,
): {
    transformedResults: T[];
    originalValues: Map<string, Map<string, number>>;
} => {
    const refsByValueAxis = new Map<number, string[]>();
    stackedSeries.forEach((serie) => {
        if (!serie.stack || !serie.encode) return;
        const hash = flipAxes ? serie.encode.x : serie.encode.y;
        if (typeof hash !== 'string') return;
        // When flipped, the value axis is the X axis, so the axis position lives
        // on xAxisIndex; otherwise it's yAxisIndex.
        const valueAxisIndex = flipAxes
            ? (serie.xAxisIndex ?? 0)
            : (serie.yAxisIndex ?? 0);
        const refs = refsByValueAxis.get(valueAxisIndex) ?? [];
        refs.push(hash);
        refsByValueAxis.set(valueAxisIndex, refs);
    });

    let transformedResults = rows;
    const originalValues = new Map<string, Map<string, number>>();
    refsByValueAxis.forEach((yFieldRefs) => {
        const result = transformToPercentageStacking(
            transformedResults,
            xFieldId,
            yFieldRefs,
        );
        transformedResults = result.transformedResults;
        result.originalValues.forEach((fieldMap, xValue) => {
            const merged = originalValues.get(xValue) ?? new Map();
            fieldMap.forEach((value, field) => merged.set(field, value));
            originalValues.set(xValue, merged);
        });
    });

    return { transformedResults, originalValues };
};

/**
 * Apply conditional formatting colors to stacked bar series, using raw row
 * values for 100%-stack series via a color callback.
 */
export const applyConditionalFormattingToStackedSeries = ({
    seriesList,
    rawRows,
    itemsMap,
    conditionalFormattings,
}: {
    seriesList: EChartsSeries[];
    rawRows: Record<string, unknown>[];
    itemsMap: ItemsMap;
    conditionalFormattings: ConditionalFormattingConfig[];
}): EChartsSeries[] =>
    seriesList.map((series) => {
        if (series.type !== CartesianSeriesType.BAR || !series.stack) {
            return series;
        }

        if (Array.isArray(series.data)) {
            const data = series.data.map((item, rowIndex) => {
                const conditionalColor = getCartesianConditionalFormattingColor(
                    {
                        itemsMap,
                        conditionalFormattings,
                        rowValues: rawRows[rowIndex] ?? {},
                        series,
                    },
                );
                if (!conditionalColor) return item;
                const baseItem =
                    item !== null && typeof item === 'object' && 'value' in item
                        ? (item as {
                              value: unknown;
                              itemStyle?: Record<string, unknown>;
                          })
                        : { value: item, itemStyle: undefined };
                return {
                    ...baseItem,
                    itemStyle: {
                        ...(baseItem.itemStyle ?? {}),
                        color: conditionalColor,
                    },
                };
            });
            return { ...series, data };
        }

        // Series colors are always assigned upstream; keep the type narrow
        const fallbackColor = series.color;
        if (!fallbackColor) return series;

        return {
            ...series,
            itemStyle: {
                ...(series.itemStyle ?? {}),
                color: (params: { dataIndex: number }) =>
                    getCartesianConditionalFormattingColor({
                        itemsMap,
                        conditionalFormattings,
                        rowValues: rawRows[params.dataIndex] ?? {},
                        series,
                    }) ?? fallbackColor,
            },
        };
    });

// To hack the stack totals in echarts we need to create a fake series with the value 0 and display the total in the label
export const getStackTotalSeries = (
    rows: Record<string, unknown>[],
    seriesWithStack: EChartsSeries[],
    itemsMap: ItemsMap,
    flipAxis: boolean | undefined,
    selectedLegendNames: LegendValues,
    isStack100: boolean,
    connectNulls: boolean | undefined = true,
    resolvedTimezone?: string,
    // User-configured max per value axis, used to clamp overflowing totals
    valueAxisMaxes?: (number | undefined)[],
) => {
    const seriesGroupedByStack = groupBy(seriesWithStack, 'stack');
    return Object.entries(seriesGroupedByStack).reduce<EChartsSeries[]>(
        (acc, [stack, series]) => {
            // A series can land at index 0 without a `stackLabel` config (e.g.
            // auto-generated for a new pivot value after a metric-sort reorder).
            // Drive the synthetic stack-total off any saved series in the
            // stack, not just the first one.
            if (
                !stack ||
                !series.length ||
                !series.some((s) => s.stackLabel?.show)
            ) {
                return acc;
            }
            const formatTotal = (param: { data: unknown }) => {
                const stackTotal = Array.isArray(param.data)
                    ? param.data[2]
                    : undefined;
                const fieldId = series[0].pivotReference?.field;
                if (fieldId) {
                    return getFormattedValue(
                        stackTotal,
                        fieldId,
                        itemsMap,
                        undefined,
                        undefined,
                        undefined,
                        resolvedTimezone,
                    );
                }
                return '';
            };
            const totalRows = getStackTotalRows(
                rows,
                series,
                flipAxis,
                selectedLegendNames,
            );
            const stackSeries: EChartsSeries = {
                type: series[0].type,
                ...(series[0].type === CartesianSeriesType.LINE ||
                series[0].type === CartesianSeriesType.AREA
                    ? {
                          connectNulls,
                      }
                    : {}),
                stack: stack,
                clip: !isStack100,
                label: {
                    ...getBarTotalLabelStyle(),
                    show: true,
                    formatter: formatTotal,
                    position: flipAxis ? 'right' : 'top',
                },
                labelLayout: {
                    hideOverlap: !isStack100,
                },
                tooltip: {
                    show: false,
                },
                data: totalRows,
                yAxisIndex: series[0].yAxisIndex,
            };
            acc.push(stackSeries);

            // Totals above a user-configured axis max sit outside the grid, so
            // the zero-height label bar above gets clipped away together with
            // its label. Carry those totals on an invisible, un-stacked line
            // series pinned to the axis max so the label renders at the plot's
            // top edge. In 100% mode data values are transformed ratios while
            // totals stay raw, so the raw-total vs axis-max comparison is
            // meaningless there.
            const axisMax = isStack100
                ? undefined
                : valueAxisMaxes?.[
                      series[0].yAxisIndex ?? series[0].xAxisIndex ?? 0
                  ];
            const clampedRows =
                axisMax === undefined
                    ? []
                    : totalRows
                          .filter((row) => row[2] > axisMax)
                          .map((row) =>
                              flipAxis
                                  ? [axisMax, row[1], row[2]]
                                  : [row[0], axisMax, row[2]],
                          );
            if (clampedRows.length > 0) {
                acc.push({
                    type: CartesianSeriesType.LINE,
                    showSymbol: true,
                    symbolSize: 0,
                    lineStyle: { opacity: 0 },
                    itemStyle: { color: 'transparent' },
                    label: {
                        ...getBarTotalLabelStyle(),
                        show: true,
                        formatter: formatTotal,
                        position: flipAxis ? 'left' : 'bottom',
                        // Keep the label readable over the bar fill
                        textBorderColor: '#fff',
                        textBorderWidth: 2,
                    },
                    labelLayout: {
                        hideOverlap: !isStack100,
                    },
                    tooltip: {
                        show: false,
                    },
                    data: clampedRows,
                    yAxisIndex: series[0].yAxisIndex,
                    xAxisIndex: series[0].xAxisIndex,
                });
            }
            return acc;
        },
        [],
    );
};

// Pivoted/grouped series have no top-level `name`; ECharts derives their legend
// name (the key in the legend selection map) from `encode.seriesName` -> the
// matching dimension's displayName. Resolve that so visibility matches the legend.
const getSeriesLegendName = (serie: EChartsSeries): string | undefined => {
    const seriesNameRef = serie.encode?.seriesName;
    const dimension = seriesNameRef
        ? serie.dimensions?.find((d) => d.name === seriesNameRef)
        : undefined;
    return dimension?.displayName ?? serie.name;
};

const isSeriesVisibleInLegend = (
    serie: EChartsSeries,
    selectedLegends: LegendValues,
): boolean => {
    if (!selectedLegends) return true;
    const legendName = getSeriesLegendName(serie);
    if (legendName === undefined || !(legendName in selectedLegends)) {
        return true;
    }
    return selectedLegends[legendName] !== false;
};

const getMarkLineData = (
    markLine: Record<string, unknown> | undefined,
): MarkLineData[] => {
    const data = (markLine as { data?: MarkLineData[] } | undefined)?.data;
    return data ?? [];
};

// Series-relative reference lines (e.g. "use series average") belong to their
// own series and should hide with it; only absolute-value lines get relocated.
const SERIES_RELATIVE_MARKLINE_TYPES = ['average', 'min', 'max', 'median'];
const isRelocatableMarkLineData = (entry: MarkLineData): boolean =>
    !SERIES_RELATIVE_MARKLINE_TYPES.includes(
        (entry as { type?: string }).type ?? '',
    );

// Reference lines (markLines) are attached to a single data series at config
// time. Hiding that series via the interactive legend hides its markLine too,
// so re-attach orphaned reference lines to a still-visible series.
export const relocateMarkLinesToVisibleSeries = (
    series: EChartsSeries[],
    selectedLegends: LegendValues,
): EChartsSeries[] => {
    if (!selectedLegends) return series;

    const hiddenWithMarkLine = series.filter(
        (serie) =>
            !isSeriesVisibleInLegend(serie, selectedLegends) &&
            getMarkLineData(serie.markLine).length > 0,
    );
    const orphanedData = hiddenWithMarkLine
        .flatMap((serie) => getMarkLineData(serie.markLine))
        .filter(isRelocatableMarkLineData);
    if (orphanedData.length === 0) return series;

    const preferredHostIndex = series.findIndex(
        (serie) =>
            serie.encode !== undefined &&
            isSeriesVisibleInLegend(serie, selectedLegends) &&
            getMarkLineData(serie.markLine).length === 0,
    );
    const fallbackHostIndex = series.findIndex(
        (serie) =>
            serie.encode !== undefined &&
            isSeriesVisibleInLegend(serie, selectedLegends),
    );
    const hostIndex =
        preferredHostIndex !== -1 ? preferredHostIndex : fallbackHostIndex;
    if (hostIndex === -1) return series;

    const templateMarkLine =
        (series[hostIndex].markLine as Record<string, unknown> | undefined) ??
        (hiddenWithMarkLine[0].markLine as Record<string, unknown>);

    return series.map((serie, index) => {
        if (index === hostIndex) {
            return {
                ...serie,
                markLine: {
                    ...templateMarkLine,
                    data: [...getMarkLineData(serie.markLine), ...orphanedData],
                },
            };
        }
        if (isSeriesVisibleInLegend(serie, selectedLegends)) return serie;
        // hidden series: drop the lines we relocated, keep series-relative ones
        const original = getMarkLineData(serie.markLine);
        const kept = original.filter((e) => !isRelocatableMarkLineData(e));
        if (kept.length === original.length) return serie;
        return {
            ...serie,
            markLine:
                kept.length > 0
                    ? {
                          ...(serie.markLine as Record<string, unknown>),
                          data: kept,
                      }
                    : undefined,
        };
    });
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
        isTouchDevice,
        colorPalette,
        resolvedTimezone,
    } = useVisualizationContext();

    const theme = useMantineTheme();

    const validCartesianConfig = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig.validConfig;
    }, [visualizationConfig]);

    const { timeAxisField, axisTimezone, axisDisplayTimezone } = useMemo(
        () =>
            resolveAxisTimezone({
                validCartesianConfig,
                itemsMap,
                resolvedTimezone,
            }),
        [resolvedTimezone, validCartesianConfig, itemsMap],
    );

    const tooltipConfig = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig.tooltip;
    }, [visualizationConfig]);

    const tooltipSortConfig = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig.tooltipSort;
    }, [visualizationConfig]);

    const pivotValuesColumnsMap = useMemo(() => {
        if (!resultsData?.pivotDetails) return;
        return convertPivotValuesColumnsIntoMap(
            resultsData.pivotDetails.valuesColumns,
        );
    }, [resultsData?.pivotDetails]);

    const { rows: allRows, rowKeyMap } = useMemo(
        () => getPivotedDataFromPivotDetails(resultsData, undefined),
        [resultsData],
    );

    const rows = useMemo(
        () => sliceRows(allRows, validCartesianConfig?.rowLimit),
        [allRows, validCartesianConfig?.rowLimit],
    );

    // Pivot references from hidden series, used for resolving custom tooltip references
    // to fields that are on the Y axis but have their chart series hidden.
    const hiddenSeriesPivotRefs = useMemo(() => {
        const allConfigSeries =
            validCartesianConfig?.eChartsConfig?.series ?? [];
        return allConfigSeries
            .filter(
                (s) => s.hidden && isPivotReferenceWithValues(s.encode.yRef),
            )
            .map((s) => s.encode.yRef);
    }, [validCartesianConfig?.eChartsConfig?.series]);

    const resultsAndMinsAndMaxes = useMemo(
        () => getResultValueArray(rows, true, true),
        [rows],
    );

    const series = useMemo(() => {
        if (!itemsMap || !validCartesianConfig || !resultsData) {
            return [];
        }

        const unfilteredSeries = getEchartsSeriesFromPivotedData(
            itemsMap,
            validCartesianConfig,
            rowKeyMap,
            pivotValuesColumnsMap,
            parameters,
            undefined,
            resolvedTimezone,
        );

        return filterSeriesWithNoData(
            unfilteredSeries,
            resultsAndMinsAndMaxes.results,
            validCartesianConfig?.rowLimit,
        );
    }, [
        validCartesianConfig,
        resultsData,
        itemsMap,
        rowKeyMap,
        pivotValuesColumnsMap,
        parameters,
        resultsAndMinsAndMaxes.results,
        resolvedTimezone,
    ]);

    const axes = useMemo(() => {
        if (!itemsMap || !validCartesianConfig) {
            return {
                xAxis: [] as Record<string, unknown>[],
                yAxis: [] as Record<string, unknown>[],
                continuousDateRange: undefined as string[] | undefined,
            };
        }

        return getEchartAxes({
            itemsMap,
            series,
            validCartesianConfig,
            resultsData,
            displayedRows: validCartesianConfig?.rowLimit ? rows : undefined,
            minsAndMaxes: resultsAndMinsAndMaxes.minsAndMaxes,
            parameters,
            resolvedTimezone: axisTimezone,
            displayTimezone: axisDisplayTimezone,
            isTimeAxisShifted: timeAxisField !== undefined,
        });
    }, [
        itemsMap,
        validCartesianConfig,
        series,
        resultsData,
        rows,
        resultsAndMinsAndMaxes.minsAndMaxes,
        parameters,
        axisTimezone,
        axisDisplayTimezone,
        timeAxisField,
    ]);

    // Shared by stackedSeriesWithColorAssignments (non-stacked bar styling) and
    // decoratedSeriesForChart (stacked rounded corners). Same inputs in both
    // places — keep the calc in one spot.
    const dynamicRadius = useMemo(() => {
        const isHorizontal = Boolean(validCartesianConfig?.layout.flipAxes);
        const barSeries = series.filter(
            (s) => s.type === CartesianSeriesType.BAR,
        );
        const isStacked = barSeries.some((s) => s.stack);
        const nonStackedBarCount = isStacked
            ? barSeries.filter((s) => !s.stack).length
            : barSeries.length;
        return calculateDynamicBorderRadius(
            rows.length,
            Math.max(1, nonStackedBarCount),
            isStacked,
            isHorizontal,
        );
    }, [rows.length, series, validCartesianConfig?.layout.flipAxes]);

    const stackedSeriesWithColorAssignments = useMemo(() => {
        if (!itemsMap) return;

        const isHorizontal = Boolean(validCartesianConfig?.layout.flipAxes);
        // Value-type dimension axes don't reserve band space for bars, so the
        // end bar gets clipped at the grid edge. clip:false lets it overflow
        // into the margin. Category/date axes band-space bars and are left as-is.
        // Excluded when dataZoom is on: clip:false would also let bars outside
        // the scroll window render past the grid over the slider/labels.
        const dimensionAxis = isHorizontal ? axes.yAxis[0] : axes.xAxis[0];
        const enableDataZoom = Boolean(
            validCartesianConfig?.eChartsConfig?.xAxis?.[0]?.enableDataZoom,
        );
        const shouldDisableBarClip =
            dimensionAxis?.type === 'value' && !enableDataZoom;
        const conditionalFormattings =
            validCartesianConfig?.conditionalFormattings;
        const categoryColorOverrides =
            validCartesianConfig?.layout?.categoryColorOverrides;
        // xField is always the dimension (category) field regardless of flipAxes.
        // flipAxes only swaps which axis renders which field via `encode`,
        // it does NOT swap xField/yField in the layout.
        const categoryFieldId = validCartesianConfig?.layout?.xField;

        const barSeries = series.filter(
            (s) => s.type === CartesianSeriesType.BAR,
        );
        const hasCustomColorsStacking =
            barSeries.some((s) => Boolean(s.stack)) ||
            (validCartesianConfig?.layout?.stack !== undefined &&
                validCartesianConfig.layout.stack !== StackType.NONE);
        // Color by category only applies to ungrouped, unstacked
        // single-series charts; ignore the setting when pivots or stacking are
        // active so saved configs can restore if the chart becomes eligible
        // again in edit mode.
        const isColorByCategory =
            Boolean(validCartesianConfig?.layout?.colorByCategory) &&
            !pivotDimensions?.length &&
            !hasCustomColorsStacking;
        // Applies per bar series on all-bar charts: each config routes to its
        // target field, so multi-metric charts color each metric's bars
        // independently. Stacked series are handled downstream after stack
        // decoration.
        const shouldApplyConditionalFormatting =
            series.length > 0 &&
            barSeries.length === series.length &&
            !pivotDimensions?.length &&
            !isColorByCategory &&
            Boolean(conditionalFormattings?.length);

        const seriesColors = series.map((serie) => getSeriesColor(serie));

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
                                computedColor,
                            ),
                        },
                        labelLayout: { hideOverlap: true },
                    }),
                    // Apply reference line styling with readable colors
                    ...(serie.markLine && {
                        markLine: applyReadableColorsToMarkLine(
                            serie.markLine as MarkLine,
                            computedColor,
                            theme.colors.background[0],
                        ),
                    }),
                };

                // Apply bar styling for bar charts
                if (serie.type === CartesianSeriesType.BAR) {
                    const barConfig = {
                        ...baseConfig,
                        ...getBarStyle(),
                        ...(shouldDisableBarClip ? { clip: false } : {}),
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

                    if (
                        shouldApplyConditionalFormatting &&
                        getValidStack(serie) === undefined
                    ) {
                        return {
                            ...barConfig,
                            colorBy: 'data' as const,
                            itemStyle: {
                                ...barConfig.itemStyle,
                                color: (params: {
                                    data: Record<string, unknown>;
                                }) =>
                                    getCartesianConditionalFormattingColor({
                                        itemsMap,
                                        conditionalFormattings,
                                        rowValues: params.data,
                                        series: serie,
                                    }) ?? computedColor,
                            },
                        };
                    }

                    // Color by category: each bar gets a unique color
                    if (isColorByCategory) {
                        return {
                            ...barConfig,
                            colorBy: 'data' as const,
                            itemStyle: {
                                ...barConfig.itemStyle,
                                color: (params: {
                                    dataIndex: number;
                                    name: string;
                                    data: Record<string, unknown>;
                                }) => {
                                    const categoryValue = categoryFieldId
                                        ? String(
                                              params.data[categoryFieldId] ??
                                                  '',
                                          )
                                        : '';
                                    if (
                                        categoryColorOverrides?.[categoryValue]
                                    ) {
                                        return categoryColorOverrides[
                                            categoryValue
                                        ];
                                    }
                                    return colorPalette[
                                        params.dataIndex % colorPalette.length
                                    ];
                                },
                            },
                        };
                    }

                    return barConfig;
                }

                return baseConfig;
            },
        );

        // Rounded corners and stack-total labels are applied downstream in
        // `decoratedSeriesForChart` so they can consume `paddedSortedResults`
        // (the canonicalized, flat dataset that backs xAxis.data). Returning
        // the un-decorated series here keeps internal consumers (sort,
        // 100%-stack, color overrides) reading raw values as before.
        return seriesWithValidStack;
    }, [
        itemsMap,
        validCartesianConfig?.layout.flipAxes,
        validCartesianConfig?.layout?.stack,
        validCartesianConfig?.layout?.colorByCategory,
        validCartesianConfig?.layout?.categoryColorOverrides,
        validCartesianConfig?.layout?.xField,
        validCartesianConfig?.conditionalFormattings,
        validCartesianConfig?.eChartsConfig?.xAxis,
        series,
        dynamicRadius,
        pivotDimensions,
        getSeriesColor,
        colorPalette,
        theme.colors.background,
        axes.xAxis,
        axes.yAxis,
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

        // When xField is EMPTY_X_AXIS (no x-axis dimension, bars are pivoted series),
        // row-based sorting is meaningless (single row) and produces undefined category values.
        // Series-level sorting for this case is handled separately in sortedSeriesForChart.
        if (xFieldId === EMPTY_X_AXIS) {
            return {
                xAxisSortedResults: sortedResults,
                xAxisSortedCategoryValues: undefined,
            };
        }

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
                sortedResults,
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
        validCartesianConfigLegend,
    ]);

    const paddedSortedResults = useMemo(() => {
        const continuousRange = axes.continuousDateRange;
        const dateFieldId = validCartesianConfig?.layout?.xField;
        if (!continuousRange || !dateFieldId) return xAxisSortedResults;
        return padDatasetForContinuousAxis(
            xAxisSortedResults,
            continuousRange,
            dateFieldId,
        );
    }, [
        xAxisSortedResults,
        axes.continuousDateRange,
        validCartesianConfig?.layout?.xField,
    ]);

    // Convert raw values to per-x percentages for 100% stacking. Stack-total
    // labels read `paddedSortedResults` directly so they see raw values.
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
                dataToRender: paddedSortedResults,
                originalValues: undefined,
            };
        }

        const { transformedResults, originalValues: originalValuesMap } =
            transformStack100ByValueAxis(
                paddedSortedResults,
                xFieldId,
                stackedSeriesWithColorAssignments,
                validCartesianConfig?.layout.flipAxes,
            );

        return {
            dataToRender: transformedResults,
            originalValues: originalValuesMap,
        };
    }, [
        paddedSortedResults,
        validCartesianConfig?.layout?.stack,
        validCartesianConfig?.layout?.xField,
        validCartesianConfig?.layout.flipAxes,
        stackedSeriesWithColorAssignments,
    ]);

    // Decorate the stacked series off the same padded dataset: cats match
    // xAxis.data exactly, and stack totals read raw values instead of the
    // 100%-stack ratios. Rounded corners are skipped in 100% mode.
    const decoratedSeriesForChart = useMemo(() => {
        if (!stackedSeriesWithColorAssignments || !itemsMap) {
            return stackedSeriesWithColorAssignments;
        }

        const isHorizontal = !!validCartesianConfig?.layout?.flipAxes;
        const stackValue = validCartesianConfig?.layout?.stack;
        const isStack100 = stackValue === StackType.PERCENT;
        const isStackNone = stackValue === StackType.NONE;

        const stackedBarSeries = stackedSeriesWithColorAssignments.filter(
            (s) =>
                s.type === CartesianSeriesType.BAR &&
                s.stack &&
                !isStack100 &&
                !isStackNone,
        );

        const seriesWithRoundedStacks =
            stackedBarSeries.length > 0
                ? applyRoundedCornersToStackData(
                      stackedSeriesWithColorAssignments,
                      paddedSortedResults,
                      {
                          radius: dynamicRadius,
                          isHorizontal,
                          legendSelected: validCartesianConfigLegend,
                      },
                  )
                : stackedSeriesWithColorAssignments;

        // Runs before stack totals are appended so the synthetic total
        // series stays untouched
        const conditionalFormattings =
            validCartesianConfig?.conditionalFormattings;
        const shouldApplyStackConditionalFormatting =
            Boolean(conditionalFormattings?.length) &&
            !pivotDimensions?.length &&
            stackedSeriesWithColorAssignments.every(
                (s) => s.type === CartesianSeriesType.BAR,
            );

        const seriesWithStackConditionalFormatting =
            shouldApplyStackConditionalFormatting && conditionalFormattings
                ? applyConditionalFormattingToStackedSeries({
                      seriesList: seriesWithRoundedStacks,
                      rawRows: paddedSortedResults,
                      itemsMap,
                      conditionalFormattings,
                  })
                : seriesWithRoundedStacks;

        // User-configured value-axis maxes; the value axis config lives in
        // eChartsConfig.yAxis for both orientations (flipped charts apply it
        // to the echarts x axis).
        const valueAxisMaxes = [0, 1].map((axisIndex) => {
            const rawMax =
                validCartesianConfig?.eChartsConfig?.yAxis?.[axisIndex]?.max;
            if (rawMax === undefined || rawMax === '') return undefined;
            const parsedMax = parseFloat(rawMax);
            return Number.isNaN(parsedMax) ? undefined : parsedMax;
        });

        return [
            ...seriesWithStackConditionalFormatting,
            ...getStackTotalSeries(
                paddedSortedResults,
                seriesWithStackConditionalFormatting,
                itemsMap,
                validCartesianConfig?.layout.flipAxes,
                validCartesianConfigLegend,
                isStack100,
                validCartesianConfig?.layout.connectNulls,
                resolvedTimezone,
                valueAxisMaxes,
            ),
        ];
    }, [
        stackedSeriesWithColorAssignments,
        paddedSortedResults,
        dynamicRadius,
        itemsMap,
        pivotDimensions,
        validCartesianConfig?.conditionalFormattings,
        validCartesianConfig?.layout?.stack,
        validCartesianConfig?.layout?.flipAxes,
        validCartesianConfig?.layout.connectNulls,
        validCartesianConfig?.eChartsConfig?.yAxis,
        validCartesianConfigLegend,
        resolvedTimezone,
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
            ...getTooltipStyle({ appendToBody: !isTouchDevice }),
            extraCssText: `overflow-y: auto; max-height:280px; ${
                getTooltipStyle({ appendToBody: !isTouchDevice }).extraCssText
            }`,
            axisPointer: getAxisPointerStyle(hasLineAreaScatterSeries),
            formatter: buildCartesianTooltipFormatter({
                itemsMap,
                stackValue: validCartesianConfig?.layout?.stack,
                flipAxes: validCartesianConfig?.layout.flipAxes,
                xFieldId: validCartesianConfig?.layout?.xField,
                originalValues,
                series,
                hiddenSeriesPivotRefs,
                tooltipHtmlTemplate: tooltipConfig,
                tooltipSort: tooltipSortConfig,
                pivotValuesColumnsMap,
                parameters,
                rows: dataToRender,
                timezone: axisTimezone,
                displayTimezone: axisDisplayTimezone,
            }),
        };
    }, [
        itemsMap,
        validCartesianConfig?.layout.flipAxes,
        validCartesianConfig?.layout?.stack,
        validCartesianConfig?.layout?.xField,
        tooltipConfig,
        tooltipSortConfig,
        pivotValuesColumnsMap,
        originalValues,
        parameters,
        series,
        hiddenSeriesPivotRefs,
        dataToRender,
        isTouchDevice,
        axisTimezone,
        axisDisplayTimezone,
    ]);

    // Calculate max stack label padding for 100% stacking grid
    // Returns { right, top } padding values based on chart orientation
    const stackLabelPaddingCalc = useMemo(() => {
        const isStack100 =
            validCartesianConfig?.layout?.stack === StackType.PERCENT;
        if (
            !isStack100 ||
            !stackedSeriesWithColorAssignments ||
            !itemsMap ||
            !paddedSortedResults
        )
            return { right: 0, top: 0 };

        const hasStackLabels = stackedSeriesWithColorAssignments.some(
            (s) => s.stackLabel?.show,
        );
        if (!hasStackLabels) return { right: 0, top: 0 };

        const flipAxis = validCartesianConfig?.layout?.flipAxes;
        const seriesWithStack = stackedSeriesWithColorAssignments.filter(
            (s) => s.stack,
        );

        // Group by stack and calculate max formatted label width
        const seriesGroupedByStack = groupBy(seriesWithStack, 'stack');
        let maxCharCount = 0;

        Object.entries(seriesGroupedByStack).forEach(([stack, stackSeries]) => {
            if (!stack || !stackSeries.some((s) => s.stackLabel?.show)) return;

            const stackTotalData = getStackTotalRows(
                paddedSortedResults,
                stackSeries,
                flipAxis,
                validCartesianConfigLegend,
            );
            const fieldId = stackSeries[0].pivotReference?.field;

            if (fieldId) {
                stackTotalData.forEach((dataPoint) => {
                    const total = dataPoint[2];
                    const formatted = getFormattedValue(
                        total,
                        fieldId,
                        itemsMap,
                        undefined,
                        undefined,
                        undefined,
                        resolvedTimezone,
                    );
                    maxCharCount = Math.max(maxCharCount, formatted.length);
                });
            }
        });

        if (flipAxis) {
            // ~7px per character + 10px buffer
            return { right: maxCharCount * 7 + 10, top: 0 };
        } else {
            // Vertical bars: labels on top, need height-based padding
            // Fixed ~25px for label height (font size + small margin)
            return { right: 0, top: maxCharCount > 0 ? 25 : 0 };
        }
    }, [
        stackedSeriesWithColorAssignments,
        itemsMap,
        paddedSortedResults,
        validCartesianConfig?.layout?.stack,
        validCartesianConfig?.layout?.flipAxes,
        validCartesianConfigLegend,
        resolvedTimezone,
    ]);

    const currentGrid = useMemo(() => {
        const enableDataZoom =
            validCartesianConfig?.eChartsConfig?.xAxis?.[0]?.enableDataZoom;
        const flipAxes = validCartesianConfig?.layout?.flipAxes;

        const grid: {
            containLabel: boolean;
            left: string;
            right: string;
            top: string;
            bottom: string;
        } = {
            ...defaultGrid,
            ...removeEmptyProperties(validCartesianConfig?.eChartsConfig.grid),
        };

        const legendConfig = removeEmptyProperties(
            validCartesianConfig?.eChartsConfig.legend,
        );
        const isLegendShown = legendConfig
            ? 'show' in legendConfig
                ? legendConfig.show !== false
                : true
            : series.length > 1;

        const hasExplicitTop =
            validCartesianConfig?.eChartsConfig.grid?.top !== undefined;
        if (isLegendShown && !hasExplicitTop && isPxValue(grid.top)) {
            grid.top = addPx(grid.top, legendTopSpacing);
        }

        const gridWithPlacement = applyLegendPlacementToGrid(
            grid,
            legendConfig,
            isLegendShown,
            validCartesianConfig?.eChartsConfig.grid,
        );
        grid.left = gridWithPlacement.left;
        grid.right = gridWithPlacement.right;

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
            left: isPxValue(gridLeft)
                ? addPx(gridLeft, defaultAxisLabelGap + extraLeftPadding)
                : grid.left,
            right:
                isPxValue(gridRight) && !enableDataZoom
                    ? addPx(
                          gridRight,
                          defaultAxisLabelGap +
                              extraRightPadding +
                              stackLabelPaddingCalc.right,
                      )
                    : isPxValue(gridRight) && enableDataZoom && flipAxes
                      ? addPx(
                            gridRight,
                            defaultAxisLabelGap +
                                extraRightPadding +
                                stackLabelPaddingCalc.right +
                                30,
                        )
                      : grid.right,
            // Add extra top spacing for 100% stacking labels when not flipped (vertical bars)
            top:
                stackLabelPaddingCalc.top > 0 && isPxValue(grid.top)
                    ? addPx(grid.top, stackLabelPaddingCalc.top)
                    : grid.top,
            // Add extra bottom spacing for dataZoom slider when not flipped
            bottom:
                enableDataZoom && !flipAxes && isPxValue(gridBottom)
                    ? addPx(gridBottom, 30)
                    : grid.bottom,
        };
    }, [
        validCartesianConfig?.eChartsConfig.grid,
        validCartesianConfig?.eChartsConfig?.xAxis,
        validCartesianConfig?.eChartsConfig.legend,
        validCartesianConfig?.layout?.flipAxes,
        series,
        stackLabelPaddingCalc,
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

    // When xField is EMPTY_X_AXIS (pivoted bars with no x-axis dimension),
    // sorting must reorder the series array since bars are series, not categories.
    const sortedSeriesForChart = useMemo(() => {
        if (!decoratedSeriesForChart?.length) {
            return decoratedSeriesForChart;
        }

        const xFieldId = validCartesianConfig?.layout?.xField;
        if (xFieldId !== EMPTY_X_AXIS) {
            return decoratedSeriesForChart;
        }

        const xAxisConfig = validCartesianConfig?.eChartsConfig.xAxis?.[0];
        const sortType = xAxisConfig?.sortType ?? XAxisSortType.DEFAULT;
        const isInverse = xAxisConfig?.inverse ?? false;

        if (sortType === XAxisSortType.DEFAULT && !isInverse) {
            return decoratedSeriesForChart;
        }

        const sorted = [...decoratedSeriesForChart];

        if (sortType === XAxisSortType.CATEGORY) {
            // Sort by series name (pivot value label) alphabetically
            sorted.sort((a, b) => {
                const nameA = String(a.name ?? '');
                const nameB = String(b.name ?? '');
                return nameA.localeCompare(nameB);
            });
        } else if (sortType === XAxisSortType.BAR_TOTALS) {
            // Sort by metric value from the dataset row
            const row = xAxisSortedResults[0];
            if (row) {
                sorted.sort((a, b) => {
                    const yKeyA = a.encode?.y;
                    const yKeyB = b.encode?.y;
                    const rawA = yKeyA
                        ? (row as Record<string, unknown>)[yKeyA]
                        : undefined;
                    const rawB = yKeyB
                        ? (row as Record<string, unknown>)[yKeyB]
                        : undefined;
                    const valA = Number(
                        typeof rawA === 'object' && rawA !== null
                            ? (rawA as { value: unknown }).value
                            : (rawA ?? 0),
                    );
                    const valB = Number(
                        typeof rawB === 'object' && rawB !== null
                            ? (rawB as { value: unknown }).value
                            : (rawB ?? 0),
                    );
                    return valA - valB;
                });
            }
        }

        // For DEFAULT with inverse, or CATEGORY/BAR_TOTALS with inverse (descending),
        // reverse the sorted order
        if (isInverse) {
            sorted.reverse();
        }

        return sorted;
    }, [
        decoratedSeriesForChart,
        validCartesianConfig?.layout?.xField,
        validCartesianConfig?.eChartsConfig.xAxis,
        xAxisSortedResults,
    ]);

    const eChartsOptions = useMemo(() => {
        const enableDataZoom =
            validCartesianConfig?.eChartsConfig?.xAxis?.[0]?.enableDataZoom;
        const flipAxes = validCartesianConfig?.layout?.flipAxes;
        const resolvedLabels = resolveCartesianGranularityLabels({
            xAxis: sortedAxes.xAxis,
            yAxis: sortedAxes.yAxis,
            series: sortedSeriesForChart,
            granularityMap: getGranularityMapFromItems(itemsMap),
        });

        const dataZoomAnchor =
            validCartesianConfig?.eChartsConfig?.xAxis?.[0]?.dataZoomAnchor ??
            'start';
        const dataZoomItemCount =
            validCartesianConfig?.eChartsConfig?.xAxis?.[0]
                ?.dataZoomItemCount ?? 10;
        const dataZoomSpan = Math.max(1, dataZoomItemCount - 1);
        const dataZoomLastIndex = Math.max(0, dataToRender.length - 1);
        const dataZoomStartValue =
            dataZoomAnchor === 'end'
                ? Math.max(0, dataZoomLastIndex - dataZoomSpan)
                : 0;
        const dataZoomEndValue =
            dataZoomAnchor === 'end'
                ? dataZoomLastIndex
                : Math.min(dataZoomLastIndex, dataZoomSpan);

        const baseOptions = {
            xAxis: resolvedLabels.xAxis,
            yAxis: resolvedLabels.yAxis,
            useUTC: true,
            series: relocateMarkLinesToVisibleSeries(
                resolvedLabels.series,
                validCartesianConfigLegend,
            ),
            animation: !(isInDashboard || minimal),
            legend: legendConfigWithInstructionsTooltip,
            dataset: {
                id: 'lightdashResults',
                source: dataToRender,
            },
            tooltip,
            grid: currentGrid,
            textStyle: {
                fontFamily: sanitizeEchartsFontFamily(
                    theme?.other.chartFont as string | undefined,
                ),
            },
            // We assign colors per series, so we specify an empty list here.
            color: [],
            ...(enableDataZoom && {
                dataZoom: [
                    {
                        type: 'slider',
                        show: true,
                        [flipAxes ? 'yAxisIndex' : 'xAxisIndex']: 0,
                        startValue: dataZoomStartValue,
                        endValue: dataZoomEndValue,
                        brushSelect: false,
                        zoomLock: true,
                        minValueSpan: dataZoomSpan,
                        maxValueSpan: dataZoomSpan,
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

        return timeAxisField
            ? applyTimezoneShiftToEchartsOptions(baseOptions, timeAxisField)
            : baseOptions;
    }, [
        sortedAxes,
        sortedSeriesForChart,
        itemsMap,
        validCartesianConfigLegend,
        isInDashboard,
        minimal,
        legendConfigWithInstructionsTooltip,
        dataToRender,
        tooltip,
        currentGrid,
        theme?.other.chartFont,
        validCartesianConfig,
        timeAxisField,
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
