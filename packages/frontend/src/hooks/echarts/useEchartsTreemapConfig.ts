import {
    formatCartesianTooltipRow,
    formatColorIndicator,
    formatItemValue,
    formatTooltipHeader,
    formatTooltipValue,
    getItemLabelWithoutTableName,
    getReadableTextColor,
    getTooltipDivider,
    getTooltipStyle,
    vizThemeColors,
} from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type EChartsOption, type TreemapSeriesOption } from 'echarts';
import { useMemo } from 'react';
import { isTreemapVisualizationConfig } from '../../components/LightdashVisualization/types';
import { useVisualizationContext } from '../../components/LightdashVisualization/useVisualizationContext';

const EchartsTreemapType = 'treemap';

const useEchartsTreemapConfig = (isInDashboard: boolean) => {
    const { visualizationConfig, itemsMap, colorPalette, parameters } =
        useVisualizationContext();
    const theme = useMantineTheme();

    const chartConfig = useMemo(() => {
        if (!isTreemapVisualizationConfig(visualizationConfig)) return;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const treemapSeriesOption: TreemapSeriesOption | undefined = useMemo(() => {
        if (!chartConfig) return;

        const getMetricDisplayName = (metricId: string) => {
            if (!itemsMap) return metricId;
            const metricItem = itemsMap[metricId];
            if (!metricItem) return metricId;
            return getItemLabelWithoutTableName(metricItem);
        };

        const getMetricDisplayValue = (metricId: string, value: any) => {
            return formatItemValue(
                itemsMap?.[metricId],
                value,
                false,
                parameters,
            );
        };

        const getStyledMetricDisplay = (
            metricId: string,
            value: any,
            color: string,
        ) => {
            const label = getMetricDisplayName(metricId);
            const formattedValue = getMetricDisplayValue(metricId, value);
            const valuePill = formatTooltipValue(formattedValue);
            const colorIndicator = formatColorIndicator(color);
            return formatCartesianTooltipRow(colorIndicator, label, valuePill);
        };

        const {
            validConfig: { visibleMin, leafDepth },
            sizeMetricId,
            colorMetricId,
            startColor,
            endColor,
            startColorThreshold,
            endColorThreshold,
            groupFieldIds,
            data,
        } = chartConfig;

        let levels = groupFieldIds?.map((fieldId, index) => ({
            itemStyle: {
                borderColor:
                    theme.colors.ldGray[index % theme.colors.ldGray.length],
                borderRadius: 4,
            },
        }));
        if (levels && levels.length > 0) {
            levels = levels.slice(0, levels.length - 1);
        } else {
            levels = [];
        }
        let visualMin = undefined;
        let visualMax = undefined;
        if (
            Number.isFinite(startColorThreshold) &&
            Number.isFinite(endColorThreshold)
        ) {
            visualMin = startColorThreshold;
            visualMax = endColorThreshold;
        }

        const customColors =
            startColor && endColor ? [startColor, endColor] : undefined;

        return {
            name: 'All',
            type: EchartsTreemapType,
            visibleMin,
            leafDepth: leafDepth ? leafDepth : undefined,
            visualDimension: 1,
            visualMin,
            visualMax,
            itemStyle: {
                borderColor: 'transparent',
                gapWidth: 4,
                borderRadius: 4,
            },
            upperLabel: {
                show: true,
                height: 30,
                formatter: '{b}',
                padding: [4, 8],
                color: vizThemeColors.GRAY_9,
            },
            label: {
                show: true,
                formatter: (params) => {
                    const { name, color } = params;
                    // Get adaptive text color based on background
                    const textColor =
                        typeof color === 'string'
                            ? getReadableTextColor(color)
                            : 'white';
                    return `{${textColor}|${name}}`;
                },
                rich: {
                    white: {
                        color: 'white',
                    },
                    black: {
                        color: 'black',
                    },
                },
            },
            tooltip: {
                formatter: (info) => {
                    const { name, value, color } = info;
                    if (!value || !Array.isArray(value) || !sizeMetricId)
                        return formatTooltipHeader(name);

                    const segmentColor =
                        typeof color === 'string'
                            ? color
                            : theme.colors.ldGray[6];
                    const header = formatTooltipHeader(name);
                    const divider = getTooltipDivider();
                    const sizeMetricDisplay = getStyledMetricDisplay(
                        sizeMetricId,
                        value[0],
                        segmentColor,
                    );
                    const colorMetricDisplay =
                        colorMetricId &&
                        value.length > 1 &&
                        value[1] !== undefined
                            ? getStyledMetricDisplay(
                                  colorMetricId,
                                  value[1],
                                  segmentColor,
                              )
                            : '';

                    return `${header}${divider}${sizeMetricDisplay}${colorMetricDisplay}`;
                },
            },
            color: colorMetricId === null ? colorPalette : customColors,
            colorMappingBy: colorMetricId === null ? 'index' : 'value',
            levels: [
                {
                    upperLabel: {
                        show: false,
                    },
                    itemStyle: {
                        borderRadius: 4,
                    },
                    color: colorMetricId === null ? colorPalette : customColors, // The global color setting doesn't work for the first level.
                    colorMappingBy: colorMetricId === null ? 'index' : 'value',
                },
                ...levels,
            ],
            data: data || [],
        };
    }, [chartConfig, theme, itemsMap, colorPalette, parameters]);

    const eChartsOption: EChartsOption | undefined = useMemo(() => {
        if (!chartConfig || !treemapSeriesOption) return;

        return {
            textStyle: {
                fontFamily: theme?.other?.chartFont as string | undefined,
            },
            tooltip: {
                ...getTooltipStyle(),
                trigger: 'item' as const, //Even though this is the default, tooltips will not show up if this is not set.
            },
            series: [treemapSeriesOption],
            animation: !isInDashboard,
        };
    }, [
        chartConfig,
        treemapSeriesOption,
        isInDashboard,
        theme?.other?.chartFont,
    ]);
    if (!itemsMap) return;
    if (!eChartsOption || !treemapSeriesOption) return;

    return { eChartsOption, treemapSeriesOption };
};

export default useEchartsTreemapConfig;
