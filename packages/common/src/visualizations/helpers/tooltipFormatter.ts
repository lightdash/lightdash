import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
    type DefaultLabelFormatterCallbackParams,
    type LineSeriesOption,
    type TooltipComponentFormatterCallback,
} from 'echarts';
import { toNumber } from 'lodash';
import { type ItemsMap, isField, isTableCalculation } from '../../types/field';
import { type ParametersValuesMap } from '../../types/parameters';
import { hashFieldReference } from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import { formatItemValue } from '../../utils/formatting';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import {
    type EChartsSeries,
    type PivotValuesColumn,
    StackType,
} from '../types';
import {
    formatCartesianTooltipRow,
    formatColorIndicator,
    formatTooltipHeader,
    formatTooltipValue,
    getTooltipDivider,
} from './styles/tooltipStyles';
import { getFormattedValue } from './valueFormatter';

dayjs.extend(utc);

/**
 * Compute a previous period date based on the current date, granularity, and offset
 */
const computePreviousPeriodDate = (
    currentDateStr: string | number,
    granularity: string,
    periodOffset: number,
): string | null => {
    try {
        const currentDate = dayjs.utc(currentDateStr);
        if (!currentDate.isValid()) return null;

        let previousDate: dayjs.Dayjs;

        switch (granularity.toUpperCase()) {
            case TimeFrames.DAY:
                previousDate = currentDate.subtract(periodOffset, 'day');
                break;
            case TimeFrames.WEEK:
                previousDate = currentDate.subtract(periodOffset, 'week');
                break;
            case TimeFrames.MONTH:
                previousDate = currentDate.subtract(periodOffset, 'month');
                break;
            case TimeFrames.QUARTER:
                previousDate = currentDate.subtract(periodOffset * 3, 'month');
                break;
            case TimeFrames.YEAR:
                previousDate = currentDate.subtract(periodOffset, 'year');
                break;
            default:
                return null;
        }

        // Format based on granularity
        switch (granularity.toUpperCase()) {
            case TimeFrames.DAY:
            case TimeFrames.WEEK:
                return previousDate.format('MMM D, YYYY');
            case TimeFrames.MONTH:
                return previousDate.format('MMM YYYY');
            case TimeFrames.QUARTER: {
                // Format as "Q1 2024" style
                const quarter = Math.floor(previousDate.month() / 3) + 1;
                return `Q${quarter} ${previousDate.year()}`;
            }
            case TimeFrames.YEAR:
                return previousDate.format('YYYY');
            default:
                return previousDate.format('MMM YYYY');
        }
    } catch {
        return null;
    }
};

// NOTE: CallbackDataParams type doesn't have axisValue, axisValueLabel properties: https://github.com/apache/echarts/issues/17561
type TooltipFormatterParams = DefaultLabelFormatterCallbackParams & {
    axisId: string;
    axisIndex: number;
    axisType: string;
    axisValue: string | number;
    axisValueLabel: string;
};

type TooltipCtx = {
    flipAxes: boolean;
    mode: 'stack100' | 'stackRegular' | 'plain';
    dataMode: 'dataset' | 'tuple';
};

/**
 * ECharts tooltip parameter types
 * These represent the structure of params passed to tooltip formatters
 */
export interface TooltipParam {
    seriesName?: string;
    marker?: string;
    encode?: {
        x?: string | number | (string | number)[];
        y?: string | number | (string | number)[];
    };
    dimensionNames?: string[];
    data?: Record<string, unknown>;
    value?: Record<string, unknown> | unknown[];
    axisValue?: string | number;
    axisValueLabel?: string | number;
    name?: string;
}

type TooltipParams = TooltipParam | TooltipParam[];

type GetDimensionNameFn = (param: TooltipParam) => string | undefined;

/**
 * Get the tooltip context
 * When series are bar stacked, then it's tuple mode(@reference to applyRoundedCornersToStackData), otherwise it's dataset mode.
 * @param params - The params
 * @param stackValue - The stack value
 * @param flipAxes - Whether the axes are flipped
 * @returns The tooltip context
 */
const getTooltipCtx = (
    params: (TooltipFormatterParams | TooltipParam)[],
    stackValue: string | boolean | undefined,
    flipAxes: boolean | undefined,
): TooltipCtx => {
    const v0 = params?.[0]?.value;
    const dataMode: TooltipCtx['dataMode'] =
        v0 && typeof v0 === 'object' && !Array.isArray(v0)
            ? 'dataset'
            : 'tuple';

    let mode: TooltipCtx['mode'] = 'plain';
    if (stackValue === StackType.PERCENT) {
        mode = 'stack100';
    } else if (stackValue) {
        mode = 'stackRegular';
    }

    return { flipAxes: !!flipAxes, mode, dataMode };
};

const getRawVal = (
    param: TooltipFormatterParams,
    dim: string | undefined,
    yIdx: number | undefined,
    ctx: TooltipCtx,
) => {
    const v = param.value;
    if (Array.isArray(v)) {
        if (typeof yIdx === 'number') return v[yIdx];
        // ultimate fallback for tuple in regular stacks
        if (ctx.dataMode === 'tuple' && ctx.mode === 'stackRegular') {
            return ctx.flipAxes ? v[0] : v[1];
        }
        return undefined; // array but no valid index
    }
    if (v && typeof v === 'object' && dim) {
        // Only return the value if the key exists, otherwise undefined
        return v[dim as keyof typeof v];
    }
    // For non-object, non-array values (plain number/string), return as-is
    // But if we have a dim and v is an object, we already handled it above
    return typeof v === 'object' ? undefined : v;
};

/**
 * Get the header from the params
 * @param params - The params (accepts both TooltipFormatterParams and TooltipParam arrays)
 * @param itemsMap - Map of field IDs to field metadata (optional)
 * @param xFieldId - The x-axis field ID to get timeInterval from (optional)
 * @returns The header
 */
const getHeader = (
    params: (TooltipFormatterParams | TooltipParam)[],
    itemsMap?: ItemsMap,
    xFieldId?: string,
): string => {
    // First try the standard axisValueLabel or name
    const standardHeader = params[0]?.axisValueLabel ?? params[0]?.name;
    if (standardHeader) {
        return String(standardHeader);
    }

    // For tuple mode (stacked bars) with time axis, extract x-value from data array
    const firstParam = params[0];
    if (firstParam?.value && Array.isArray(firstParam.value)) {
        // In tuple mode, first element is typically the x-axis value
        const xValue = firstParam.value[0];
        if (xValue !== undefined && xValue !== null) {
            // Use getFormattedValue for consistent formatting with axis labels
            if (itemsMap && xFieldId) {
                return getFormattedValue(xValue, xFieldId, itemsMap, true);
            }
            return String(xValue);
        }
    }

    return '';
};

const extractColor = (marker: unknown): string => {
    const s = typeof marker === 'string' ? marker : '';
    const m = s.match(/background-color:\s*([^;'"]+)/);
    return m ? m[1].trim() : '#000';
};

const unwrapValue = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
        if ('value' in v) return unwrapValue(v.value);
        if ('raw' in v) return v.raw;
        if ('formatted' in v) return v.formatted;
    }
    return v;
};

type AxisKey = 'x' | 'y';

/**
 * Helper function to get the dimension from the encode
 */
const getDimFromEncodeAxis = (
    encode:
        | TooltipFormatterParams['encode']
        | EChartsSeries['encode']
        | undefined,
    dimensionNames?: string[],
    axis: AxisKey = 'y',
): string | undefined => {
    if (!encode) return undefined;
    const e = encode[axis];

    if (typeof e === 'string') return e; // dataset: field hash
    if (Array.isArray(e) && typeof e[0] === 'number') {
        const idx = e[0];
        return dimensionNames && typeof idx === 'number'
            ? dimensionNames[idx]
            : undefined;
    }
    if (typeof e === 'number' && dimensionNames) {
        return dimensionNames[e];
    }
    return undefined;
};

const getValueIdxFromEncode = (
    encode:
        | TooltipFormatterParams['encode']
        | EChartsSeries['encode']
        | undefined,
    ctx: TooltipCtx,
    flipAxes?: boolean,
): number | undefined => {
    const axis: AxisKey = flipAxes ? 'x' : 'y';
    if (!encode) {
        let result: number | undefined;
        // tuple fallback for regular stacks
        if (ctx.dataMode === 'tuple' && ctx.mode === 'stackRegular') {
            result = flipAxes ? 0 : 1;
        }
        return result;
    }
    const e = encode[axis];
    if (typeof e === 'number') return e;
    if (Array.isArray(e) && typeof e[0] === 'number') return e[0];
    // tuple fallback for regular stacks
    if (ctx.dataMode === 'tuple' && ctx.mode === 'stackRegular') {
        return flipAxes ? 0 : 1;
    }
    return undefined;
};

export const isLineSeriesOption = (obj: unknown): obj is LineSeriesOption =>
    typeof obj === 'object' && obj !== null && 'showSymbol' in obj;

/**
 * Creates a tooltip formatter for 100% stacked charts
 * This formatter shows both the percentage and the original count value
 *
 * @param originalValues - Map of x-axis values to their original y-values
 * @param getDimensionName - Function to extract the dimension name from a param
 * @param xAxisField - The x-axis field name to extract the raw x value from param data
 * @returns A formatter function compatible with ECharts tooltip
 *
 * @example
 * // SQL Runner usage
 * const formatter = createStack100TooltipFormatter(
 *     originalValues,
 *     (param) => {
 *         const { encode, dimensionNames } = param;
 *         const yFieldIndex = Array.isArray(encode.y) ? encode.y[0] : encode.y;
 *         return dimensionNames?.[yFieldIndex];
 *     },
 *     xFieldId
 * );
 *
 * @example
 * // Explorer usage with flip axes
 * const formatter = createStack100TooltipFormatter(
 *     originalValues,
 *     (param) => {
 *         const { encode, dimensionNames } = param;
 *         if (!dimensionNames || !encode) return undefined;
 *         return flipAxes ? dimensionNames[1] : dimensionNames[encode.y?.[0]];
 *     },
 *     xFieldId
 * );
 */
export function createStack100TooltipFormatter(
    originalValues: Map<string, Map<string, number>>,
    getDimensionName: GetDimensionNameFn,
    xAxisField: string,
    itemsMap?: ItemsMap,
) {
    return (params: TooltipParams) => {
        if (!Array.isArray(params)) return '';

        const header = getHeader(params, itemsMap, xAxisField);

        const rowsHtml = params
            .map((param) => {
                const { seriesName = '', marker = '' } = param;
                const dimensionName = getDimensionName(param);

                if (!dimensionName) return '';

                // Access value - try both data and value for compatibility
                // SQL Runner uses 'data', Explorer uses 'value'
                const valueObject =
                    param.data ||
                    (typeof param.value === 'object' &&
                    !Array.isArray(param.value)
                        ? param.value
                        : undefined);

                if (!valueObject || typeof valueObject !== 'object') return '';

                const percentage = valueObject[dimensionName];

                // Get the raw x-axis value from the data for originalValues lookup
                const rawXValue = String(valueObject[xAxisField] ?? '');
                const originalValue =
                    originalValues?.get(rawXValue)?.get(dimensionName) || 0;

                // Format percentage and count
                const percentageStr =
                    typeof percentage === 'number' && !Number.isNaN(percentage)
                        ? `${percentage.toFixed(1)}%`
                        : '0.0%';
                const countStr =
                    typeof originalValue === 'number'
                        ? originalValue.toLocaleString()
                        : '0';

                const colorIndicator = formatColorIndicator(
                    extractColor(marker),
                );
                return formatCartesianTooltipRow(
                    colorIndicator,
                    seriesName,
                    formatTooltipValue(`${percentageStr} (${countStr})`),
                );
            })
            .filter(Boolean)
            .join('');

        const divider = getTooltipDivider();

        return `${formatTooltipHeader(header)}${divider}${rowsHtml}`;
    };
}

/**
 * Transform data for 100% stacked charts
 *
 * Converts absolute values to percentages where each stacked group totals 100%.
 * Also preserves original values for tooltip display.
 *
 * @param rows - Array of data rows to transform
 * @param xAxisField - Field reference for the x-axis (grouping key)
 * @param yFieldRefs - Array of field references for y-axis values to convert to percentages
 * @returns Object containing transformed data and original values map
 */
export function transformToPercentageStacking<
    T extends Record<string, unknown>,
>(
    rows: T[],
    xAxisField: string,
    yFieldRefs: string[],
): {
    transformedResults: T[];
    originalValues: Map<string, Map<string, number>>;
} {
    const originalValues = new Map<string, Map<string, number>>();
    const totals = new Map<string, number>();

    // Calculate totals for each x-axis value
    rows.forEach((row) => {
        const xValue = String(row[xAxisField]);
        let total = 0;

        yFieldRefs.forEach((yField) => {
            const value = toNumber(row[yField]) || 0;
            total += value;

            // Store original value
            if (!originalValues.has(xValue)) {
                originalValues.set(xValue, new Map());
            }
            originalValues.get(xValue)!.set(yField, value);
        });

        totals.set(xValue, total);
    });

    // Transform data to percentages
    const transformedResults = rows.map((row) => {
        const xValue = String(row[xAxisField]);
        const total = totals.get(xValue) || 1; // Avoid division by zero
        const newRow = { ...row };

        yFieldRefs.forEach((yField) => {
            const value = toNumber(row[yField]) || 0;
            (newRow as Record<string, unknown>)[yField] = (value / total) * 100;
        });

        return newRow;
    });

    return { transformedResults, originalValues };
}

/**
 * Build a simplified tooltip formatter for SQL Runner Cartesian charts
 * This formatter doesn't require itemsMap and works directly with the dataset
 */
export const buildSqlRunnerCartesianTooltipFormatter =
    ({
        stackValue,
        flipAxes,
        xFieldId,
        originalValues,
    }: {
        stackValue: string | boolean | undefined;
        flipAxes: boolean | undefined;
        xFieldId: string | undefined;
        originalValues?: Map<string, Map<string, number>> | undefined;
    }): TooltipComponentFormatterCallback<
        TooltipFormatterParams | TooltipFormatterParams[]
    > =>
    (params) => {
        if (!Array.isArray(params)) return '';

        const ctx = getTooltipCtx(params, stackValue, flipAxes);

        // 100% stacks: use special formatter that shows percentage + original values
        if (ctx.mode === 'stack100' && xFieldId && originalValues) {
            return createStack100TooltipFormatter(
                originalValues,
                (param) => {
                    const { encode, dimensionNames } = param;
                    if (!dimensionNames || !encode) return undefined;
                    if (flipAxes) return dimensionNames[1];
                    const yIndex = Array.isArray(encode.y)
                        ? encode.y[0]
                        : encode.y;
                    return typeof yIndex === 'number'
                        ? dimensionNames[yIndex]
                        : undefined;
                },
                xFieldId,
                undefined, // No itemsMap available in SQL Runner
            )(params as TooltipParam[]);
        }

        const header = getHeader(params, undefined, xFieldId);

        // Build tooltip rows
        const rowsHtml = params
            .map((param) => {
                const { marker, seriesName, dimensionNames, encode } = param;

                const metricAxis: AxisKey = flipAxes ? 'x' : 'y';
                const dim = getDimFromEncodeAxis(
                    encode,
                    dimensionNames,
                    metricAxis,
                );

                const valueIdx = getValueIdxFromEncode(encode, ctx, !!flipAxes);
                const rawVal = getRawVal(param, dim, valueIdx, ctx);

                const valueForFormat = unwrapValue(rawVal);
                if (valueForFormat === undefined || valueForFormat === null)
                    return '';

                // Format the value - for SQL Runner, we'll use the raw number
                const formattedValue =
                    typeof valueForFormat === 'number'
                        ? valueForFormat.toLocaleString()
                        : String(valueForFormat);

                const colorIndicator = formatColorIndicator(
                    extractColor(marker),
                );
                return formatCartesianTooltipRow(
                    colorIndicator,
                    seriesName || '',
                    formatTooltipValue(formattedValue),
                );
            })
            .join('');

        const divider = getTooltipDivider();

        return `${formatTooltipHeader(header)}${divider}${rowsHtml}`;
    };

export const buildCartesianTooltipFormatter =
    ({
        itemsMap,
        stackValue,
        flipAxes,
        xFieldId,
        originalValues,
        series,
        tooltipHtmlTemplate,
        pivotValuesColumnsMap,
        parameters,
    }: {
        itemsMap?: ItemsMap;
        stackValue: string | boolean | undefined;
        flipAxes: boolean | undefined;
        xFieldId: string | undefined;
        originalValues?: Map<string, Map<string, number>> | undefined;
        series?: EChartsSeries[];
        tooltipHtmlTemplate?: string;
        pivotValuesColumnsMap?: Record<string, PivotValuesColumn>;
        parameters?: ParametersValuesMap;
    }): TooltipComponentFormatterCallback<
        TooltipFormatterParams | TooltipFormatterParams[]
    > =>
    (params) => {
        if (!Array.isArray(params) || !itemsMap) return '';

        const ctx = getTooltipCtx(params, stackValue, flipAxes);

        // 100% stacks: use special formatter that shows percentage + original values
        if (ctx.mode === 'stack100' && xFieldId && originalValues) {
            return createStack100TooltipFormatter(
                originalValues,
                (param) => {
                    const { encode, dimensionNames } = param;
                    if (!dimensionNames || !encode) return undefined;
                    if (flipAxes) return dimensionNames[1];
                    const yIndex = Array.isArray(encode.y)
                        ? encode.y[0]
                        : encode.y;
                    return typeof yIndex === 'number'
                        ? dimensionNames[yIndex]
                        : undefined;
                },
                xFieldId,
                itemsMap,
            )(params as TooltipParam[]);
        }

        const header = getHeader(params, itemsMap, xFieldId);

        // rows
        const rowsHtml = params
            .map((param) => {
                const {
                    marker,
                    seriesName,
                    dimensionNames,
                    encode,
                    seriesIndex,
                } = param;

                const seriesOption =
                    typeof seriesIndex === 'number'
                        ? series?.[seriesIndex]
                        : undefined;
                const effectiveEncode =
                    encode ?? seriesOption?.encode ?? undefined;
                const yRefField =
                    seriesOption?.encode?.yRef?.field ?? undefined;

                const yFieldHash =
                    seriesOption?.encode?.yRef &&
                    typeof seriesOption.encode.yRef === 'object'
                        ? hashFieldReference(seriesOption.encode.yRef)
                        : undefined;

                const seriesDimensionNames = Array.isArray(
                    seriesOption?.dimensions,
                )
                    ? seriesOption?.dimensions.map(
                          (dimension: { name: string }) =>
                              typeof dimension === 'string'
                                  ? dimension
                                  : dimension?.name,
                      )
                    : undefined;
                const metricAxis: AxisKey = flipAxes ? 'x' : 'y';

                const encodeDim =
                    getDimFromEncodeAxis(
                        effectiveEncode,
                        dimensionNames,
                        metricAxis,
                    ) ??
                    getDimFromEncodeAxis(
                        effectiveEncode,
                        seriesDimensionNames,
                        metricAxis,
                    );

                const tooltipEncode = seriesOption?.encode?.tooltip;

                let tooltipDim: string | undefined;
                if (Array.isArray(tooltipEncode)) {
                    // eslint-disable-next-line prefer-destructuring
                    tooltipDim = tooltipEncode[0];
                } else if (typeof tooltipEncode === 'string') {
                    tooltipDim = tooltipEncode;
                }

                const pivotDim =
                    seriesOption?.pivotReference && pivotValuesColumnsMap
                        ? Object.values(pivotValuesColumnsMap).find(
                              (column) => {
                                  const reference = seriesOption.pivotReference;
                                  if (!reference) return false;
                                  if (column.referenceField !== reference.field)
                                      return false;
                                  if (
                                      column.pivotValues.length !==
                                      reference.pivotValues?.length
                                  )
                                      return false;
                                  return column.pivotValues.every(
                                      (pivotValue, index) =>
                                          pivotValue.value ===
                                          reference.pivotValues?.[index]?.value,
                                  );
                              },
                          )?.pivotColumnName
                        : undefined;

                // Prefer the real field hash from encode.y (works for pivot)
                const dim =
                    encodeDim ??
                    tooltipDim ??
                    pivotDim ??
                    // final fallback: the second dimension name normally is the Y series
                    (param?.dimensionNames?.[1] as string | undefined) ??
                    undefined;

                const valueIdx = getValueIdxFromEncode(
                    effectiveEncode,
                    ctx,
                    !!flipAxes,
                );
                const rawValueKeys = [
                    dim,
                    pivotDim,
                    tooltipDim,
                    yFieldHash,
                    yRefField,
                ].filter((k): k is string => !!k && typeof k === 'string');

                // Extract raw cell value in both dataset/tuple modes
                let rawVal = getRawVal(param, dim, valueIdx, ctx);

                const needsPivotFallback =
                    pivotDim &&
                    dim &&
                    pivotDim !== dim &&
                    typeof param?.value === 'object' &&
                    !Array.isArray(param?.value) &&
                    (param.value as Record<string, unknown>)[dim] === undefined;

                if (
                    needsPivotFallback ||
                    (pivotDim && pivotDim !== dim && rawVal === param?.value)
                ) {
                    rawVal = getRawVal(param, pivotDim, valueIdx, ctx);
                }

                if (
                    (rawVal === param?.value ||
                        (rawVal &&
                            typeof rawVal === 'object' &&
                            !Array.isArray(rawVal))) &&
                    rawValueKeys.length > 0
                ) {
                    for (const key of rawValueKeys) {
                        const candidate = getRawVal(param, key, valueIdx, ctx);
                        if (
                            candidate !== undefined &&
                            candidate !== null &&
                            candidate !== param?.value &&
                            !(
                                candidate === rawVal &&
                                typeof candidate === 'object'
                            )
                        ) {
                            rawVal = candidate;
                            break;
                        }
                        if (
                            param?.value &&
                            typeof param.value === 'object' &&
                            !Array.isArray(param.value) &&
                            param.value[key as keyof typeof param.value] !==
                                undefined
                        ) {
                            rawVal =
                                param.value[key as keyof typeof param.value];
                            break;
                        }
                        if (
                            param?.data &&
                            typeof param.data === 'object' &&
                            !Array.isArray(param.data) &&
                            param.data[key as keyof typeof param.data] !==
                                undefined
                        ) {
                            rawVal = param.data[key as keyof typeof param.data];
                            break;
                        }
                    }
                }

                const valueForFormat = unwrapValue(rawVal);
                if (valueForFormat === undefined || valueForFormat === null)
                    return '';

                const formatKey =
                    (typeof dim === 'string' &&
                        pivotValuesColumnsMap?.[dim]?.referenceField) ??
                    (pivotDim &&
                        pivotValuesColumnsMap?.[pivotDim]?.referenceField) ??
                    yRefField ??
                    // Fallback to pivotReference.field when pivotValuesColumnsMap is unavailable
                    seriesOption?.pivotReference?.field ??
                    dim ??
                    pivotDim ??
                    '';

                // For period-over-period series, use the base field's format
                // using baseFieldId from metadata instead of string matching
                let effectiveFormatKey = formatKey as string;
                if (seriesOption?.periodOverPeriodMetadata?.baseFieldId) {
                    const { baseFieldId } =
                        seriesOption.periodOverPeriodMetadata;
                    // Use base field format if it exists in itemsMap
                    if (itemsMap[baseFieldId]) {
                        effectiveFormatKey = baseFieldId;
                    }
                }

                const formattedValue = getFormattedValue(
                    valueForFormat,
                    effectiveFormatKey,
                    itemsMap,
                    undefined,
                    pivotValuesColumnsMap,
                    parameters,
                );

                // For period-over-period series, compute and display the actual previous date
                let displaySeriesName = seriesName || '';
                if (seriesOption?.periodOverPeriodMetadata) {
                    const { periodOffset, granularity } =
                        seriesOption.periodOverPeriodMetadata;
                    // Get the current x-axis value (date)
                    const currentDate = param.axisValue ?? param.name;
                    if (currentDate) {
                        const previousDateStr = computePreviousPeriodDate(
                            currentDate,
                            granularity,
                            periodOffset,
                        );
                        if (previousDateStr) {
                            // Extract base metric name from dimensions or series name
                            const baseMetricName =
                                seriesOption.dimensions?.[1]?.displayName
                                    ?.replace(/\s*\(Previous.*\)$/, '')
                                    ?.trim() ||
                                (seriesName || '').replace(
                                    /\s*\(Previous.*\)$/,
                                    '',
                                );
                            displaySeriesName = `${baseMetricName} (${previousDateStr})`;
                        }
                    }
                }

                const colorIndicator = formatColorIndicator(
                    extractColor(marker),
                );
                return formatCartesianTooltipRow(
                    colorIndicator,
                    displaySeriesName,
                    formatTooltipValue(formattedValue),
                );
            })
            .join('');

        // custom HTML template
        let tooltipHtml = tooltipHtmlTemplate ?? '';
        if (tooltipHtml) {
            tooltipHtml = sanitizeHtml(tooltipHtml);
            const firstParam = params[0];
            const firstValue = firstParam?.value;
            const fields = tooltipHtml.match(/\${(.*?)}/g);

            if (ctx.dataMode === 'tuple' && Array.isArray(firstValue)) {
                // Tuple mode (stacked bars): map dimension names to array indices
                fields?.forEach((field) => {
                    const ref = field.slice(2, -1);
                    const dimensionIndex =
                        firstParam.dimensionNames?.indexOf(ref);

                    if (dimensionIndex !== undefined && dimensionIndex >= 0) {
                        const val = unwrapValue(firstValue[dimensionIndex]);
                        const formatted = getFormattedValue(
                            val,
                            ref,
                            itemsMap,
                            undefined,
                            pivotValuesColumnsMap,
                            parameters,
                        );
                        tooltipHtml = tooltipHtml.replace(field, formatted);
                    } else {
                        tooltipHtml = tooltipHtml.replace(field, '');
                    }
                });
            } else if (
                ctx.dataMode === 'dataset' &&
                firstValue &&
                typeof firstValue === 'object'
            ) {
                // Dataset mode: direct property access
                fields?.forEach((field) => {
                    const ref = field.slice(2, -1);
                    const val = unwrapValue(
                        firstValue[ref as keyof typeof firstValue],
                    );
                    const formatted = getFormattedValue(
                        val,
                        ref,
                        itemsMap,
                        undefined,
                        pivotValuesColumnsMap,
                        parameters,
                    );
                    tooltipHtml = tooltipHtml.replace(field, formatted);
                });
            } else {
                tooltipHtml = '';
            }
        }

        const divider = getTooltipDivider();
        const dimensionId = params[0]?.dimensionNames?.[0];

        if (dimensionId !== undefined) {
            const field = itemsMap[dimensionId];
            if (isTableCalculation(field)) {
                const headerText = formatItemValue(
                    field,
                    header,
                    false,
                    parameters,
                );
                return `${formatTooltipHeader(
                    headerText,
                )}${divider}${rowsHtml}`;
            }
            const hasFormat = isField(field)
                ? field.format !== undefined
                : false;
            if (hasFormat) {
                const headerText = getFormattedValue(
                    header,
                    dimensionId,
                    itemsMap,
                    undefined,
                    pivotValuesColumnsMap,
                    parameters,
                );
                return `${formatTooltipHeader(
                    headerText,
                )}${divider}${tooltipHtml}${rowsHtml}`;
            }
        }

        return `${formatTooltipHeader(
            header,
        )}${divider}${tooltipHtml}${rowsHtml}`;
    };
