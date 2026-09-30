import {
    assertUnreachable,
    formatColorIndicator,
    formatItemValue,
    formatTooltipRow,
    formatTooltipValue,
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    getGranularityMapFromItems,
    getLegendStyle,
    getReadableTextColor,
    getTooltipStyle,
    resolveGranularityInLabel,
    type FunnelChart,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { type EChartsOption, type FunnelSeriesOption } from 'echarts';
import round from 'lodash/round';
import { getLegendDoubleClickTooltip } from '../cartesian/legendTooltip';
import { sanitizeEchartsFontFamily } from '../fonts';
import { type VisualizationTheme } from '../theme';
import { type VisualizationContextInput } from '../types';
import { type FunnelSeriesDataPoint } from './config';

/**
 * When steps come from rows, `sort: 'none'` keeps the step order the query
 * returned (ECharts defaults to `sort: 'descending'`, re-ordering by value).
 * When steps are columns, the query's sort cannot order them, so keep the
 * descending taper.
 */
export const getFunnelSeriesSort = (
    dataInput: FunnelChartDataInput,
): NonNullable<FunnelSeriesOption['sort']> => {
    switch (dataInput) {
        case FunnelChartDataInput.COLUMN:
            return 'none';
        case FunnelChartDataInput.ROW:
            return 'descending';
        default:
            return assertUnreachable(
                dataInput,
                `Unknown funnel data input: ${dataInput}`,
            );
    }
};

const getValueAndPercentage = ({
    field,
    value,
    maxValue,
    parameters,
    timezone,
}: {
    field?: TableCalculation | Metric;
    value: any;
    maxValue: number;
    parameters?: Record<string, unknown>;
    timezone?: string;
}) => {
    const formattedValue = formatItemValue(
        field,
        value,
        false,
        parameters,
        timezone,
    );

    const percentOfMax = round((Number(value) / maxValue) * 100, 2);
    return { formattedValue, percentOfMax };
};

export type FunnelEchartsOptionInput = Pick<
    VisualizationContextInput,
    | 'itemsMap'
    | 'parameters'
    | 'resolvedTimezone'
    | 'minimal'
    | 'isInDashboard'
    | 'isTouchDevice'
> & {
    /** The resolved chart config; see `resolveFunnelChartConfig`. */
    validFunnelConfig: FunnelChart | undefined;
    /** The funnel steps; see `getFunnelChartData`. */
    data: FunnelSeriesDataPoint[];
    /** The largest step value, each step's percentage is relative to it. */
    maxValue: number;
    /** The metric or table calculation the steps are values of. */
    selectedField: Metric | TableCalculation | undefined;
    /** The palette color of each step by id; see `getFunnelColorDefaults`. */
    colorDefaults: Record<string, string>;
    colorPalette: string[];
    theme: VisualizationTheme;
    /** Legend entries the viewer toggled off, by step name. */
    selectedLegends?: Record<string, boolean>;
};

/**
 * Builds the ECharts option for a funnel chart, or undefined when there is
 * nothing to draw: no fields, no config, or no steps.
 */
export const buildFunnelEchartsOption = ({
    validFunnelConfig,
    data,
    maxValue,
    selectedField,
    colorDefaults,
    itemsMap,
    colorPalette,
    parameters,
    isTouchDevice,
    minimal,
    resolvedTimezone,
    theme,
    selectedLegends,
    isInDashboard,
}: FunnelEchartsOptionInput): EChartsOption | undefined => {
    const chartConfig = validFunnelConfig;

    const seriesData = (() => {
        if (!chartConfig) return undefined;

        return data.length > 0 ? data : undefined;
    })();

    const funnelSeriesOptions: FunnelSeriesOption | undefined = (() => {
        if (!chartConfig || !seriesData) return undefined;

        const {
            labelOverrides,
            colorOverrides,
            showLegend,
            legendPosition,
            labels,
        } = chartConfig;

        const granularityMap = getGranularityMapFromItems(itemsMap);

        return {
            type: 'funnel',
            gap: 3,
            sort: getFunnelSeriesSort(
                chartConfig.dataInput ?? FunnelChartDataInput.ROW,
            ),
            data: seriesData.map(({ id, name, value, meta }) => {
                const labelOverride = labelOverrides?.[id] ?? name;
                return {
                    name:
                        resolveGranularityInLabel(
                            labelOverride,
                            granularityMap,
                        ) ?? labelOverride,
                    value,
                    meta,
                    itemStyle: {
                        color: colorOverrides?.[id] ?? colorDefaults[id],
                        borderWidth: 0,
                    },
                    label:
                        labels?.position === FunnelChartLabelPosition.INSIDE
                            ? {
                                  backgroundColor:
                                      colorOverrides?.[id] ?? colorDefaults[id],
                                  color: getReadableTextColor(
                                      colorOverrides?.[id] ?? colorDefaults[id],
                                  ),
                                  borderRadius: 4,
                                  padding: [4, 8],
                              }
                            : undefined,
                };
            }),
            color: colorPalette,
            tooltip: {
                trigger: 'item',
                formatter: ({ color, name, value }) => {
                    const { formattedValue, percentOfMax } =
                        getValueAndPercentage({
                            field: selectedField,
                            value,
                            maxValue,
                            parameters,
                            timezone: resolvedTimezone,
                        });

                    const colorIndicator = formatColorIndicator(
                        typeof color === 'string' ? color : '',
                    );
                    const valuePill = formatTooltipValue(
                        `${percentOfMax}% - ${formattedValue}`,
                    );

                    return formatTooltipRow(colorIndicator, name, valuePill);
                },
            },
            top:
                legendPosition === FunnelChartLegendPosition.HORIZONTAL &&
                showLegend
                    ? 50
                    : 20,
            label: {
                show: labels?.position !== FunnelChartLabelPosition.HIDDEN,
                position:
                    labels?.position &&
                    labels.position !== FunnelChartLabelPosition.HIDDEN
                        ? labels.position
                        : FunnelChartLabelPosition.INSIDE,
                color:
                    labels?.position !== FunnelChartLabelPosition.INSIDE
                        ? theme.foreground
                        : undefined,
                formatter: ({ name, value }) => {
                    const { formattedValue, percentOfMax } =
                        getValueAndPercentage({
                            field: selectedField,
                            value,
                            maxValue,
                            parameters,
                            timezone: resolvedTimezone,
                        });

                    const percentString = labels?.showPercentage
                        ? `${percentOfMax}%`
                        : '';
                    const valueString = labels?.showValue ? formattedValue : '';
                    const numbersString = `${
                        valueString || percentString ? ':' : ''
                    } ${[percentString, valueString]
                        .filter(Boolean)
                        .join(' - ')}`;

                    return `${name}${numbersString}`;
                },
            },
            emphasis: {
                disabled: true,
            },
        };
    })();

    const legendDoubleClickTooltip = getLegendDoubleClickTooltip(theme);

    const legendConfigWithTooltip = (() => {
        if (!chartConfig) return undefined;

        const { showLegend, legendPosition } = chartConfig;

        const legendStyle = getLegendStyle('square');

        const legendConfig = {
            show: showLegend,
            orient: legendPosition,
            type: 'scroll' as const,
            ...(legendPosition === FunnelChartLegendPosition.VERTICAL
                ? {
                      left: 'left' as const,
                      top: 'middle' as const,
                      align: 'left' as const,
                  }
                : {
                      left: 'center' as const,
                      top: 'top' as const,
                      align: 'auto' as const,
                  }),
            selected: selectedLegends,
        };

        return {
            ...legendConfig,
            ...legendStyle,
            tooltip: legendDoubleClickTooltip,
        };
    })();

    const eChartsOptions: EChartsOption | undefined = (() => {
        if (!chartConfig || !funnelSeriesOptions || !seriesData)
            return undefined;

        const baseOptions = {
            textStyle: {
                fontFamily: sanitizeEchartsFontFamily(theme.chartFont),
            },
            tooltip: {
                ...getTooltipStyle({ appendToBody: !isTouchDevice }),
                trigger: 'item' as const,
            },
            series: [funnelSeriesOptions],
            animation: !(isInDashboard || minimal),
        };

        return {
            ...baseOptions,
            legend: legendConfigWithTooltip,
        };
    })();

    if (!itemsMap) return undefined;
    if (!eChartsOptions) return undefined;

    return eChartsOptions;
};
