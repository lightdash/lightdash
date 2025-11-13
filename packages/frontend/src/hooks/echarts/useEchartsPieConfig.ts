import {
    calculateBorderRadiusForSlice,
    formatColorIndicator,
    formatItemValue,
    formatTooltipLabel,
    formatTooltipRow,
    formatTooltipValue,
    getLegendStyle,
    getPieExternalLabelStyle,
    getPieInternalLabelStyle,
    getPieLabelLineStyle,
    getPieSliceStyle,
    getTooltipStyle,
    PieChartLegendLabelMaxLengthDefault,
    PieChartTooltipLabelMaxLength,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type PieSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isPieVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useLegendDoubleClickTooltip } from './useLegendDoubleClickTooltip';
export type PieSeriesDataPoint = NonNullable<
    PieSeriesOption['data']
>[number] & {
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

const useEchartsPieConfig = (
    selectedLegends?: Record<string, boolean>,
    isInDashboard?: boolean,
) => {
    const {
        visualizationConfig,
        itemsMap,
        getGroupColor,
        minimal,
        parameters,
    } = useVisualizationContext();

    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isPieVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const seriesData = useMemo(() => {
        if (!chartConfig) return;

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
                groupLabelOverrides,
                groupValueOptionOverrides,
                groupColorOverrides,
            },
        } = chartConfig;

        if (!selectedMetric) return;

        // Calculate total for percentage calculation
        const total = data.reduce((sum, { value }) => sum + value, 0);

        return data
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
                const config: PieSeriesDataPoint = {
                    id: name,
                    groupId: name,
                    name: groupLabelOverrides?.[name] ?? name,
                    value: value,
                    itemStyle: {
                        color: itemColor,
                        borderRadius,
                    },
                    label: {
                        show: valueLabel !== 'hidden',
                        position:
                            valueLabel === 'outside' ? 'outside' : 'inside',
                        ...(valueLabel === 'outside'
                            ? getPieExternalLabelStyle()
                            : getPieInternalLabelStyle()),
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
    }, [chartConfig, getGroupColor]);

    const pieSeriesOption: PieSeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

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
    }, [chartConfig, seriesData, parameters]);

    const { tooltip: legendDoubleClickTooltip } = useLegendDoubleClickTooltip();

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !pieSeriesOption) return;

        const {
            validConfig: { showLegend, legendPosition, legendMaxItemLength },
        } = chartConfig;

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
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
                ...getTooltipStyle(),
            },
            series: [pieSeriesOption],
            animation: !(isInDashboard || minimal),
        };
    }, [
        chartConfig,
        pieSeriesOption,
        theme?.other?.chartFont,
        legendDoubleClickTooltip,
        selectedLegends,
        isInDashboard,
        minimal,
    ]);

    if (!itemsMap) return;
    if (!eChartsOption || !pieSeriesOption) return;

    return { eChartsOption, pieSeriesOption };
};

export default useEchartsPieConfig;
