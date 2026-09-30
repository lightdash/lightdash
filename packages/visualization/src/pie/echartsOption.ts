import {
    calculateBorderRadiusForSlice,
    formatColorIndicator,
    formatItemValue,
    formatTooltipLabel,
    formatTooltipRow,
    formatTooltipValue,
    getGranularityMapFromItems,
    getLegendStyle,
    getPieExternalLabelStyle,
    getPieInternalLabelStyle,
    getPieLabelLineStyle,
    getPieSliceStyle,
    getTooltipStyle,
    PieChartLegendLabelMaxLengthDefault,
    PieChartTooltipLabelMaxLength,
    resolveGranularityInLabel,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { type EChartsOption, type PieSeriesOption } from 'echarts';
import { getLegendDoubleClickTooltip } from '../cartesian/legendTooltip';
import { sanitizeEchartsFontFamily } from '../fonts';
import { type VisualizationTheme } from '../theme';
import { type VisualizationContextInput } from '../types';
import { type PieChartBuilderConfig } from './config';

export type PieSeriesDataPoint = NonNullable<
    PieSeriesOption['data']
>[number] & {
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

export type PieEchartsOptionInput = VisualizationContextInput & {
    /** The editor's pie config and its derivations; see `resolvePieChartConfig`. */
    pieChartConfig: PieChartBuilderConfig | undefined;
    getGroupColor: (groupPrefix: string, identifier: string) => string;
    theme: VisualizationTheme;
    /** Legend entries the viewer toggled off, by slice name. */
    legendSelected?: Record<string, boolean>;
};

/**
 * Builds the ECharts option for a pie or donut chart, or undefined when
 * there is nothing to draw: no fields, no selected metric, or no slices.
 */
export const buildPieEchartsOption = ({
    pieChartConfig: chartConfig,
    itemsMap,
    getGroupColor,
    minimal,
    parameters,
    isTouchDevice,
    resolvedTimezone,
    theme,
    legendSelected: selectedLegends,
    isInDashboard,
}: PieEchartsOptionInput) => {
    const seriesData = (() => {
        if (!chartConfig) return undefined;

        const {
            selectedMetric,
            data,
            sortedGroupLabels,
            groupFieldIds,
            validConfig: {
                isDonut,
                valueLabel: valueLabelDefault,
                showValue: showValueDefault,
                showPercentage: showPercentageDefault,
                valueLabelColor: valueLabelColorDefault,
                groupLabelOverrides,
                groupValueOptionOverrides,
                groupColorOverrides,
            },
        } = chartConfig;

        if (!selectedMetric) return undefined;

        const granularityMap = getGranularityMapFromItems(itemsMap);

        // Calculate total for percentage calculation
        const total = data.reduce((sum, { value }) => sum + value, 0);

        return [...data]
            .sort(
                ({ name: nameA }, { name: nameB }) =>
                    sortedGroupLabels.indexOf(nameA) -
                    sortedGroupLabels.indexOf(nameB),
            )
            .map(({ name, value, meta }) => {
                const valueLabel =
                    groupValueOptionOverrides?.[name]?.valueLabel ??
                    valueLabelDefault;
                const showValue =
                    groupValueOptionOverrides?.[name]?.showValue ??
                    showValueDefault;
                const showPercentage =
                    groupValueOptionOverrides?.[name]?.showPercentage ??
                    showPercentageDefault;
                const valueLabelColor =
                    groupValueOptionOverrides?.[name]?.valueLabelColor ??
                    valueLabelColorDefault;

                // Use all group field IDs as the group prefix for color assignment:
                const groupPrefix = groupFieldIds.join('_');
                const itemColor =
                    groupColorOverrides?.[name] ??
                    getGroupColor(groupPrefix, name);

                // Calculate percentage for this slice
                const percent = (value / total) * 100;

                const borderRadius = isDonut
                    ? calculateBorderRadiusForSlice(percent)
                    : 0;
                const labelOverride = groupLabelOverrides?.[name] ?? name;
                const config: PieSeriesDataPoint = {
                    id: name,
                    groupId: name,
                    name:
                        resolveGranularityInLabel(
                            labelOverride,
                            granularityMap,
                        ) ?? labelOverride,
                    value,
                    itemStyle: {
                        color: itemColor,
                        borderRadius,
                    },
                    label: {
                        show: valueLabel !== 'hidden',
                        position:
                            valueLabel === 'outside' ? 'outside' : 'inside',
                        ...(valueLabel === 'outside'
                            ? getPieExternalLabelStyle(
                                  valueLabelColor ?? itemColor,
                              )
                            : getPieInternalLabelStyle(
                                  itemColor,
                                  valueLabelColor,
                              )),
                        formatter: (params) => {
                            const isOutside = valueLabel === 'outside';

                            if (valueLabel === 'hidden') return '';

                            // For outside labels, use rich text formatting
                            if (isOutside) {
                                if (showValue && showPercentage) {
                                    return `{name|${params.name}: }{value|${params.percent}% - ${meta.value.formatted}}`;
                                } else if (showValue) {
                                    return `{name|${params.name}: }{value|${meta.value.formatted}}`;
                                } else if (showPercentage) {
                                    return `{name|${params.name}: }{value|${params.percent}%}`;
                                } else {
                                    return `{name|${params.name}}`;
                                }
                            }

                            // For inside labels, use plain formatting (no rich text)
                            // Always show name alongside value/percentage
                            return showValue && showPercentage
                                ? `${params.name}: ${params.percent}% - ${meta.value.formatted}`
                                : showValue
                                  ? `${params.name}: ${meta.value.formatted}`
                                  : showPercentage
                                    ? `${params.name}: ${params.percent}%`
                                    : `${params.name}`;
                        },
                    },
                    labelLine: getPieLabelLineStyle(),
                    meta,
                };

                return config;
            });
    })();

    const pieSeriesOption: PieSeriesOption | undefined = (() => {
        if (!chartConfig) return undefined;

        const {
            validConfig: {
                isDonut,
                valueLabel: valueLabelDefault,
                showValue: showValueDefault,
                showPercentage: showPercentageDefault,
                showLegend,
                legendPosition,
            },
            selectedMetric,
        } = chartConfig;

        return {
            type: 'pie',
            data: seriesData,
            radius: isDonut ? ['30%', '70%'] : '70%',
            center:
                legendPosition === 'horizontal'
                    ? showLegend &&
                      valueLabelDefault === 'outside' &&
                      (showValueDefault || showPercentageDefault)
                        ? ['50%', '55%']
                        : showLegend
                          ? ['50%', '52%']
                          : ['50%', '50%']
                    : ['50%', '50%'],
            ...getPieSliceStyle(!!isDonut),
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    const { color, name, value, percent } = params;
                    const formattedValue = formatItemValue(
                        selectedMetric,
                        value,
                        false,
                        parameters,
                        resolvedTimezone,
                    );

                    const truncatedName =
                        name.length > PieChartTooltipLabelMaxLength
                            ? `${name.slice(
                                  0,
                                  PieChartTooltipLabelMaxLength,
                              )}...`
                            : name;

                    const colorIndicator = formatColorIndicator(
                        color as string,
                    );
                    const label = formatTooltipLabel(truncatedName);
                    const valueWithPercent = `${percent}% - ${formattedValue}`;
                    const valuePill = formatTooltipValue(valueWithPercent);

                    return formatTooltipRow(colorIndicator, label, valuePill);
                },
            },
        };
    })();

    const legendDoubleClickTooltip = getLegendDoubleClickTooltip(theme);

    const eChartsOption: EChartsOption | undefined = (() => {
        if (!chartConfig || !pieSeriesOption) return undefined;

        const {
            validConfig: { showLegend, legendPosition, legendMaxItemLength },
        } = chartConfig;

        return {
            textStyle: {
                fontFamily: sanitizeEchartsFontFamily(theme.chartFont),
            },
            legend: {
                show: showLegend,
                orient: legendPosition,
                type: 'scroll',
                ...getLegendStyle('square'),
                formatter: (name: string) => {
                    return name.length >
                        (legendMaxItemLength ??
                            PieChartLegendLabelMaxLengthDefault)
                        ? `${name.slice(
                              0,
                              legendMaxItemLength ??
                                  PieChartLegendLabelMaxLengthDefault,
                          )}...`
                        : name;
                },
                tooltip: legendDoubleClickTooltip,
                selected: selectedLegends,
                ...(legendPosition === 'vertical'
                    ? {
                          left: 'left',
                          top: 'middle',
                          align: 'left',
                      }
                    : {
                          left: 'center',
                          top: 'top',
                          align: 'auto',
                      }),
            },
            tooltip: {
                trigger: 'item',
                ...getTooltipStyle({ appendToBody: !isTouchDevice }),
            },
            series: [pieSeriesOption],
            animation: !(isInDashboard || minimal),
        };
    })();

    if (!itemsMap) return undefined;
    if (!eChartsOption || !pieSeriesOption) return undefined;
    if (!seriesData || seriesData.length === 0) return undefined;

    return { eChartsOption, pieSeriesOption };
};

export type PieEchartsOption = NonNullable<
    ReturnType<typeof buildPieEchartsOption>
>;
