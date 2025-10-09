import {
    applyCustomFormat,
    assertUnreachable,
    CartesianSeriesType,
    DimensionType,
    formatItemValue,
    formatValueWithExpression,
    friendlyName,
    getAxisName,
    getCustomFormatFromLegacy,
    getDateGroupLabel,
    getItemLabelWithoutTableName,
    getItemType,
    getResultValueArray,
    hasFormatting,
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
    isTimeInterval,
    MetricType,
    TableCalculationType,
    timeFrameConfigs,
    TimeFrames,
    XAxisSortType,
    type CartesianChart,
    type CustomDimension,
    type Field,
    type Item,
    type ItemsMap,
    type PivotReference,
    type PivotValuesColumn,
    type ResultRow,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import dayjs from 'dayjs';
import DOMPurify from 'dompurify';
import {
    type DefaultLabelFormatterCallbackParams,
    type LineSeriesOption,
    type TooltipComponentFormatterCallback,
    type TooltipComponentOption,
} from 'echarts';
import groupBy from 'lodash/groupBy';
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
    symbolSize?: number;
};

const convertPivotValuesColumnsIntoMap = (
    valuesColumns?: PivotValuesColumn[],
) => {
    if (!valuesColumns) return;
    return Object.fromEntries(
        valuesColumns.map((column) => [column.pivotColumnName, column]),
    );
};

export const getFormattedValue = (
    value: any,
    key: string,
    itemsMap: ItemsMap,
    convertToUTC: boolean = true,
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null,
): string => {
    const pivotValuesColumn = pivotValuesColumnsMap?.[key];
    const item = itemsMap[pivotValuesColumn?.referenceField ?? key];
    return formatItemValue(item, value, convertToUTC);
};

const valueFormatter =
    (
        yFieldId: string,
        itemsMap: ItemsMap,
        pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null,
    ) =>
    (rawValue: any) => {
        return getFormattedValue(
            rawValue,
            yFieldId,
            itemsMap,
            undefined,
            pivotValuesColumnsMap,
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
    series: string[] | undefined,
    rows: ResultRow[],
): (string | number)[] => {
    if (!series || series.length === 0) return [];

    let rawValues = [];
    for (const s of series) {
        for (const row of rows) {
            rawValues.push(row[s]?.value.raw);
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
    );
    const [minValueRightY, maxValueRightY] = getMinAndMaxValues(
        rightAxisYFieldIds,
        rows,
    );
    const [minValueX, maxValueX] = getMinAndMaxValues(
        bottomAxisXFieldIds,
        rows,
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
};

const seriesValueFormatter = (item: Item, value: unknown) => {
    if (hasValidFormatExpression(item)) {
        return formatValueWithExpression(item.format, value);
    }

    if (isCustomDimension(item)) {
        return value;
    }
    if (isTableCalculation(item)) {
        return formatItemValue(item, value);
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

const getPivotSeries = ({
    series,
    pivotReference,
    itemsMap,
    xFieldHash,
    yFieldHash,
    flipAxes,
    cartesianChart,
    pivotValuesColumnsMap,
}: GetPivotSeriesArg): EChartSeries => {
    const pivotLabel = pivotReference.pivotValues.reduce(
        (acc, { field, value }) => {
            const formattedValue = getFormattedValue(
                value,
                field,
                itemsMap,
                undefined,
                pivotValuesColumnsMap,
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
            ),
        },
        showSymbol: series.showSymbol ?? true,
        ...(series.label?.show && {
            label: {
                ...series.label,
                ...(itemsMap &&
                    itemsMap[series.encode.yRef.field] && {
                        formatter: (value: any) => {
                            const field = itemsMap[series.encode.yRef.field];
                            const rawValue = value?.value?.[yFieldHash];
                            return seriesValueFormatter(field, rawValue);
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
};

const getSimpleSeries = ({
    series,
    flipAxes,
    yFieldHash,
    xFieldHash,
    itemsMap,
    pivotValuesColumnsMap,
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
        ),
    },
    ...getSimpleSeriesSymbolConfig(series),
    ...(series.label?.show && {
        label: {
            ...series.label,
            ...(itemsMap &&
                itemsMap[yFieldHash] && {
                    formatter: (value: any) => {
                        const field = itemsMap[yFieldHash];
                        const rawValue = value?.value?.[yFieldHash];
                        return seriesValueFormatter(field, rawValue);
                    },
                }),
        },
        labelLayout: {
            hideOverlap: true,
        },
    }),
});

// New series generation for pre-pivoted data from backend
const getEchartsSeriesFromPivotedData = (
    itemsMap: ItemsMap,
    cartesianChart: CartesianChart,
    rowKeyMap: RowKeyMap,
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn> | null,
): EChartSeries[] => {
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

    const resultSeries = allSeries
        .filter((s) => !s.hidden)
        .sort((a, b) => {
            const aColumnName = findMatchingColumnName(a);
            const bColumnName = findMatchingColumnName(b);

            if (aColumnName && bColumnName && pivotValuesColumnsMap) {
                const aColumn = pivotValuesColumnsMap[aColumnName];
                const bColumn = pivotValuesColumnsMap[bColumnName];

                if (
                    aColumn?.columnIndex !== undefined &&
                    bColumn?.columnIndex !== undefined
                ) {
                    return aColumn.columnIndex - bColumn.columnIndex;
                }
            }

            return 0;
        })
        .map<EChartSeries>((series) => {
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
            });
        });

    return resultSeries;
};

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

const getLongestLabel = ({
    rows = [],
    axisId,
}: {
    rows?: ResultRow[];
    axisId?: string;
}): string | undefined => {
    return (
        axisId &&
        rows
            .map((row) => row[axisId]?.value.formatted)
            .reduce<string>(
                (acc, p) => (p && acc.length > p.length ? acc : p),
                '',
            )
    );
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
}: {
    validCartesianConfig: CartesianChart;
    itemsMap: ItemsMap;
    series: EChartSeries[];
    resultsData: InfiniteQueryResults | undefined;
    minsAndMaxes: ReturnType<typeof getResultValueArray>['minsAndMaxes'];
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

    const getAxisFormatter = ({
        axisItem,
        longestLabelWidth,
        rotate,
        defaultNameGap,
        show,
    }: {
        axisItem: ItemsMap[string] | undefined;
        longestLabelWidth?: number;
        rotate?: number;
        defaultNameGap?: number;
        show?: boolean;
    }) => {
        // Remove axis labels, lines, and ticks if the axis is not shown
        // This is done to prevent the grid from disappearing when the axis is not shown
        if (!show) {
            return {
                axisLabel: undefined,
                axisLine: {
                    show,
                },
                axisTick: {
                    show,
                },
            };
        }

        const isTimestamp =
            isField(axisItem) &&
            (axisItem.type === DimensionType.DATE ||
                axisItem.type === DimensionType.TIMESTAMP);
        // Only apply axis formatting if the axis is NOT a date or timestamp
        const hasFormattingConfig = !isTimestamp && hasFormatting(axisItem);
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
                        return formatItemValue(axisItem, value.value, true);
                    },
                },
            };
        } else if (axisLabelFormatter) {
            axisConfig.axisLabel = {
                formatter: axisLabelFormatter,
                rich: {
                    bold: {
                        fontWeight: 'bold',
                    },
                },
            };
            axisConfig.axisPointer = {
                label: {
                    formatter: (value: any) => {
                        return formatItemValue(axisItem, value.value, true);
                    },
                },
            };
        } else if (
            axisItem !== undefined &&
            isTableCalculation(axisItem) &&
            axisItem.type === undefined
        ) {
            axisConfig.axisLabel = {
                formatter: (value: any) => {
                    return formatItemValue(axisItem, value);
                },
            };
            axisConfig.axisPointer = {
                label: {
                    formatter: (value: any) => {
                        return formatItemValue(axisItem, value.value);
                    },
                },
            };
        } else if (
            axisItem &&
            isDimension(axisItem) &&
            axisItem.timeInterval &&
            isTimeInterval(axisItem.timeInterval)
        ) {
            // Some int numbers are converted to float by default on echarts
            // This is to ensure the value is correctly formatted on some types
            switch (axisItem.timeInterval) {
                case TimeFrames.WEEK_NUM:
                case TimeFrames.WEEK:
                    axisConfig.axisLabel = {
                        formatter: (value: any) => {
                            return formatItemValue(axisItem, value, true);
                        },
                    };
                    axisConfig.axisPointer = {
                        label: {
                            formatter: (value: any) => {
                                return formatItemValue(
                                    axisItem,
                                    value.value,
                                    true,
                                );
                            },
                        },
                    };
                    break;
                default:
            }
        }
        if (axisMinInterval) {
            axisConfig.minInterval = axisMinInterval;
        }

        axisConfig.nameGap = defaultNameGap || 0;
        if (rotate) {
            const rotateRadians = (rotate * Math.PI) / 180;
            const oppositeSide =
                (longestLabelWidth || 0) * Math.sin(rotateRadians);
            axisConfig.axisLabel = axisConfig.axisLabel || {};
            axisConfig.axisLabel.rotate = rotate;
            axisConfig.axisLabel.margin = 12;
            axisConfig.nameGap = oppositeSide + 15;
        } else {
            axisConfig.axisLabel = axisConfig.axisLabel || {};
            axisConfig.axisLabel.hideOverlap = true;
        }

        return axisConfig;
    };

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

    // There is no Top x axis when no flipped
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

    const bottomAxisBounds = getMinAndMaxFromBottomAxisBounds(
        bottomAxisType,
        bottomAxisMinValue,
        bottomAxisMaxValue,
    );

    const maxYAxisValue =
        leftAxisType === 'value'
            ? yAxisConfiguration?.[0]?.max ||
              referenceLineMaxLeftY ||
              maybeGetAxisDefaultMaxValue(allowFirstAxisDefaultRange)
            : undefined;

    const minYAxisValue =
        leftAxisType === 'value'
            ? yAxisConfiguration?.[0]?.min ||
              referenceLineMinLeftY ||
              maybeGetAxisDefaultMinValue(allowFirstAxisDefaultRange)
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
                          nameTextStyle: {
                              fontWeight: 'bold',
                          },
                      }
                    : {}),
                ...getAxisFormatter({
                    axisItem: bottomAxisXField,
                    longestLabelWidth: calculateWidthText(
                        longestValueXAxisBottom,
                    ),
                    rotate: xAxisConfiguration?.[0]?.rotate,
                    defaultNameGap: 30,
                    show: showXAxis,
                }),
                splitLine: {
                    show: validCartesianConfig.layout.flipAxes
                        ? showGridY
                        : showGridX,
                },
                inverse: !!xAxisConfiguration?.[0].inverse,
                ...bottomAxisExtraConfig,
                ...bottomAxisBounds,
            },
            {
                type: topAxisType,
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
                          nameTextStyle: {
                              fontWeight: 'bold',
                          },
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
                ...getAxisFormatter({
                    axisItem: topAxisXField,
                    longestLabelWidth: calculateWidthText(longestValueXAxisTop),
                    defaultNameGap: 30,
                    show: showXAxis,
                }),
                splitLine: {
                    show: isAxisTheSameForAllSeries,
                },
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
                              fontWeight: 'bold',
                              align: 'center',
                          },
                      }
                    : {}),
                min: minYAxisValue,
                max: maxYAxisValue,
                ...getAxisFormatter({
                    axisItem: leftAxisYField,
                    defaultNameGap: leftYaxisGap + defaultAxisLabelGap,
                    show: showYAxis,
                }),
                splitLine: {
                    show: validCartesianConfig.layout.flipAxes
                        ? showGridX
                        : showGridY,
                },
                inverse: !!yAxisConfiguration?.[0].inverse,
                ...leftAxisExtraConfig,
            },
            {
                type: rightAxisType,
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
                              fontWeight: 'bold',
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
                ...getAxisFormatter({
                    axisItem: rightAxisYField,
                    defaultNameGap: rightYaxisGap + defaultAxisLabelGap,
                    show: showYAxis,
                }),
                splitLine: {
                    show: isAxisTheSameForAllSeries,
                },
                ...rightAxisExtraConfig,
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
        getSeriesColor,
        minimal,
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

    const series = useMemo(() => {
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
            );
        }

        // Legacy implementation
        return getEchartsSeries(
            itemsMap,
            validCartesianConfig,
            pivotDimensions,
        );
    }, [
        validCartesianConfig,
        resultsData,
        itemsMap,
        pivotDimensions,
        rowKeyMap,
        pivotValuesColumnsMap,
    ]);

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
        });
    }, [
        itemsMap,
        validCartesianConfig,
        series,
        resultsData,
        resultsAndMinsAndMaxes.minsAndMaxes,
    ]);

    const stackedSeriesWithColorAssignments = useMemo(() => {
        if (!itemsMap) return;

        const seriesWithValidStack = series.map<EChartSeries>((serie) => {
            return {
                ...serie,
                color: getSeriesColor(serie),
                stack: getValidStack(serie),
            };
        });
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
                          value > min;

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

                const flipAxes = validCartesianConfig?.layout.flipAxes;
                const getTooltipHeader = () => {
                    if (flipAxes && !('axisDim' in params[0])) {
                        // When flipping axes, the axisValueLabel is the value, not the serie name
                        return params[0].seriesName;
                    }
                    return params[0].axisValueLabel;
                };
                // When flipping axes, we get all series in the chart
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
                            let dim = '';
                            if (flipAxes) {
                                // When flipping axes, the dimensionName is different
                                dim = dimensionNames[1];
                            } else {
                                dim =
                                    encode?.y?.[0] !== undefined
                                        ? dimensionNames[encode?.y[0]]
                                        : '';
                            }
                            const tooltipValue = (
                                value as Record<string, unknown>
                            )[dim];
                            if (
                                value &&
                                typeof value === 'object' &&
                                dim in value
                            ) {
                                return `<tr>
                                <td>${marker}</td>
                                <td>${seriesName}</td>
                                <td style="text-align: right;"><b>${getFormattedValue(
                                    tooltipValue,
                                    dim.split('.')[0],
                                    itemsMap,
                                    undefined,
                                    pivotValuesColumnsMap,
                                )}</b></td>
                            </tr>
                        `;
                            }
                        }
                        return '';
                    })
                    .join('');

                // At the moment, we only correctly filter fields that are
                // part of the chart config when no pivot is used
                // TODO In order to show other fields,
                // we will have to filter resultData using the xAxis value and groups
                let tooltipHtml = tooltipConfig ?? '';
                if (tooltipHtml) {
                    // Sanitize HTML code to avoid XSS
                    tooltipHtml = DOMPurify.sanitize(tooltipHtml);
                    const firstValue = params[0].value as Record<
                        string,
                        unknown
                    >;
                    const fields = tooltipHtml.match(/\${(.*?)}/g);
                    fields?.forEach((field) => {
                        const fieldValueReference = field
                            .replace('${', '')
                            .replace('}', '');

                        const fieldValue = firstValue[fieldValueReference];

                        const formattedValue = getFormattedValue(
                            fieldValue,
                            fieldValueReference.split('.')[0],
                            itemsMap,
                            undefined,
                            pivotValuesColumnsMap,
                        );
                        tooltipHtml = tooltipHtml.replace(
                            field,
                            formattedValue,
                        );
                    });
                }

                const dimensionId = params[0].dimensionNames?.[0];
                if (dimensionId !== undefined) {
                    const field = itemsMap[dimensionId];
                    if (isTableCalculation(field)) {
                        const tooltipHeader = formatItemValue(
                            field,
                            getTooltipHeader(),
                        );

                        return `${tooltipHeader}<br/><table>${tooltipRows}</table>`;
                    }

                    const hasFormat = isField(field)
                        ? field.format !== undefined
                        : false;

                    if (hasFormat) {
                        const tooltipHeader = getFormattedValue(
                            getTooltipHeader(),
                            dimensionId,
                            itemsMap,
                            undefined,
                            pivotValuesColumnsMap,
                        );

                        return `${tooltipHeader}<br/>${tooltipHtml}<table>${tooltipRows}</table>`;
                    }
                }
                return `${getTooltipHeader()}<br/>${tooltipHtml}<table>${tooltipRows}</table>`;
            },
        }),
        [
            itemsMap,
            validCartesianConfig?.layout.flipAxes,
            tooltipConfig,
            pivotValuesColumnsMap,
        ],
    );

    const sortedResultsByTotals = useMemo(() => {
        if (!stackedSeriesWithColorAssignments?.length) return sortedResults;

        const axis = validCartesianConfig?.layout.flipAxes
            ? axes.yAxis[0]
            : axes.xAxis[0];

        const xFieldId = validCartesianConfig?.layout?.xField;
        const xAxisConfig = validCartesianConfig?.eChartsConfig.xAxis?.[0];

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

            return sortedResults.sort((a, b) => {
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
        }

        return sortedResults;
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

    const currentGrid = useMemo(() => {
        const grid = {
            ...defaultGrid,
            ...removeEmptyProperties(validCartesianConfig?.eChartsConfig.grid),
        };

        const gridLeft = grid.left;
        const gridRight = grid.right;

        // Adds extra gap to grid to make room for axis labels -> there is an open ticket in echarts to fix this: https://github.com/apache/echarts/issues/9265
        // Only works for px values, percentage values are not supported because it cannot use calc()
        return {
            ...grid,
            left: gridLeft.includes('px')
                ? `${
                      parseInt(gridLeft.replace('px', '')) + defaultAxisLabelGap
                  }px`
                : grid.left,
            right: gridRight.includes('px')
                ? `${
                      parseInt(gridRight.replace('px', '')) +
                      defaultAxisLabelGap
                  }px`
                : grid.right,
        };
    }, [validCartesianConfig?.eChartsConfig.grid]);

    const { tooltip: legendDoubleClickTooltip } = useLegendDoubleClickTooltip();

    const legendConfigWithInstructionsTooltip = useMemo(() => {
        const mergedLegendConfig = mergeLegendSettings(
            validCartesianConfig?.eChartsConfig.legend,
            validCartesianConfigLegend,
            series,
        );

        return {
            ...mergedLegendConfig,
            tooltip: legendDoubleClickTooltip,
        };
    }, [
        legendDoubleClickTooltip,
        validCartesianConfig?.eChartsConfig.legend,
        validCartesianConfigLegend,
        series,
    ]);

    const eChartsOptions = useMemo(
        () => ({
            xAxis: axes.xAxis,
            yAxis: axes.yAxis,
            useUTC: true,
            series: stackedSeriesWithColorAssignments,
            animation: !(isInDashboard || minimal),
            legend: legendConfigWithInstructionsTooltip,
            dataset: {
                id: 'lightdashResults',
                source: sortedResultsByTotals,
            },
            tooltip,
            grid: currentGrid,
            textStyle: {
                fontFamily: theme?.other.chartFont as string | undefined,
            },
            // We assign colors per series, so we specify an empty list here.
            color: [],
        }),
        [
            axes.xAxis,
            axes.yAxis,
            stackedSeriesWithColorAssignments,
            isInDashboard,
            minimal,
            legendConfigWithInstructionsTooltip,
            sortedResultsByTotals,
            tooltip,
            theme?.other.chartFont,
            currentGrid,
        ],
    );

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
