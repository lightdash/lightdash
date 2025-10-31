import {
    createStack100TooltipFormatter,
    formatItemValue,
    hashFieldReference,
    isField,
    isTableCalculation,
    type ItemsMap,
    type PivotValuesColumn,
    StackType,
    type TooltipParam,
} from '@lightdash/common';
import { type MantineTheme } from '@mantine/core';
import DOMPurify from 'dompurify';
import {
    type DefaultLabelFormatterCallbackParams,
    type LineSeriesOption,
    type TooltipComponentFormatterCallback,
} from 'echarts';
import {
    formatCartesianTooltipRow,
    formatColorIndicator,
    formatTooltipHeader,
    formatTooltipValue,
    getTooltipDivider,
} from '../styles/tooltipStyles';
import { type EChartSeries } from '../useEchartsCartesianConfig';
import { getFormattedValue } from './valueFormatter';

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
 * Get the tooltip context
 * When series are bar stacked, then it's tuple mode(@reference to applyRoundedCornersToStackData), otherwise it's dataset mode.
 * @param params - The params
 * @param stackValue - The stack value
 * @param flipAxes - Whether the axes are flipped
 * @returns The tooltip context
 */
const getTooltipCtx = (
    params: (TooltipFormatterParams | TooltipFormatterParams)[],
    stackValue: string | boolean | undefined,
    flipAxes: boolean | undefined,
): TooltipCtx => {
    const v0 = params?.[0]?.value;
    const dataMode: TooltipCtx['dataMode'] =
        v0 && typeof v0 === 'object' && !Array.isArray(v0)
            ? 'dataset'
            : 'tuple';

    const mode: TooltipCtx['mode'] =
        stackValue === StackType.PERCENT
            ? 'stack100'
            : stackValue
            ? 'stackRegular'
            : 'plain';

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
 * @param params - The params
 * @returns The header
 */
const getHeader = (
    params: (TooltipFormatterParams | TooltipFormatterParams)[],
): string => params[0]?.axisValueLabel ?? params[0]?.name ?? '';

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
        | EChartSeries['encode']
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
        | EChartSeries['encode']
        | undefined,
    ctx: TooltipCtx,
    flipAxes?: boolean,
): number | undefined => {
    const axis: AxisKey = flipAxes ? 'x' : 'y';
    if (!encode) {
        // tuple fallback for regular stacks
        return ctx.dataMode === 'tuple' && ctx.mode === 'stackRegular'
            ? flipAxes
                ? 0
                : 1
            : undefined;
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

export const buildCartesianTooltipFormatter = ({
    itemsMap,
    stackValue,
    flipAxes,
    xFieldId,
    originalValues,
    series,
    theme,
    tooltipHtmlTemplate,
    pivotValuesColumnsMap,
}: {
    itemsMap?: ItemsMap;
    stackValue: string | boolean | undefined;
    flipAxes: boolean | undefined;
    xFieldId: string | undefined;
    originalValues?: Map<string, Map<string, number>> | undefined;
    series?: EChartSeries[];
    theme: MantineTheme;
    tooltipHtmlTemplate?: string;
    pivotValuesColumnsMap?: Record<string, PivotValuesColumn>;
}): TooltipComponentFormatterCallback<
    TooltipFormatterParams | TooltipFormatterParams[]
> => {
    return (params) => {
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
            )(params as TooltipParam[]);
        }

        const header = getHeader(params);

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
                const tooltipDim = Array.isArray(tooltipEncode)
                    ? tooltipEncode[0]
                    : typeof tooltipEncode === 'string'
                    ? tooltipEncode
                    : undefined;

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
                    dim ??
                    pivotDim ??
                    '';

                const formattedValue = getFormattedValue(
                    valueForFormat,
                    formatKey as string,
                    itemsMap,
                    undefined,
                    pivotValuesColumnsMap,
                );

                const colorIndicator = formatColorIndicator(
                    extractColor(marker),
                );
                return formatCartesianTooltipRow(
                    colorIndicator,
                    seriesName || '',
                    formatTooltipValue(formattedValue, theme),
                    theme,
                );
            })
            .join('');

        // custom HTML template only in dataset mode
        let tooltipHtml = tooltipHtmlTemplate ?? '';
        if (tooltipHtml) {
            tooltipHtml = DOMPurify.sanitize(tooltipHtml);
            const firstValue = params[0]?.value;
            const isDatasetMode =
                firstValue &&
                typeof firstValue === 'object' &&
                !Array.isArray(firstValue);
            if (isDatasetMode) {
                const fields = tooltipHtml.match(/\${(.*?)}/g);
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
                    );
                    tooltipHtml = tooltipHtml.replace(field, formatted);
                });
            } else {
                tooltipHtml = '';
            }
        }

        const divider = getTooltipDivider(theme);
        const dimensionId = params[0]?.dimensionNames?.[0];

        if (dimensionId !== undefined) {
            const field = itemsMap[dimensionId];
            if (isTableCalculation(field)) {
                const headerText = formatItemValue(field, header);
                return `${formatTooltipHeader(
                    headerText,
                    theme,
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
                );
                return `${formatTooltipHeader(
                    headerText,
                    theme,
                )}${divider}${tooltipHtml}${rowsHtml}`;
            }
        }

        return `${formatTooltipHeader(
            header,
            theme,
        )}${divider}${tooltipHtml}${rowsHtml}`;
    };
};
