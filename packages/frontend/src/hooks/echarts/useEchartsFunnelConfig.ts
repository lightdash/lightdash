import {
    formatColorIndicator,
    formatItemValue,
    formatTooltipRow,
    formatTooltipValue,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    getLegendStyle,
    getReadableTextColor,
    getTooltipStyle,
    type Metric,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type FunnelSeriesOption } from 'echarts';
import round from 'lodash/round';
import { useMemo } from 'react';
import { isFunnelVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';
import { useLegendDoubleClickTooltip } from './useLegendDoubleClickTooltip';

export type FunnelSeriesDataPoint = NonNullable<
    FunnelSeriesOption['data']
>[number] & {
    id: string;
    name: string;
    value: number;
    meta: {
        value: ResultValue;
        rows: ResultRow[];
    };
};

const getValueAndPercentage = ({
    field,
    value,
    maxValue,
    parameters,
}: {
    field?: TableCalculation | Metric;
    value: any;
    maxValue: number;
    parameters?: Record<string, unknown>;
}) => {
    const formattedValue = formatItemValue(field, value, false, parameters);

    const percentOfMax = round((Number(value) / maxValue) * 100, 2);
    return { formattedValue, percentOfMax };
};

const useEchartsFunnelConfig = (
    selectedLegends?: Record<string, boolean>,
    isInDashboard?: boolean,
) => {
    const { visualizationConfig, itemsMap, colorPalette, parameters } =
        useVisualizationContext();

    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isFunnelVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const seriesData = useMemo(() => {
        if (!chartConfig) return;

        const {
            data,
            validConfig: {},
        } = chartConfig;

        return data.length > 0 ? data : undefined;
    }, [chartConfig]);

    const funnelSeriesOptions: FunnelSeriesOption | undefined = useMemo(() => {
        if (!chartConfig || !seriesData) return;

        const {
            validConfig: {
                labelOverrides,
                colorOverrides,
                showLegend,
                legendPosition,
            },
            selectedField,
            labels,
            colorDefaults,
        } = chartConfig;

        return {
            type: 'funnel',
            gap: 3,
            data: seriesData.map(({ id, name, value, meta }) => {
                return {
                    name: labelOverrides?.[id] ?? name,
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
                            maxValue: chartConfig.maxValue,
                            parameters,
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
                        ? theme.colors.foreground[0]
                        : undefined,
                formatter: ({ name, value }) => {
                    const { formattedValue, percentOfMax } =
                        getValueAndPercentage({
                            field: selectedField,
                            value,
                            maxValue: chartConfig.maxValue,
                            parameters,
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
    }, [
        chartConfig,
        colorPalette,
        seriesData,
        parameters,
        theme.colors.foreground,
    ]);

    const { tooltip: legendDoubleClickTooltip } = useLegendDoubleClickTooltip();

    const legendConfigWithTooltip = useMemo(() => {
        if (!chartConfig) return undefined;

        const {
            validConfig: { showLegend, legendPosition },
        } = chartConfig;

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
    }, [chartConfig, legendDoubleClickTooltip, selectedLegends]);

    const eChartsOptions: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !funnelSeriesOptions || !seriesData) return;

        const baseOptions = {
            textStyle: {
                fontFamily: theme?.other.chartFont as string | undefined,
            },
            tooltip: {
                ...getTooltipStyle(),
                trigger: 'item' as const,
            },
            series: [funnelSeriesOptions],
            animation: !isInDashboard,
        };

        return {
            ...baseOptions,
            legend: legendConfigWithTooltip,
        };
    }, [
        chartConfig,
        funnelSeriesOptions,
        seriesData,
        isInDashboard,
        theme,
        legendConfigWithTooltip,
    ]);

    if (!itemsMap) return;
    if (!eChartsOptions) return;

    return eChartsOptions;
};

export default useEchartsFunnelConfig;
